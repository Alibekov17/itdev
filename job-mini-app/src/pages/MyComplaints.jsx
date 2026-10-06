import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { COMPLAINT_REASONS, COMPLAINT_STATUSES, formatDate, statusLabel } from '../lib/constants';

function reasonLabel(value) {
  return COMPLAINT_REASONS.find((r) => r.value === value)?.label || value;
}

export default function MyComplaints() {
  const navigate = useNavigate();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await apiFetch('/api/my/complaints');
        if (alive) setComplaints(d.complaints || []);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="page">
      <h1>Мои жалобы</h1>
      <p className="page__subtitle">Всего: {complaints.length}</p>

      {loading && <p className="empty">Загрузка…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && complaints.length === 0 && (
        <p className="empty">Вы пока не отправляли жалоб.</p>
      )}

      <div className="job-list">
        {complaints.map((c) => (
          <article key={c.id} className="job-card">
            <div className="job-card__head">
              <h3 className="job-card__title">{reasonLabel(c.reason)}</h3>
              <span className="badge">{statusLabel(COMPLAINT_STATUSES, c.status)}</span>
            </div>
            {c.job && (
              <p className="job-card__meta">
                <button type="button" className="link" onClick={() => navigate(`/job/${c.job.id}`)}>
                  {c.job.title}
                </button>
              </p>
            )}
            <p className="job-card__meta job-card__meta--small">Отправлена {formatDate(c.created_at)}</p>
            {c.message && <p className="pre-wrap">{c.message}</p>}
            {c.admin_reply && (
              <p className="job-card__meta job-card__meta--small">Ответ администратора: {c.admin_reply}</p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
