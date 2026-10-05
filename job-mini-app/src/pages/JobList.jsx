import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { EMPLOYMENT_TYPES, EXPERIENCES, SCHEDULES, POPULAR_CITIES } from '../lib/constants';
import JobCard from '../components/JobCard';

const EMPTY_FILTERS = {
  city: '',
  remote: false,
  experience: '',
  employment_type: '',
  schedule: '',
  salary_from: '',
  sort: 'date',
};

export default function JobList() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/jobs', {
        query: {
          q,
          city: filters.city,
          remote: filters.remote ? 'true' : '',
          experience: filters.experience,
          employment_type: filters.employment_type,
          schedule: filters.schedule,
          salary_from: filters.salary_from,
          sort: filters.sort,
        },
      });
      setJobs(data.jobs || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, filters]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const activeCount = Object.entries(filters).filter(
    ([key, value]) => key !== 'sort' && value !== '' && value !== false
  ).length;

  return (
    <div className="page">
      <header className="page__header">
        <h1>Вакансии</h1>
        <p className="page__subtitle">{loading ? 'Загрузка…' : `Найдено: ${total}`}</p>
      </header>

      <div className="searchbar">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Профессия, компания, навык"
          className="searchbar__input"
        />
        <button
          type="button"
          className={'searchbar__filter' + (activeCount ? ' is-active' : '')}
          onClick={() => setShowFilters((v) => !v)}
        >
          Фильтры{activeCount ? ` (${activeCount})` : ''}
        </button>
      </div>

      <div className="chips">
        <button
          type="button"
          className={'chip' + (filters.remote ? ' is-active' : '')}
          onClick={() => setFilter('remote', !filters.remote)}
        >
          Удалёнка
        </button>
        {EXPERIENCES.map((exp) => (
          <button
            key={exp.value}
            type="button"
            className={'chip' + (filters.experience === exp.value ? ' is-active' : '')}
            onClick={() => setFilter('experience', filters.experience === exp.value ? '' : exp.value)}
          >
            {exp.label}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="filter-panel">
          <label className="field">
            <span>Город</span>
            <input
              list="cities"
              value={filters.city}
              onChange={(e) => setFilter('city', e.target.value)}
              placeholder="Начните вводить"
            />
            <datalist id="cities">
              {POPULAR_CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          <label className="field">
            <span>Тип занятости</span>
            <select value={filters.employment_type} onChange={(e) => setFilter('employment_type', e.target.value)}>
              <option value="">Любой</option>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>График</span>
            <select value={filters.schedule} onChange={(e) => setFilter('schedule', e.target.value)}>
              <option value="">Любой</option>
              {SCHEDULES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Зарплата от</span>
            <input
              type="number"
              inputMode="numeric"
              value={filters.salary_from}
              onChange={(e) => setFilter('salary_from', e.target.value)}
              placeholder="Например, 100000"
            />
          </label>

          <label className="field">
            <span>Сортировка</span>
            <select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}>
              <option value="date">Сначала новые</option>
              <option value="salary">Сначала с высокой зарплатой</option>
            </select>
          </label>

          <button type="button" className="btn btn--secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
            Сбросить фильтры
          </button>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="job-list">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} onOpen={(id) => navigate(`/job/${id}`)} />
        ))}
      </div>

      {!loading && !error && jobs.length === 0 && (
        <p className="empty">
          Вакансий пока нет. Станьте первым — нажмите «Разместить» и опубликуйте вакансию.
        </p>
      )}
    </div>
  );
}
