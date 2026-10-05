import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { JOBS } from '../data/jobs';
import JobCard from '../components/JobCard';
import { saveResponse } from '../lib/telegram';

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'remote', label: 'Удалёнка' },
  { id: 'office', label: 'Офис' },
  { id: 'moscow', label: 'Москва' },
];

export default function JobList() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');

  const visible = useMemo(() => {
    return JOBS.filter((job) => {
      if (filter === 'remote') return job.remote;
      if (filter === 'office') return !job.remote;
      if (filter === 'moscow') return job.city === 'Москва';
      return true;
    });
  }, [filter]);

  const respond = (job) => {
    saveResponse(job);
    navigate('/responses');
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Вакансии</h1>
        <p className="page__subtitle">Найдено: {visible.length}</p>
      </header>

      <div className="chips">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={'chip' + (filter === f.id ? ' is-active' : '')}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="job-list">
        {visible.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            onOpen={(id) => navigate(`/job/${id}`)}
            onRespond={respond}
          />
        ))}
        {visible.length === 0 && <p className="empty">Ничего не найдено.</p>}
      </div>
    </div>
  );
}
