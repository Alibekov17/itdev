export const EMPLOYMENT_TYPES = [
  { value: 'full', label: 'Полная занятость' },
  { value: 'part', label: 'Частичная занятость' },
  { value: 'project', label: 'Проектная работа' },
  { value: 'internship', label: 'Стажировка' },
  { value: 'volunteer', label: 'Волонтёрство' },
];

export const SCHEDULES = [
  { value: 'full_day', label: 'Полный день' },
  { value: 'shift', label: 'Сменный график' },
  { value: 'flexible', label: 'Гибкий график' },
  { value: 'remote', label: 'Удалённая работа' },
  { value: 'fly', label: 'Вахта' },
];

export const EXPERIENCES = [
  { value: 'no_experience', label: 'Нет опыта', min: 0 },
  { value: 'between_1_3', label: 'От 1 до 3 лет', min: 1 },
  { value: 'between_3_6', label: 'От 3 до 6 лет', min: 3 },
  { value: 'more_6', label: 'Более 6 лет', min: 6 },
];

export const CURRENCIES = [
  { value: 'RUB', label: '₽' },
  { value: 'USD', label: '$' },
  { value: 'EUR', label: '€' },
  { value: 'KZT', label: '₸' },
];

export const POPULAR_CITIES = [
  'Москва',
  'Санкт-Петербург',
  'Новосибирск',
  'Екатеринбург',
  'Казань',
  'Краснодар',
  'Удалённо',
];

export const RESPONSE_STATUSES = {
  sent: 'Отправлен',
  viewed: 'Просмотрен',
  invited: 'Приглашение',
  rejected: 'Отказ',
};

export const JOB_STATUSES = {
  pending_payment: 'Ожидает оплаты',
  published: 'Опубликована',
  archived: 'В архиве',
  rejected: 'Отклонена',
};

export const PROFILE_ROLES = [
  { value: 'seeker', label: 'Соискатель — ищу работу' },
  { value: 'employer', label: 'Работодатель — ищу сотрудников' },
  { value: 'both', label: 'И то, и другое' },
];

export function roleLabel(value) {
  return PROFILE_ROLES.find((r) => r.value === value)?.label || value || '';
}

export const COMPLAINT_REASONS = [
  { value: 'spam', label: 'Спам или реклама' },
  { value: 'fraud', label: 'Мошенничество' },
  { value: 'offensive', label: 'Оскорбительный контент' },
  { value: 'wrong_info', label: 'Недостоверная информация' },
  { value: 'other', label: 'Другое' },
];

export const COMPLAINT_STATUSES = {
  open: 'На рассмотрении',
  resolved: 'Решена',
  rejected: 'Отклонена',
};

export function statusLabel(map, value) {
  return map[value] || value || '';
}

export function labelOf(list, value) {
  return list.find((item) => item.value === value)?.label || value || '';
}

export function formatSalary(job) {
  const { salary_from: from, salary_to: to, currency } = job;
  const symbol = CURRENCIES.find((c) => c.value === currency)?.label || currency || '';
  const fmt = (n) => Number(n).toLocaleString('ru-RU');
  if (from && to) return `${fmt(from)} – ${fmt(to)} ${symbol}`;
  if (from) return `от ${fmt(from)} ${symbol}`;
  if (to) return `до ${fmt(to)} ${symbol}`;
  return 'з/п не указана';
}

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
