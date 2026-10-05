import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { formatSalary, RESPONSE_STATUSES, formatDate } from '../lib/constants';

export default function MyResponses() {
  const navigate = useNavigate();
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await apiFetch('/api/my/responses');
        if (alive) setResponses(data.responses || []);
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
      <h1>Мои отклики</h1>
      <p className="page__subtitle">Всего: {responses.length}</p>

      {loading && <p className="empty">Загрузка…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && responses.length === 0 && (
        <p className="empty">Пока нет откликов. Откройте вакансию и нажмите «Откликнуться».</p>
      )}

      <div className="job-list">
        {responses.map((r) => (
          <article
            key={r.id}
            className="job-card"
            onClick={() => r.job && navigate(`/job/${r.job.id}`)}
          >
            <div className="job-card__head">
              <h3 className="job-card__title">{r.job?.title || 'Вакансия удалена'}</h3>
              {r.job && <span className="job-card__salary">{formatSalary(r.job)}</span>}
            </div>
            <p className="job-card__meta">
              {r.job?.company} {r.job?.is_remote ? '· Удалённо' : r.job?.city ? `· ${r.job.city}` : ''}
            </p>
            <p className="job-card__meta job-card__meta--small">
              Статус: {RESPONSE_STATUSES[r.status] || r.status} · {formatDate(r.created_at)}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
