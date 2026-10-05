// Небольшие обёртки над Telegram WebApp API.

export function getTelegram() {
  return typeof window !== 'undefined' ? window.Telegram?.WebApp ?? null : null;
}

// true, только если приложение реально открыто внутри Telegram.
export function isTelegram() {
  const tg = getTelegram();
  return Boolean(tg && tg.initData);
}

export function haptic(style = 'light') {
  const tg = getTelegram();
  const hf = tg?.HapticFeedback;
  if (!hf) return;
  const allowed = ['light', 'medium', 'heavy', 'rigid', 'soft'];
  hf.impactOccurred(allowed.includes(style) ? style : 'light');
}

const RESPONSES_KEY = 'job_mini_app_responses';

// Отклики храним локально, чтобы экран «Мои отклики» работал без бэкенда.
export function getResponses() {
  try {
    return JSON.parse(localStorage.getItem(RESPONSES_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveResponse(job) {
  const all = getResponses();
  if (all.some((r) => String(r.id) === String(job.id))) return all;
  const next = [{ ...job, respondedAt: Date.now() }, ...all];
  try {
    localStorage.setItem(RESPONSES_KEY, JSON.stringify(next));
  } catch {
    // localStorage может быть недоступен — не критично.
  }
  return next;
}
