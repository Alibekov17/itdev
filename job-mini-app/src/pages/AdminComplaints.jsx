import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { notify, showPopup } from '../lib/telegram';
import { COMPLAINT_REASONS, COMPLAINT_STATUSES, formatDate, statusLabel } from '../lib/constants';

const FILTERS = [
  { value: '', label: 'Все' },
  { value: 'open', label: 'Открытые' },
  { value: 'resolved', label: 'Решённые' },
  { value: 'rejected', label: 'Отклонённые' },
];

function reasonLabel(value) {
  return COMPLAINT_REASONS.find((r) => r.value === value)?.label || value;
}

export default function AdminComplaints() {
  const navigate = useNavigate();
  const [complaints, setComplaints] = useState([]);
  const [status, setStatus] = useState('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [replies, setReplies] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiFetch('/api/admin/complaints', { query: { status } });
      setComplaints(d.complaints || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const apply = async (complaint, nextStatus) => {
    if (busyId) return;
    setBusyId(complaint.id);
    try {
      const reply = replies[complaint.id];
      await apiFetch(`/api/admin/complaints/${complaint.id}`, {
        method: 'PATCH',
        body: {
          status: nextStatus,
          ...(reply !== undefined ? { admin_reply: reply } : {}),
        },
      });
      notify('success');
      load();
    } catch (e) {
      notify('error');
      showPopup('Ошибка', e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <h1>Жалобы</h1>
      <p className="page__subtitle">Модерация жалоб пользователей</p>

      <button type="button" className="btn btn--secondary" onClick={() => navigate('/admin')}>
        ← Назад в админ-панель
      </button>

      <div className="chips" style={{ marginTop: 12 }}>
        {FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            className={'chip' + (status === f.value ? ' is-active' : '')}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="empty">Загрузка…</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="job-list">
        {complaints.map((c) => (
          <article key={c.id} className="job-card">
            <div className="job-card__head">
              <h3 className="job-card__title">{reasonLabel(c.reason)}</h3>
              <span className="badge">{statusLabel(COMPLAINT_STATUSES, c.status)}</span>
            </div>

            <p className="job-card__meta job-card__meta--small">
              От:{' '}
              {c.reporter?.username
                ? `@${c.reporter.username}`
                : [c.reporter?.first_name, c.reporter?.last_name].filter(Boolean).join(' ') ||
                  c.reporter_id}{' '}
              · {formatDate(c.created_at)}
            </p>

            {c.job && (
              <p className="job-card__meta">
                Вакансия:{' '}
                <button type="button" className="link" onClick={() => navigate(`/job/${c.job.id}`)}>
                  {c.job.title}
                </button>{' '}
                · {c.job.company}
              </p>
            )}

            {c.message && <p className="pre-wrap">{c.message}</p>}

            {c.admin_reply && (
              <p className="job-card__meta job-card__meta--small">Ответ: {c.admin_reply}</p>
            )}

            <label className="field" style={{ marginTop: 10 }}>
              <span>Ответ пользователю</span>
              <textarea
                rows={2}
                value={replies[c.id] ?? c.admin_reply ?? ''}
                onChange={(e) => setReplies((r) => ({ ...r, [c.id]: e.target.value }))}
                placeholder="Комментарий администратора"
              />
            </label>

            <div className="admin-actions">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={busyId === c.id}
                onClick={() => apply(c, 'resolved')}
              >
                Решить
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={busyId === c.id}
                onClick={() => apply(c, 'rejected')}
              >
                Отклонить
              </button>
              {c.status !== 'open' && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={busyId === c.id}
                  onClick={() => apply(c, 'open')}
                >
                  Вернуть в работу
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {!loading && !error && complaints.length === 0 && <p className="empty">Жалоб нет.</p>}
    </div>
  );
}
