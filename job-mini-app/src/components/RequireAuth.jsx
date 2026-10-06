import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RequireAuth({ children }) {
  const { profile, loading, error } = useAuth();

  if (loading) {
    return <p className="empty">Проверяем вход через Telegram…</p>;
  }

  if (!profile) {
    return (
      <div className="page">
        <h1>Нужен вход</h1>
        <p className="empty">
          Эта функция доступна только в Telegram. Откройте приложение через кнопку меню бота — вход
          выполняется автоматически по вашему аккаунту.
        </p>
        {error && <p className="error-text">{error}</p>}
      </div>
    );
  }

  // Незарегистрированных пользователей отправляем завершить профиль.
  if (!profile.is_registered) {
    return <Navigate to="/register" replace />;
  }

  return children;
}
