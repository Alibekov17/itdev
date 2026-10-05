// Обёртки над Telegram WebApp API.

export function getTelegram() {
  return typeof window !== 'undefined' ? window.Telegram?.WebApp ?? null : null;
}

// true, только если приложение реально открыто внутри Telegram.
export function isTelegram() {
  const tg = getTelegram();
  return Boolean(tg && tg.initData);
}

// Строка initData — подписанный Telegram «пропуск» пользователя.
export function getInitData() {
  return getTelegram()?.initData || '';
}

// Необязательный dev-пользователь для локальной отладки в браузере.
// Задаётся через VITE_DEV_USER в .env и требует ALLOW_DEV_LOGIN=true на бэкенде.
export function getDevUser() {
  return import.meta.env.VITE_DEV_USER || '';
}

export function haptic(style = 'light') {
  const tg = getTelegram();
  const hf = tg?.HapticFeedback;
  if (!hf) return;
  const allowed = ['light', 'medium', 'heavy', 'rigid', 'soft'];
  hf.impactOccurred(allowed.includes(style) ? style : 'light');
}

export function notify(type = 'success') {
  const tg = getTelegram();
  tg?.HapticFeedback?.notificationOccurred?.(type);
}

export function showPopup(title, message) {
  const tg = getTelegram();
  if (tg?.showPopup) {
    tg.showPopup({ title, message });
  } else {
    // eslint-disable-next-line no-alert
    alert(`${title}\n\n${message}`);
  }
}
