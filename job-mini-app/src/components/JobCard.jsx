import { formatSalary, formatDate, EXPERIENCES, EMPLOYMENT_TYPES, labelOf } from '../lib/constants';

export default function JobCard({ job, onOpen }) {
  return (
    <article className="job-card" onClick={() => onOpen?.(job.id)}>
      <div className="job-card__head">
        <h3 className="job-card__title">{job.title}</h3>
        <span className="job-card__salary">{formatSalary(job)}</span>
      </div>
      <p className="job-card__meta">
        {job.company} · {job.is_remote ? 'Удалённо' : job.city || 'Город не указан'}
      </p>
      <p className="job-card__meta job-card__meta--small">
        {labelOf(EXPERIENCES, job.experience)}
        {job.employment_type ? ` · ${labelOf(EMPLOYMENT_TYPES, job.employment_type)}` : ''}
        {job.published_at ? ` · ${formatDate(job.published_at)}` : ''}
      </p>
      {job.skills?.length > 0 && (
        <div className="job-card__tags">
          {job.skills.slice(0, 5).map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
