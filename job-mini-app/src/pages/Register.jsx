import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { getTelegram, haptic, notify, showPopup } from '../lib/telegram';
import { PROFILE_ROLES } from '../lib/constants';

export default function Register() {
  const navigate = useNavigate();
  const { profile, loading, refresh } = useAuth();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    role: '',
    city: '',
    phone: '',
    about: '',
    company_name: '',
    position: '',
    skills: '',
    experience: '',
    portfolio_url: '',
  });
  const [sending, setSending] = useState(false);

  const isRegistered = Boolean(profile?.is_registered);

  useEffect(() => {
    if (!profile) return;
    setForm({
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      role: profile.role || '',
      city: profile.city || '',
      phone: profile.phone || '',
      about: profile.about || '',
    });
  }, [profile]);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    if (!form.first_name.trim()) {
      showPopup('Заполните поле', 'Укажите имя.');
      return;
    }
    if (!form.role) {
      showPopup('Выберите роль', 'Кто вы: соискатель или работодатель?');
      return;
    }

    setSending(true);
    haptic('medium');
    try {
      await apiFetch('/api/profile', {
        method: 'PATCH',
        body: { ...form, register: true },
      });
      await refresh();
      notify('success');
      showPopup('Готово', isRegistered ? 'Профиль обновлён.' : 'Регистрация завершена!');
      navigate('/profile');
    } catch (err) {
      notify('error');
      showPopup('Ошибка', err.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p className="empty">Загрузка…</p>;

  if (!profile) {
    return (
      <div className="page">
        <h1>Регистрация</h1>
        <p className="empty">
          {getTelegram()?.initData
            ? 'Не удалось получить профиль. Попробуйте открыть приложение заново.'
            : 'Откройте приложение через Telegram — вход выполнится автоматически, затем заполните профиль.'}
        </p>
      </div>
    );
  }

  return (
    <form className="page form" onSubmit={submit}>
      <h1>{isRegistered ? 'Мой профиль' : 'Регистрация'}</h1>
      <p className="page__subtitle">
        {isRegistered
          ? 'Отредактируйте данные и сохраните изменения.'
          : 'Заполните короткий профиль, чтобы пользоваться всеми возможностями.'}
      </p>

      <label className="field">
        <span>Имя *</span>
        <input value={form.first_name} onChange={update('first_name')} placeholder="Иван" required />
      </label>
      <label className="field">
        <span>Фамилия</span>
        <input value={form.last_name} onChange={update('last_name')} placeholder="Петров" />
      </label>

      <label className="field">
        <span>Кто вы? *</span>
        <select value={form.role} onChange={update('role')}>
          <option value="">Выберите роль</option>
          {PROFILE_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Город</span>
        <input value={form.city} onChange={update('city')} placeholder="Москва" />
      </label>
      <label className="field">
        <span>Телефон</span>
        <input value={form.phone} onChange={update('phone')} placeholder="+7 900 000-00-00" />
      </label>
      <label className="field">
        <span>О себе</span>
        <textarea
          rows={4}
          value={form.about}
          onChange={update('about')}
          placeholder="Опыт, навыки, чем можете быть полезны"
        />
      </label>

      <label className="field">
        <span>Компания</span>
        <input value={form.company_name} onChange={update('company_name')} placeholder="Название компании" />
      </label>
      <label className="field">
        <span>Должность</span>
        <input value={form.position} onChange={update('position')} placeholder="Например: HR-менеджер" />
      </label>
      <label className="field">
        <span>Навыки</span>
        <input value={form.skills} onChange={update('skills')} placeholder="JavaScript, React, Figma" />
      </label>
      <label className="field">
        <span>Опыт работы</span>
        <textarea
          rows={3}
          value={form.experience}
          onChange={update('experience')}
          placeholder="Расскажите о своём опыте"
        />
      </label>
      <label className="field">
        <span>Портфолио (ссылка)</span>
        <input value={form.portfolio_url} onChange={update('portfolio_url')} placeholder="https://…" />
      </label>

      <button className="btn btn--primary" type="submit" disabled={sending}>
        {sending ? 'Сохраняем…' : isRegistered ? 'Сохранить изменения' : 'Зарегистрироваться'}
      </button>

      {isRegistered && (
        <button type="button" className="btn btn--secondary" onClick={() => navigate('/profile')}>
          Отмена
        </button>
      )}
    </form>
  );
}
