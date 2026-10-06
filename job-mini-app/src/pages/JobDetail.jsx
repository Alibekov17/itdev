import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { getTelegram, haptic, notify, showPopup } from '../lib/telegram';
import { useAuth } from '../context/AuthContext';
import {
  formatSalary,
  formatDate,
  labelOf,
  EXPERIENCES,
  EMPLOYMENT_TYPES,
  SCHEDULES,
  COMPLAINT_REASONS,
} from '../lib/constants';

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [job, setJob] = useState(null);
  const [author, setAuthor] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [coverLetter, setCoverLetter] = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);

  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch(`/api/jobs/${id}`);
        if (!alive) return;
        setJob(data.job);
        setAuthor(data.job.author);
        setIsOwner(data.isOwner);
        setHasResponded(data.hasResponded);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const canRespond =
    Boolean(profile?.is_registered) && job?.status === 'published' && !isOwner && !hasResponded;

  const respond = async () => {
    if (!canRespond || sending) return;
    setSending(true);
    haptic('medium');
    try {
      await apiFetch(`/api/jobs/${job.id}/respond`, {
        method: 'POST',
        body: { cover_letter: coverLetter, contact },
      });
      setHasResponded(true);
      notify('success');
      showPopup('Готово', 'Отклик отправлен!');
    } catch (e) {
      notify('error');
      showPopup('Ошибка', e.message);
    } finally {
      setSending(false);
    }
  };

  const sendReport = async () => {
    if (reporting || !reportReason) return;
    setReporting(true);
    try {
      await apiFetch('/api/complaints', {
        method: 'POST',
        body: { job_id: job.id, reason: reportReason, message: reportMessage },
      });
      notify('success');
      setReported(true);
      setShowReport(false);
      showPopup('Жалоба отправлена', 'Спасибо! Модератор рассмотрит обращение.');
    } catch (e) {
      notify('error');
      showPopup('Ошибка', e.message);
    } finally {
      setReporting(false);
    }
  };

  const share = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const text = `${job.title} — ${job.company}`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    const tg = getTelegram();
    haptic('light');
    if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
    else window.open(shareUrl, '_blank');
  };

  // Нативные кнопки Telegram.
  const respondRef = useRef(respond);
  respondRef.current = respond;

  useEffect(() => {
    const tg = getTelegram();
    if (!tg || !job) return;

    tg.BackButton.show();
    const back = () => navigate(-1);
    tg.BackButton.onClick(back);

    if (canRespond) {
      tg.MainButton.setText(sending ? 'Отправляем…' : 'Откликнуться');
      tg.MainButton.show();
    } else {
      tg.MainButton.hide();
    }
    const onMain = () => respondRef.current();
    tg.MainButton.onClick(onMain);

    return () => {
      tg.BackButton.offClick(back);
      tg.BackButton.hide();
      tg.MainButton.offClick(onMain);
      tg.MainButton.hide();
    };
  }, [job, canRespond, sending, navigate]);

  if (loading) return <p className="empty">Загружаем вакансию…</p>;
  if (error || !job) {
    return (
      <div className="page">
        <p className="empty">{error || 'Вакансия не найдена.'}</p>
        <button type="button" className="btn btn--primary" onClick={() => navigate('/')}>
          К списку вакансий
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      {job.status !== 'published' && <span className="badge badge--warn">{job.status === 'pending_payment' ? 'Ожидает оплаты' : job.status}</span>}

      <h1 className="job-detail__title">{job.title}</h1>
      <p className="job-detail__salary">{formatSalary(job)}</p>
      <p className="job-card__meta">
        {job.company}
        {' · '}
        {job.is_remote ? 'Удалённо' : job.city || 'Город не указан'}
      </p>

      <div className="facts">
        <div className="fact">
          <span className="fact__label">Опыт</span>
          <span className="fact__value">{labelOf(EXPERIENCES, job.experience) || '—'}</span>
        </div>
        <div className="fact">
          <span className="fact__label">Занятость</span>
          <span className="fact__value">{labelOf(EMPLOYMENT_TYPES, job.employment_type) || '—'}</span>
        </div>
        <div className="fact">
          <span className="fact__label">График</span>
          <span className="fact__value">{labelOf(SCHEDULES, job.schedule) || '—'}</span>
        </div>
        <div className="fact">
          <span className="fact__label">Просмотры</span>
          <span className="fact__value">{job.views ?? 0}</span>
        </div>
      </div>

      {job.skills?.length > 0 && (
        <div className="job-card__tags">
          {job.skills.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}

      <section className="section">
        <h2>Описание</h2>
        <p className="pre-wrap">{job.description}</p>
      </section>

      {job.responsibilities && (
        <section className="section">
          <h2>Обязанности</h2>
          <p className="pre-wrap">{job.responsibilities}</p>
        </section>
      )}

      {job.requirements && (
        <section className="section">
          <h2>Требования</h2>
          <p className="pre-wrap">{job.requirements}</p>
        </section>
      )}

      {job.conditions && (
        <section className="section">
          <h2>Условия</h2>
          <p className="pre-wrap">{job.conditions}</p>
        </section>
      )}

      {(job.contact || job.contact_email || job.contact_phone) && (
        <section className="section">
          <h2>Контакты</h2>
          {job.contact && <p>Контактное лицо: {job.contact}</p>}
          {job.contact_email && <p>Email: {job.contact_email}</p>}
          {job.contact_phone && <p>Телефон: {job.contact_phone}</p>}
        </section>
      )}

      <p className="page__subtitle">
        Автор: {author ? [author.first_name, author.last_name].filter(Boolean).join(' ') || author.username : 'неизвестен'}
        {job.published_at ? ` · Опубликовано ${formatDate(job.published_at)}` : ''}
      </p>

      <div className="admin-actions">
        <button type="button" className="btn btn--secondary btn--sm" onClick={share}>
          📤 Поделиться
        </button>
        {isOwner && (
          <>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => navigate(`/edit/${job.id}`)}>
              Редактировать
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => navigate('/received')}>
              Отклики
            </button>
          </>
        )}
      </div>

      {profile?.is_registered && !isOwner && job.status === 'published' && !reported && (
        <div className="report">
          {!showReport ? (
            <button type="button" className="link" onClick={() => setShowReport(true)}>
              🚩 Пожаловаться на вакансию
            </button>
          ) : (
            <section className="section">
              <h2>Жалоба на вакансию</h2>
              <label className="field">
                <span>Причина *</span>
                <select value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                  <option value="">Выберите причину</option>
                  {COMPLAINT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Комментарий</span>
                <textarea
                  rows={3}
                  value={reportMessage}
                  onChange={(e) => setReportMessage(e.target.value)}
                  placeholder="Опишите проблему"
                />
              </label>
              <div className="admin-actions">
                <button
                  type="button"
                  className="btn btn--danger btn--sm"
                  disabled={reporting || !reportReason}
                  onClick={sendReport}
                >
                  {reporting ? 'Отправляем…' : 'Отправить жалобу'}
                </button>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => setShowReport(false)}>
                  Отмена
                </button>
              </div>
            </section>
          )}
        </div>
      )}
      {reported && <p className="badge badge--ok">Жалоба отправлена модератору</p>}

      {canRespond && (
        <section className="section">
          <h2>Отклик</h2>
          <label className="field">
            <span>Сопроводительное письмо</span>
            <textarea
              rows={4}
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              placeholder="Почему вы подходите на эту вакансию"
            />
          </label>
          <label className="field">
            <span>Контакт для связи</span>
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="@username или телефон" />
          </label>
          {/* Вне Telegram нативной MainButton нет — показываем обычную кнопку. */}
          {!getTelegram()?.initData && (
            <button type="button" className="btn btn--primary" onClick={respond} disabled={sending}>
              {sending ? 'Отправляем…' : 'Откликнуться'}
            </button>
          )}
        </section>
      )}

      {hasResponded && <p className="badge badge--ok">Вы уже откликнулись</p>}
      {isOwner && <p className="badge">Это ваша вакансия</p>}
      {!profile && <p className="empty">Откликаться можно только из Telegram.</p>}
      {profile && !profile.is_registered && !isOwner && job.status === 'published' && (
        <div className="notice">
          <p>Чтобы откликнуться, завершите регистрацию в приложении.</p>
          <button type="button" className="btn btn--primary" onClick={() => navigate('/register')}>
            Зарегистрироваться
          </button>
        </div>
      )}
    </div>
  );
}
