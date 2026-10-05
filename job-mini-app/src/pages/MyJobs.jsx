import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { getTelegram, notify, showPopup } from '../lib/telegram';
import { formatSalary, JOB_STATUSES, labelOf } from '../lib/constants';

function firstPayment(job) {
  const p = job.payment;
  if (Array.isArray(p)) return p[0] || null;
  return p || null;
}

export default function MyJobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/my/jobs');
      setJobs(data.jobs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pay = async (job) => {
    const payment = firstPayment(job);
    if (!payment || busyId) return;
    setBusyId(job.id);
    try {
      const tg = getTelegram();
      const data = await apiFetch(`/api/payments/${payment.id}/invoice`, { method: 'POST' });

      if (data.paymentsEnabled && data.invoiceUrl && tg?.openInvoice) {
        tg.openInvoice(data.invoiceUrl, (status) => {
          if (status === 'paid') {
            notify('success');
            showPopup('Оплачено', 'Вакансия опубликована!');
            load();
          } else {
            showPopup('Оплата не завершена', 'Можно попробовать снова.');
          }
        });
      } else if (data.invoiceUrl) {
        window.open(data.invoiceUrl, '_blank');
      } else {
        await apiFetch(`/api/payments/${payment.id}/demo-confirm`, { method: 'POST' });
        notify('success');
        showPopup('Готово', 'Оплата (демо) подтверждена, вакансия опубликована.');
        load();
      }
    } catch (e) {
      notify('error');
      showPopup('Ошибка', e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <h1>Мои вакансии</h1>
      <p className="page__subtitle">Всего: {jobs.length}</p>

      {loading && <p className="empty">Загрузка…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && jobs.length === 0 && (
        <p className="empty">
          У вас пока нет вакансий.{' '}
          <button type="button" className="link" onClick={() => navigate('/create')}>
            Разместить первую
          </button>
        </p>
      )}

      <div className="job-list">
        {jobs.map((job) => {
          const payment = firstPayment(job);
          const pending = job.status === 'pending_payment';
          return (
            <article key={job.id} className="job-card" onClick={() => navigate(`/job/${job.id}`)}>
              <div className="job-card__head">
                <h3 className="job-card__title">{job.title}</h3>
                <span className="job-card__salary">{formatSalary(job)}</span>
              </div>
              <p className="job-card__meta">
                {job.company} · {job.is_remote ? 'Удалённо' : job.city || '—'}
              </p>
              <span className={'badge' + (job.status === 'published' ? ' badge--ok' : ' badge--warn')}>
                {labelOf(
                  Object.entries(JOB_STATUSES).map(([value, label]) => ({ value, label })),
                  job.status
                )}
              </span>
              {pending && payment && (
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ marginTop: 10, width: '100%' }}
                  disabled={busyId === job.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    pay(job);
                  }}
                >
                  {busyId === job.id ? 'Оплата…' : `Оплатить ${payment.amount} ⭐`}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
