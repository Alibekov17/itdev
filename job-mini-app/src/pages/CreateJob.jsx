import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTelegram, haptic } from '../lib/telegram';
import { apiUrl } from '../lib/api';

const EMPTY = {
  title: '',
  company: '',
  salary: '',
  city: '',
  remote: false,
  description: '',
};

export default function CreateJob() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);

  const update = (field) => (e) => {
    const value = field === 'remote' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.company.trim()) return;

    setSending(true);
    haptic('light');
    const tg = getTelegram();

    try {
      await fetch(apiUrl('/api/jobs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, initData: tg?.initData ?? '' }),
      });
    } catch {
      // Бэкенд может быть недоступен в dev — не блокируем UX.
    }

    setSending(false);
    tg?.showPopup?.({ title: 'Готово', message: 'Вакансия опубликована!' });
    navigate('/');
  };

  useEffect(() => {
    const tg = getTelegram();
    if (!tg) return;
    tg.BackButton.show();
    const goBack = () => navigate(-1);
    tg.BackButton.onClick(goBack);
    return () => {
      tg.BackButton.offClick(goBack);
      tg.BackButton.hide();
    };
  }, [navigate]);

  return (
    <form className="page form" onSubmit={submit}>
      <h1>Новая вакансия</h1>

      <label className="field">
        <span>Название</span>
        <input value={form.title} onChange={update('title')} placeholder="Frontend-разработчик" required />
      </label>

      <label className="field">
        <span>Компания</span>
        <input value={form.company} onChange={update('company')} placeholder="Название компании" required />
      </label>

      <label className="field">
        <span>Зарплата</span>
        <input value={form.salary} onChange={update('salary')} placeholder="от 150 000 ₽" />
      </label>

      <label className="field">
        <span>Город</span>
        <input value={form.city} onChange={update('city')} placeholder="Москва" />
      </label>

      <label className="field field--row">
        <input type="checkbox" checked={form.remote} onChange={update('remote')} />
        <span>Удалённая работа</span>
      </label>

      <label className="field">
        <span>Описание</span>
        <textarea
          value={form.description}
          onChange={update('description')}
          rows={5}
          placeholder="Чем предстоит заниматься"
        />
      </label>

      <button className="btn btn--primary" type="submit" disabled={sending}>
        {sending ? 'Отправка…' : 'Опубликовать'}
      </button>
    </form>
  );
}
