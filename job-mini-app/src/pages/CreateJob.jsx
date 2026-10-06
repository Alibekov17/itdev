import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { getTelegram, haptic, notify, showPopup } from '../lib/telegram';
import {
  EMPLOYMENT_TYPES,
  SCHEDULES,
  EXPERIENCES,
  CURRENCIES,
  POPULAR_CITIES,
} from '../lib/constants';

const EMPTY = {
  title: '',
  company: '',
  company_logo_url: '',
  city: '',
  is_remote: false,
  employment_type: '',
  schedule: '',
  experience: '',
  salary_from: '',
  salary_to: '',
  currency: 'RUB',
  gross: true,
  description: '',
  responsibilities: '',
  requirements: '',
  conditions: '',
  contact: '',
  contact_email: '',
  contact_phone: '',
};

export default function CreateJob() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(EMPTY);
  const [skills, setSkills] = useState([]);
  const [skillInput, setSkillInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [price, setPrice] = useState(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);

  useEffect(() => {
    apiFetch('/api/config')
      .then((c) => {
        setPrice(c.priceStars);
        setPaymentsEnabled(c.paymentsEnabled);
      })
      .catch(() => {});
  }, []);

  // Режим редактирования: подгружаем свою вакансию и заполняем форму.
  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    (async () => {
      try {
        const d = await apiFetch(`/api/jobs/${id}`);
        if (!alive) return;
        const job = d.job || {};
        setForm({
          title: job.title || '',
          company: job.company || '',
          company_logo_url: job.company_logo_url || '',
          city: job.city || '',
          is_remote: Boolean(job.is_remote),
          employment_type: job.employment_type || '',
          schedule: job.schedule || '',
          experience: job.experience || '',
          salary_from: job.salary_from ?? '',
          salary_to: job.salary_to ?? '',
          currency: job.currency || 'RUB',
          gross: job.gross !== false,
          description: job.description || '',
          responsibilities: job.responsibilities || '',
          requirements: job.requirements || '',
          conditions: job.conditions || '',
          contact: job.contact || '',
          contact_email: job.contact_email || '',
          contact_phone: job.contact_phone || '',
        });
        setSkills(Array.isArray(job.skills) ? job.skills : []);
      } catch (e) {
        showPopup('Ошибка', e.message);
        navigate('/my-jobs');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, isEdit, navigate]);

  const update = (field) => (e) => {
    const value = field === 'is_remote' || field === 'gross' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const addSkill = () => {
    const value = skillInput.trim();
    if (!value || skills.includes(value)) return;
    setSkills((s) => [...s, value].slice(0, 30));
    setSkillInput('');
  };

  const onSkillKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkill();
    }
  };

  const finishSuccess = () => {
    notify('success');
    showPopup('Готово', 'Оплата получена, вакансия опубликована!');
    navigate('/my-jobs');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    if (!form.title.trim() || !form.company.trim() || !form.description.trim()) {
      showPopup('Заполните поля', 'Нужны название, компания и описание.');
      return;
    }

    setSending(true);
    haptic('light');
    try {
      // Режим редактирования — сохраняем изменения без оплаты.
      if (isEdit) {
        await apiFetch(`/api/my/jobs/${id}`, { method: 'PATCH', body: { ...form, skills } });
        notify('success');
        showPopup('Готово', 'Изменения сохранены.');
        navigate(`/job/${id}`);
        return;
      }

      const data = await apiFetch('/api/jobs', {
        method: 'POST',
        body: { ...form, skills },
      });

      const tg = getTelegram();

      if (!data.paymentsEnabled) {
        // Demo-режим: подтверждаем оплату на бэкенде.
        await apiFetch(`/api/payments/${data.payment.id}/demo-confirm`, { method: 'POST' });
        finishSuccess();
        return;
      }

      // Боевой режим Telegram Stars.
      if (data.invoiceUrl && tg?.openInvoice) {
        tg.openInvoice(data.invoiceUrl, (status) => {
          if (status === 'paid') {
            finishSuccess();
          } else {
            showPopup('Оплата не завершена', 'Вакансия сохранена. Оплатить можно в разделе «Мои».');
            navigate('/my-jobs');
          }
        });
      } else if (data.invoiceUrl) {
        // Вне Telegram — открываем ссылку в новой вкладке.
        window.open(data.invoiceUrl, '_blank');
        navigate('/my-jobs');
      } else {
        // Счёт не создался — не публикуем бесплатно, отправляем в «Мои».
        notify('error');
        showPopup('Оплата недоступна', 'Не удалось создать счёт. Попробуйте оплатить в разделе «Мои».');
        navigate('/my-jobs');
      }
    } catch (err) {
      notify('error');
      showPopup('Ошибка', err.message);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    const tg = getTelegram();
    if (!tg) return;
    tg.BackButton.show();
    const back = () => navigate(-1);
    tg.BackButton.onClick(back);
    return () => {
      tg.BackButton.offClick(back);
      tg.BackButton.hide();
    };
  }, [navigate]);

  if (loading) return <p className="empty">Загружаем вакансию…</p>;

  return (
    <form className="page form" onSubmit={submit}>
      <h1>{isEdit ? 'Редактировать вакансию' : 'Разместить вакансию'}</h1>
      {!isEdit && price != null && (
        <p className="page__subtitle">
          Стоимость размещения: {price} {paymentsEnabled ? '⭐ (Telegram Stars)' : '(demo-режим, оплата не списывается)'}
        </p>
      )}

      <h2 className="form__section">Основное</h2>
      <label className="field">
        <span>Название вакансии *</span>
        <input value={form.title} onChange={update('title')} placeholder="Frontend-разработчик (React)" required />
      </label>
      <label className="field">
        <span>Компания *</span>
        <input value={form.company} onChange={update('company')} placeholder="ООО «Ромашка»" required />
      </label>
      <label className="field">
        <span>Ссылка на логотип</span>
        <input value={form.company_logo_url} onChange={update('company_logo_url')} placeholder="https://…" />
      </label>

      <h2 className="form__section">Условия</h2>
      <label className="field">
        <span>Город</span>
        <input list="cities" value={form.city} onChange={update('city')} placeholder="Москва" />
        <datalist id="cities">
          {POPULAR_CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="field field--row">
        <input type="checkbox" checked={form.is_remote} onChange={update('is_remote')} />
        <span>Можно удалённо</span>
      </label>
      <label className="field">
        <span>Тип занятости</span>
        <select value={form.employment_type} onChange={update('employment_type')}>
          <option value="">Не указано</option>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>График работы</span>
        <select value={form.schedule} onChange={update('schedule')}>
          <option value="">Не указано</option>
          {SCHEDULES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Требуемый опыт</span>
        <select value={form.experience} onChange={update('experience')}>
          <option value="">Не указано</option>
          {EXPERIENCES.map((exp) => (
            <option key={exp.value} value={exp.value}>
              {exp.label}
            </option>
          ))}
        </select>
      </label>

      <div className="salary-row">
        <label className="field">
          <span>Зарплата от</span>
          <input type="number" inputMode="numeric" value={form.salary_from} onChange={update('salary_from')} placeholder="100000" />
        </label>
        <label className="field">
          <span>до</span>
          <input type="number" inputMode="numeric" value={form.salary_to} onChange={update('salary_to')} placeholder="200000" />
        </label>
        <label className="field field--narrow">
          <span>Валюта</span>
          <select value={form.currency} onChange={update('currency')}>
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field field--row">
        <input type="checkbox" checked={form.gross} onChange={update('gross')} />
        <span>До вычета налогов</span>
      </label>

      <h2 className="form__section">Описание</h2>
      <label className="field">
        <span>Описание вакансии *</span>
        <textarea rows={5} value={form.description} onChange={update('description')} placeholder="Чем предстоит заниматься" required />
      </label>
      <label className="field">
        <span>Обязанности</span>
        <textarea rows={4} value={form.responsibilities} onChange={update('responsibilities')} placeholder="По пунктам" />
      </label>
      <label className="field">
        <span>Требования</span>
        <textarea rows={4} value={form.requirements} onChange={update('requirements')} placeholder="Что важно уметь" />
      </label>
      <label className="field">
        <span>Условия</span>
        <textarea rows={3} value={form.conditions} onChange={update('conditions')} placeholder="Что предлагаем" />
      </label>

      <h2 className="form__section">Навыки</h2>
      <div className="skill-input">
        <input
          value={skillInput}
          onChange={(e) => setSkillInput(e.target.value)}
          onKeyDown={onSkillKeyDown}
          placeholder="Например, React — и Enter"
        />
        <button type="button" className="btn btn--secondary" onClick={addSkill}>
          Добавить
        </button>
      </div>
      {skills.length > 0 && (
        <div className="job-card__tags">
          {skills.map((s) => (
            <button key={s} type="button" className="tag tag--removable" onClick={() => setSkills((list) => list.filter((x) => x !== s))}>
              {s} ✕
            </button>
          ))}
        </div>
      )}

      <h2 className="form__section">Контакты</h2>
      <label className="field">
        <span>Контактное лицо</span>
        <input value={form.contact} onChange={update('contact')} placeholder="Иван Петров, HR" />
      </label>
      <label className="field">
        <span>Email</span>
        <input type="email" value={form.contact_email} onChange={update('contact_email')} placeholder="hr@company.ru" />
      </label>
      <label className="field">
        <span>Телефон</span>
        <input value={form.contact_phone} onChange={update('contact_phone')} placeholder="+7 900 000-00-00" />
      </label>

      <button className="btn btn--primary" type="submit" disabled={sending}>
        {sending
          ? 'Отправка…'
          : isEdit
            ? 'Сохранить изменения'
            : paymentsEnabled
              ? `Опубликовать за ${price} ⭐`
              : 'Опубликовать'}
      </button>
    </form>
  );
}
