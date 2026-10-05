import { getInitData, getDevUser } from './telegram';

// В dev пусто — запросы к /api идут через Vite-прокси на localhost:3000.
// В продакшене задайте VITE_API_BASE_URL.
const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function apiUrl(path) {
  return `${BASE}${path}`;
}

export async function apiFetch(path, { method = 'GET', body, query } = {}) {
  let url = apiUrl(path);

  if (query) {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') qs.set(key, value);
    });
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const headers = {};
  const initData = getInitData();
  if (initData) headers['X-Telegram-Init-Data'] = initData;
  const devUser = getDevUser();
  if (devUser) headers['X-Dev-User'] = devUser;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Ошибка запроса (${res.status})`);
  }
  return data;
}
