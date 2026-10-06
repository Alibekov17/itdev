import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { isTelegram } from '../lib/telegram';

export default function Profile() {
  const navigate = useNavigate();
  const { profile, isAdmin, loading, error, refresh } = useAuth();
  const [stats, setStats] = useState({ jobs: 0, published: 0, responses: 0 });

  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        const [jobsData, respData] = await Promise.all([
          apiFetch('/api/my/jobs'),
          apiFetch('/api/my/responses'),
        ]);
        const jobs = jobsData.jobs || [];
        setStats({
          jobs: jobs.length,
          published: jobs.filter((j) => j.status === 'published').length,
          responses: (respData.responses || []).length,
        });
      } catch {
        // статистика не критична
      }
    })();
  }, [profile]);

  if (loading) return <p className="empty">Загрузка профиля…</p>;

  if (!profile) {
    return (
      <div className="page">
        <h1>Профиль</h1>
        <p className="empty">
          {isTelegram()
            ? 'Не удалось получить профиль.'
            : 'Откройте приложение через Telegram — вход выполнится автоматически.'}
        </p>
        {error && <p className="error-text">{error}</p>}
        <button type="button" className="btn btn--primary" onClick={refresh}>
          Повторить
        </button>
      </div>
    );
  }

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Пользователь';

  return (
    <div className="page">
      <div className="profile-head">
        {profile.photo_url ? (
          <img className="avatar" src={profile.photo_url} alt={name} />
        ) : (
          <div className="avatar avatar--placeholder">{name.charAt(0).toUpperCase()}</div>
        )}
        <div>
          <h1 className="profile-name">{name}</h1>
          {profile.username && <p className="page__subtitle">@{profile.username}</p>}
          <p className="page__subtitle">Telegram ID: {profile.telegram_id}</p>
        </div>
      </div>

      <div className="facts">
        <div className="fact">
          <span className="fact__label">Вакансий</span>
          <span className="fact__value">{stats.jobs}</span>
        </div>
        <div className="fact">
          <span className="fact__label">Опубликовано</span>
          <span className="fact__value">{stats.published}</span>
        </div>
        <div className="fact">
          <span className="fact__label">Откликов</span>
          <span className="fact__value">{stats.responses}</span>
        </div>
      </div>

      <button type="button" className="btn btn--secondary" onClick={() => navigate('/my-jobs')}>
        Мои вакансии
      </button>
      <button type="button" className="btn btn--secondary" onClick={() => navigate('/responses')}>
        Мои отклики
      </button>
      <button type="button" className="btn btn--secondary" onClick={() => navigate('/received')}>
        Отклики на мои вакансии
      </button>
      <button type="button" className="btn btn--secondary" onClick={() => navigate('/my-complaints')}>
        Мои жалобы
      </button>
      <button type="button" className="btn btn--primary" onClick={() => navigate('/create')}>
        Разместить вакансию
      </button>

      {isAdmin && (
        <button type="button" className="btn btn--secondary" onClick={() => navigate('/admin')}>
          🛡️ Админ-панель
        </button>
      )}

      <p className="page__subtitle" style={{ marginTop: 16 }}>
        Вход выполнен через Telegram. Отдельный пароль не нужен.
      </p>
    </div>
  );
}
