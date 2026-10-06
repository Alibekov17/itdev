import { useAuth } from '../context/AuthContext';

export default function RequireAdmin({ children }) {
  const { profile, isAdmin, loading, error } = useAuth();

  if (loading) {
    return <p className="empty">Проверяем доступ…</p>;
  }

  if (!profile) {
    return (
      <div className="page">
        <h1>Нужен вход</h1>
        <p className="empty">Админ-раздел доступен только из Telegram.</p>
        {error && <p className="error-text">{error}</p>}
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <h1>Нет доступа</h1>
        <p className="empty">
          У вас нет прав администратора. Попросите владельца добавить ваш Telegram ID в
          ADMIN_TELEGRAM_IDS.
        </p>
      </div>
    );
  }

  return children;
}
