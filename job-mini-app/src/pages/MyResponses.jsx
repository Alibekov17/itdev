import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getResponses } from '../lib/telegram';

export default function MyResponses() {
  const navigate = useNavigate();
  const [responses] = useState(() => getResponses());

  return (
    <div className="page">
      <h1>Мои отклики</h1>
      <p className="page__subtitle">Всего: {responses.length}</p>

      {responses.length === 0 ? (
        <p className="empty">
          Пока нет откликов. Откройте вакансию и нажмите «Откликнуться».
        </p>
      ) : (
        <div className="job-list">
          {responses.map((job) => (
            <article key={job.id} className="job-card" onClick={() => navigate(`/job/${job.id}`)}>
              <div className="job-card__head">
                <h3 className="job-card__title">{job.title}</h3>
                <span className="job-card__salary">{job.salary}</span>
              </div>
              <p className="job-card__meta">
                {job.company} · {job.city}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
