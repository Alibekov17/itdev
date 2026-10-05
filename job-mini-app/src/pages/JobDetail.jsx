import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { JOBS } from '../data/jobs';
import { getTelegram, haptic, saveResponse, isTelegram } from '../lib/telegram';
import { apiUrl } from '../lib/api';

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const job = JOBS.find((j) => String(j.id) === String(id));
  const [responded, setResponded] = useState(false);
  const inTelegram = isTelegram();

  const respond = () => {
    if (!job || responded) return;
    haptic('medium');
    const tg = getTelegram();

    // Отправляем отклик на бэкенд. initData подписан Telegram — backend его проверяет.
    fetch(apiUrl('/api/respond'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id, initData: tg?.initData ?? '' }),
    }).catch(() => {
      // Бэкенд может быть не запущен в dev — не блокируем пользователя.
    });

    saveResponse(job);
    setResponded(true);
    tg?.showPopup?.({ title: 'Готово', message: 'Отклик отправлен!' });
  };

  // Нативные кнопки Telegram: BackButton (шапка) и MainButton (низ экрана).
  useEffect(() => {
    const tg = getTelegram();
    if (!tg || !job) return;

    tg.BackButton.show();
    const goBack = () => navigate(-1);
    tg.BackButton.onClick(goBack);

    const onMain = () => respond();
    tg.MainButton.setText('Откликнуться');
    tg.MainButton.show();
    tg.MainButton.onClick(onMain);

    return () => {
      tg.BackButton.offClick(goBack);
      tg.BackButton.hide();
      tg.MainButton.offClick(onMain);
      tg.MainButton.hide();
    };
    // respond стабилен по смыслу; переподписываемся только при смене вакансии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, navigate]);

  useEffect(() => {
    const tg = getTelegram();
    if (!tg || !job || !responded) return;
    tg.MainButton.setText('Отклик отправлен');
    tg.MainButton.disable();
  }, [responded, job]);

  if (!job) {
    return (
      <div className="page">
        <p className="empty">Вакансия не найдена.</p>
        <button type="button" className="btn btn--primary" onClick={() => navigate('/')}>
          К списку вакансий
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="job-detail__title">{job.title}</h1>
      <p className="job-detail__salary">{job.salary}</p>
      <p className="job-card__meta">
        {job.company} · {job.city}
        {job.remote ? ' · Удалёнка' : ''}
        {job.experience ? ` · Опыт: ${job.experience}` : ''}
      </p>

      {job.tags?.length > 0 && (
        <div className="job-card__tags">
          {job.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}

      <p className="job-detail__desc">{job.description}</p>

      {/* Вне Telegram нативных кнопок нет — показываем обычную. */}
      {!inTelegram && (
        <button
          type="button"
          className="btn btn--primary"
          onClick={respond}
          disabled={responded}
          style={{ marginTop: 16, width: '100%' }}
        >
          {responded ? 'Отклик отправлен' : 'Откликнуться'}
        </button>
      )}
    </div>
  );
}
