import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { notify, showPopup } from '../lib/telegram';
import { RESPONSE_STATUSES, formatDate } from '../lib/constants';

const ACTIONS = [
  { value: 'viewed', label: 'Просмотрено' },
  { value: 'invited', label: 'Пригласить' },
  { value: 'rejected', label: 'Отказать' },
];

export default function ReceivedResponses() {
  const navigate = useNavigate();
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiFetch('/api/my/received-responses');
      setResponses(d.responses || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (resp, status) => {
    if (busyId) return;
    setBusyId(resp.id);
    try {
      await apiFetch(`/api/responses/${resp.id}/status`, { method: 'PATCH', body: { status } });
      notify('success');
      setResponses((list) => list.map((r) => (r.id === resp.id ? { ...r, status } : r)));
    } catch (e) {
      notify('error');
      showPopup('Ошибка', e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <h1>Отклики на мои вакансии</h1>
      <p className="page__subtitle">Всего: {responses.length}</p>

      {loading && <p className="empty">Загрузка…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && responses.length === 0 && (
        <p className="empty">Пока никто не откликнулся на ваши вакансии.</p>
      )}

      <div className="job-list">
        {responses.map((r) => {
          const applicant = r.applicant;
          const name = [applicant?.first_name, applicant?.last_name].filter(Boolean).join(' ') || 'Соискатель';
          return (
            <article key={r.id} className="job-card">
              <div className="job-card__head">
                <h3 className="job-card__title">{name}</h3>
                <span className="badge">{RESPONSE_STATUSES[r.status] || r.status}</span>
              </div>
              <p className="job-card__meta">
                {applicant?.username ? `@${applicant.username} · ` : ''}
                {formatDate(r.created_at)}
              </p>
              {r.job && (
                <p className="job-card__meta job-card__meta--small">
                  Вакансия:{' '}
                  <button type="button" className="link" onClick={() => navigate(`/job/${r.job.id}`)}>
                    {r.job.title}
                  </button>
                </p>
              )}
              {r.contact && <p className="job-card__meta">Контакт: {r.contact}</p>}
              {r.cover_letter && (
                <section className="section">
                  <h2>Сопроводительное письмо</h2>
                  <p className="pre-wrap">{r.cover_letter}</p>
                </section>
              )}

              <div className="admin-actions">
                {ACTIONS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    className={'btn btn--sm ' + (a.value === 'invited' ? 'btn--primary' : 'btn--secondary')}
                    disabled={busyId === r.id || r.status === a.value}
                    onClick={() => setStatus(r, a.value)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
