import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="page">
      <h1>Страница не найдена</h1>
      <p className="empty">Возможно, ссылка устарела или содержит ошибку.</p>
      <button type="button" className="btn btn--primary" onClick={() => navigate('/')}>
        К списку вакансий
      </button>
    </div>
  );
}
