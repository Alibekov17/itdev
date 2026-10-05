// Базовый URL бэкенда.
// В dev он пустой — запросы к /api идут через Vite-прокси на localhost:3000.
// В продакшене задайте VITE_API_BASE_URL (например, https://your-backend.onrender.com).
const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function apiUrl(path) {
  return `${BASE}${path}`;
}
