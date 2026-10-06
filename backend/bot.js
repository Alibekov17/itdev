// Команды Telegram-бота (/start, /help, /jobs, /profile).
//
// ВАЖНО: этот модуль НЕ запускает собственный polling и НЕ поднимает HTTP-сервер.
// Единый polling/webhook выполняет index.js (см. handleTelegramUpdate), который
// вызывает handleMessage() для текстовых сообщений. Так бот и оплата Stars
// работают в одном процессе без конфликта за getUpdates и порт.

const BOT_TOKEN = process.env.BOT_TOKEN || '';
// Публичный HTTPS-адрес Mini App (например, https://my-app.vercel.app).
const WEBAPP_URL = String(process.env.WEBAPP_URL || '').replace(/\/$/, '');

async function callTelegram(method, body) {
  if (!BOT_TOKEN) return { ok: false, description: 'BOT_TOKEN не задан' };
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

function appUrl(path = '') {
  return WEBAPP_URL ? `${WEBAPP_URL}${path}` : '';
}

function mainKeyboard() {
  const url = appUrl();
  if (!url) return undefined;
  return {
    inline_keyboard: [
      [{ text: '📱 Открыть приложение', web_app: { url } }],
      [
        { text: '👤 Профиль', web_app: { url: appUrl('/profile') } },
        { text: '🔍 Вакансии', web_app: { url } },
      ],
      [{ text: '📝 Опубликовать вакансию', web_app: { url: appUrl('/create') } }],
    ],
  };
}

// Возвращает { text, reply_markup } для поддерживаемых команд или null.
function buildReply(rawText, firstName) {
  const command = String(rawText || '').trim().split(/[\s@]/)[0].toLowerCase();
  const name = firstName || 'друг';

  switch (command) {
    case '/start':
      return {
        text:
          `Здравствуйте, ${name}! 👋\n\n` +
          'Этот бот создан для поиска работы. Здесь вы можете:\n' +
          '• Найти вакансии\n' +
          '• Откликнуться на предложения\n' +
          '• Опубликовать свою вакансию\n\n' +
          'Выберите действие:',
        reply_markup: mainKeyboard(),
      };
    case '/help':
      return {
        text: 'Используйте /start, чтобы открыть приложение, /jobs — вакансии, /profile — профиль.',
        reply_markup: mainKeyboard(),
      };
    case '/jobs':
      return { text: 'Открыть вакансии:', reply_markup: mainKeyboard() };
    case '/profile':
      return {
        text: 'Открыть профиль:',
        reply_markup: WEBAPP_URL
          ? { inline_keyboard: [[{ text: 'Профиль', web_app: { url: appUrl('/profile') } }]] }
          : undefined,
      };
    default:
      return null;
  }
}

// Обрабатывает текстовое сообщение. Возвращает true, если ответ был отправлен.
async function handleMessage(msg) {
  const text = msg?.text;
  const chatId = msg?.chat?.id;
  if (!chatId || typeof text !== 'string' || !text.startsWith('/')) return false;

  const reply = buildReply(text, msg.from?.first_name);
  if (!reply) return false;

  if (!WEBAPP_URL && reply.reply_markup) {
    reply.text += '\n\n(Приложение ещё не настроено: задайте WEBAPP_URL на сервере.)';
    reply.reply_markup = undefined;
  }

  const res = await callTelegram('sendMessage', {
    chat_id: chatId,
    text: reply.text,
    ...(reply.reply_markup ? { reply_markup: reply.reply_markup } : {}),
  });
  if (!res.ok) console.error('[bot] sendMessage:', res.description);
  return true;
}

// Кнопка-меню чата со ссылкой на Mini App (вызывается при старте сервера).
async function setMenuButton() {
  if (!BOT_TOKEN || !WEBAPP_URL) return;
  const res = await callTelegram('setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Открыть', web_app: { url: WEBAPP_URL } },
  });
  if (!res.ok) console.error('[bot] setChatMenuButton:', res.description);
}

module.exports = { handleMessage, buildReply, setMenuButton, WEBAPP_URL };
