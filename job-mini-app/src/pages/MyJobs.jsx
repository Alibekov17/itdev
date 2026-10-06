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

      if (data.alreadyPaid) {
        notify('success');
        showPopup('Оплачено', 'Вакансия уже опубликована.');
        load();
        return;
      }

      if (data.paymentsEnabled) {
        if (data.invoiceUrl && tg?.openInvoice) {
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
          showPopup('Ошибка', 'Не удалось создать счёт. Попробуйте позже.');
        }
        return;
      }

      // Demo-режим.
      await apiFetch(`/api/payments/${payment.id}/demo-confirm`, { method: 'POST' });
      notify('success');
      showPopup('Готово', 'Оплата (демо) подтверждена, вакансия опубликована.');
      load();
    } catch (e) {
      notify('error');
      showPopup('Ошибка', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const toggleArchive = async (job) => {
    if (busyId) return;
    const next = job.status === 'published' ? 'archived' : 'published';
    setBusyId(job.id);
    try {
      await apiFetch(`/api/my/jobs/${job.id}`, { method: 'PATCH', body: { status: next } });
      notify('success');
      setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: next } : j)));
    } catch (e) {
      notify('error');
      showPopup('Ошибка', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const removeJob = async (job) => {
    if (busyId) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Удалить вакансию «${job.title}»?`)) return;
    setBusyId(job.id);
    try {
      await apiFetch(`/api/my/jobs/${job.id}`, { method: 'DELETE' });
      notify('success');
      setJobs((list) => list.filter((j) => j.id !== job.id));
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

              {!pending && (
                <div className="admin-actions">
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/edit/${job.id}`);
                    }}
                  >
                    Редактировать
                  </button>
                  {job.status !== 'rejected' && (
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      disabled={busyId === job.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleArchive(job);
                      }}
                    >
                      {job.status === 'published' ? 'В архив' : 'Опубликовать'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    disabled={busyId === job.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeJob(job);
                    }}
                  >
                    Удалить
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
