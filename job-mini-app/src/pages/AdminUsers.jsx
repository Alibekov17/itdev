import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { notify, showPopup } from '../lib/telegram';
import { formatDate } from '../lib/constants';

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiFetch('/api/admin/users', { query: { q } });
      setUsers(d.users || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const toggleAdmin = async (user) => {
    if (busyId) return;
    setBusyId(user.telegram_id);
    try {
      const d = await apiFetch(`/api/admin/users/${user.telegram_id}`, {
        method: 'PATCH',
        body: { is_admin: !user.is_admin },
      });
      notify('success');
      setUsers((list) => list.map((u) => (u.telegram_id === user.telegram_id ? d.user : u)));
    } catch (e) {
      notify('error');
      showPopup('Ошибка', e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <h1>Пользователи</h1>
      <p className="page__subtitle">Всего: {users.length}</p>

      <button type="button" className="btn btn--secondary" onClick={() => navigate('/admin')}>
        ← Назад в админ-панель
      </button>

      <div className="searchbar" style={{ marginTop: 12 }}>
        <input
          type="search"
          className="searchbar__input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Имя или @username"
        />
      </div>

      {loading && <p className="empty">Загрузка…</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="job-list">
        {users.map((u) => {
          const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Пользователь';
          return (
            <article key={u.telegram_id} className="job-card">
              <div className="job-card__head">
                <h3 className="job-card__title">{name}</h3>
                {u.is_admin && <span className="badge badge--ok">Админ</span>}
              </div>
              <p className="job-card__meta job-card__meta--small">
                {u.username ? `@${u.username} · ` : ''}ID: {u.telegram_id} · {formatDate(u.created_at)}
              </p>
              <div className="admin-actions">
                <button
                  type="button"
                  className={u.is_admin ? 'btn btn--danger btn--sm' : 'btn btn--primary btn--sm'}
                  disabled={busyId === u.telegram_id}
                  onClick={() => toggleAdmin(u)}
                >
                  {u.is_admin ? 'Снять админа' : 'Сделать админом'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && !error && users.length === 0 && <p className="empty">Пользователей не найдено.</p>}
    </div>
  );
}
