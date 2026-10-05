export default function JobCard({ job, onOpen, onRespond }) {
  return (
    <article className="job-card" onClick={() => onOpen?.(job.id)}>
      <div className="job-card__head">
        <h3 className="job-card__title">{job.title}</h3>
        <span className="job-card__salary">{job.salary}</span>
      </div>
      <p className="job-card__meta">
        {job.company} · {job.city}
        {job.remote ? ' · Удалёнка' : ''}
      </p>
      {job.tags?.length > 0 && (
        <div className="job-card__tags">
          {job.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      {onRespond && (
        <button
          type="button"
          className="btn btn--secondary"
          onClick={(e) => {
            e.stopPropagation();
            onRespond(job);
          }}
        >
          Откликнуться
        </button>
      )}
    </article>
  );
}
