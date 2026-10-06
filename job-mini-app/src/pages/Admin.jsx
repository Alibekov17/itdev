import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { notify, showPopup } from '../lib/telegram';
import { formatSalary, statusLabel, JOB_STATUSES } from '../lib/constants';

const STATUS_FILTERS = [
  { value: '', label: 'Все' },
  { value: 'pending_payment', label: 'Ожидают оплаты' },
  { value: 'published', label: 'Опубликованные' },
  { value: 'archived', label: 'В архиве' },
  { value: 'rejected', label: 'Отклонённые' },
];

function StatCard({ label, value, accent }) {
  return (
    <div className={'stat' + (accent ? ' stat--accent' : '')}>
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const loadStats = useCallback(async () => {
    try {
      const d = await apiFetch('/api/admin/stats');
      setStats(d.stats);
    } catch {
      // статистика не критична
    }
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiFetch('/api/admin/jobs', { query: { status, q } });
      setJobs(d.jobs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const t = setTimeout(loadJobs, 300);
    return () => clearTimeout(t);
  }, [loadJobs]);

  const changeStatus = async (job, next) => {
    if (busyId) return;
    setBusyId(job.id);
    try {
      await apiFetch(`/api/admin/jobs/${job.id}`, { method: 'PATCH', body: { status: next } });
      notify('success');
      setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: next } : j)));
      loadStats();
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
    if (!window.confirm(`Удалить вакансию «${job.title}»? Это действие необратимо.`)) return;
    setBusyId(job.id);
    try {
      await apiFetch(`/api/admin/jobs/${job.id}`, { method: 'DELETE' });
      notify('success');
      setJobs((list) => list.filter((j) => j.id !== job.id));
      loadStats();
    } catch (e) {
      notify('error');
      showPopup('Ошибка', e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <h1>Админ-панель</h1>
      <p className="page__subtitle">Управление вакансиями и модерация</p>

      <div className="admin-links">
        <button type="button" className="btn btn--secondary" onClick={() => navigate('/admin/complaints')}>
          🚩 Жалобы{stats?.complaintsOpen ? ` (${stats.complaintsOpen})` : ''}
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => navigate('/admin/users')}>
          👥 Пользователи
        </button>
      </div>

      {stats && (
        <div className="stats-grid">
          <StatCard label="Пользователей" value={stats.users} />
          <StatCard label="Вакансий" value={stats.jobsTotal} />
          <StatCard label="Опубликовано" value={stats.jobsPublished} accent />
          <StatCard label="Ждут оплаты" value={stats.jobsPending} />
          <StatCard label="Откликов" value={stats.responses} />
          <StatCard label="Оплат Stars" value={stats.paymentsPaid} />
          <StatCard label="Жалоб всего" value={stats.complaintsTotal} />
          <StatCard label="Жалоб открыто" value={stats.complaintsOpen} accent />
        </div>
      )}

      <h2 className="form__section">Вакансии</h2>

      <div className="searchbar">
        <input
          type="search"
          className="searchbar__input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Название или компания"
        />
      </div>

      <div className="chips">
        {STATUS_FILTERS.map((f) => (
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
        {jobs.map((job) => (
          <article key={job.id} className="job-card">
            <div className="job-card__head">
              <h3 className="job-card__title" onClick={() => navigate(`/job/${job.id}`)}>
                {job.title}
              </h3>
              <span className="job-card__salary">{formatSalary(job)}</span>
            </div>
            <p className="job-card__meta">
              {job.company} · {job.is_remote ? 'Удалённо' : job.city || '—'}
            </p>
            <p className="job-card__meta job-card__meta--small">
              Автор: {job.author?.username ? `@${job.author.username}` : job.author_id} ·{' '}
              {statusLabel(JOB_STATUSES, job.status)}
            </p>

            <div className="admin-actions">
              {job.status !== 'published' && (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busyId === job.id}
                  onClick={() => changeStatus(job, 'published')}
                >
                  Опубликовать
                </button>
              )}
              {job.status === 'published' && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={busyId === job.id}
                  onClick={() => changeStatus(job, 'archived')}
                >
                  В архив
                </button>
              )}
              {job.status !== 'rejected' && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={busyId === job.id}
                  onClick={() => changeStatus(job, 'rejected')}
                >
                  Отклонить
                </button>
              )}
              <button
                type="button"
                className="btn btn--danger btn--sm"
                disabled={busyId === job.id}
                onClick={() => removeJob(job)}
              >
                Удалить
              </button>
            </div>
          </article>
        ))}
      </div>

      {!loading && !error && jobs.length === 0 && <p className="empty">Вакансий не найдено.</p>}
    </div>
  );
}
