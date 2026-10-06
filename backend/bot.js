// Команды Telegram-бота (/start, /help, /profile, /jobs).
//
// ВАЖНО: этот модуль НЕ запускает собственный polling и НЕ поднимает HTTP-сервер.
// Единый polling/webhook выполняет index.js (см. handleTelegramUpdate), который
// вызывает handleMessage() для текстовых сообщений. Так бот и оплата Stars
// работают в одном процессе без конфликта за getUpdates и порт.

const { supabase } = require('./supabase');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
// Публичный HTTPS-адрес Mini App (например, https://my-app.vercel.app).
const WEBAPP_URL = String(process.env.WEBAPP_URL || '').replace(/\/$/, '');

const JOB_STATUS_RU = {
  pending_payment: '⏳ ожидает оплаты',
  published: '✅ опубликована',
  archived: '🗄 в архиве',
  rejected: '⛔ отклонена',
};
const RESPONSE_STATUS_RU = {
  sent: 'отправлен',
  viewed: 'просмотрен',
  invited: '🎉 приглашение',
  rejected: 'отказ',
};
const ROLE_RU = {
  seeker: 'Соискатель',
  employer: 'Работодатель',
  both: 'Соискатель и работодатель',
};

async function callTelegram(method, body) {
  if (!BOT_TOKEN) return { ok: false, description: 'BOT_TOKEN не задан' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return res.json();
  } catch (e) {
    return { ok: false, description: e.message };
  }
}

function appUrl(path = '') {
  return WEBAPP_URL ? `${WEBAPP_URL}${path}` : '';
}

function send(chatId, text, extra = {}) {
  return callTelegram('sendMessage', { chat_id: chatId, text, ...extra });
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

// -------- данные --------

// Возвращает профиль по telegram_id, создавая его при отсутствии.
async function getOrCreateProfile(from) {
  const { data: existing, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('telegram_id', from.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (existing) return existing;

  const { data, error: insErr } = await supabase
    .from('profiles')
    .insert({
      telegram_id: from.id,
      username: from.username || null,
      first_name: from.first_name || null,
      last_name: from.last_name || null,
      language_code: from.language_code || null,
    })
    .select()
    .single();
  if (insErr) throw new Error(insErr.message);
  return data;
}

async function countJobs(telegramId) {
  const { count } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', telegramId);
  return count || 0;
}

async function countResponses(telegramId) {
  const { count } = await supabase
    .from('responses')
    .select('*', { count: 'exact', head: true })
    .eq('applicant_id', telegramId);
  return count || 0;
}

function fullName(profile, fallback) {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || fallback || 'друг';
}

// -------- тексты команд --------

function startText(name) {
  return (
    `Здравствуйте, ${name}! 👋\n\n` +
    'Этот бот помогает искать работу и находить сотрудников.\n\n' +
    'Что умеет приложение:\n' +
    '• 🔍 искать вакансии с фильтрами\n' +
    '• 📨 откликаться на вакансии\n' +
    '• 📝 публиковать свои вакансии (оплата звёздами ⭐)\n' +
    '• 🚩 жаловаться на подозрительные объявления\n\n' +
    'Команды:\n' +
    '/start — главное меню\n' +
    '/help — помощь о приложении\n' +
    '/profile — мой профиль\n' +
    '/jobs — мои вакансии и отклики\n\n' +
    'Начните с кнопки ниже 👇'
  );
}

function helpText() {
  return (
    'ℹ️ Помощь по приложению «Вакансии»\n\n' +
    '🔍 Поиск работы\n' +
    'Откройте приложение и выберите раздел «Вакансии». Можно фильтровать по городу, опыту, графику, удалёнке и зарплате.\n\n' +
    '📨 Отклик на вакансию\n' +
    'Откройте вакансию и нажмите «Откликнуться». Работодатель увидит ваш отклик в своём кабинете.\n\n' +
    '📝 Публикация вакансии\n' +
    'Раздел «Разместить». Стоимость размещения оплачивается звёздами Telegram ⭐. После оплаты вакансия появляется в общем списке.\n\n' +
    '👤 Профиль и регистрация\n' +
    'При первом входе заполните короткий профиль (имя, роль, город, контакты) — так работодатели и соискатели быстрее найдут друг друга.\n\n' +
    '🚩 Жалобы\n' +
    'Если объявление выглядит подозрительно, откройте его и нажмите «Пожаловаться». Модератор проверит обращение.\n\n' +
    'Команды: /start, /profile, /jobs.'
  );
}

function profileText(profile, jobsCount, responsesCount) {
  const reg = profile.is_registered ? '✅ регистрация завершена' : '⚠️ регистрация не завершена';
  const lines = [
    '👤 Ваш профиль',
    '',
    `Имя: ${fullName(profile)}`,
    profile.username ? `Username: @${profile.username}` : null,
    `Telegram ID: ${profile.telegram_id}`,
    `Роль: ${ROLE_RU[profile.role] || 'не указана'}`,
    `Город: ${profile.city || 'не указан'}`,
    `Телефон: ${profile.phone || 'не указан'}`,
    profile.about ? `О себе: ${profile.about}` : null,
    '',
    `Статус: ${reg}`,
    `📋 Вакансий: ${jobsCount}`,
    `📨 Откликов: ${responsesCount}`,
  ];
  return lines.filter(Boolean).join('\n');
}

async function jobsText(telegramId) {
  const { data: jobs } = await supabase
    .from('jobs')
    .select('title, company, status')
    .eq('author_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: responses } = await supabase
    .from('responses')
    .select('status, job:jobs(title, company)')
    .eq('applicant_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(10);

  const parts = [];

  if (jobs && jobs.length) {
    parts.push('📋 Ваши вакансии:');
    jobs.forEach((j, i) => {
      parts.push(`${i + 1}. ${j.title} — ${j.company || '—'} (${JOB_STATUS_RU[j.status] || j.status})`);
    });
  } else {
    parts.push('📋 У вас пока нет опубликованных вакансий.');
  }

  parts.push('');

  if (responses && responses.length) {
    parts.push('📨 Ваши отклики:');
    responses.forEach((r, i) => {
      const title = r.job?.title || 'вакансия удалена';
      parts.push(`${i + 1}. ${title} (${RESPONSE_STATUS_RU[r.status] || r.status})`);
    });
  } else {
    parts.push('📨 Вы пока не откликались на вакансии.');
  }

  return parts.join('\n');
}

// -------- обработка --------

// Обрабатывает текстовое сообщение с командой. Возвращает true, если ответ отправлен.
async function handleMessage(msg) {
  const text = msg?.text;
  const chatId = msg?.chat?.id;
  if (!chatId || typeof text !== 'string' || !text.startsWith('/')) return false;

  const command = text.trim().split(/[\s@]/)[0].toLowerCase();
  const name = msg.from?.first_name || 'друг';
  const keyboard = WEBAPP_URL ? mainKeyboard() : undefined;

  try {
    switch (command) {
      case '/start':
        await send(chatId, startText(name), keyboard ? { reply_markup: keyboard } : {});
        return true;

      case '/help':
        await send(chatId, helpText(), keyboard ? { reply_markup: keyboard } : {});
        return true;

      case '/profile': {
        const profile = await getOrCreateProfile(msg.from);
        const [jobsCount, responsesCount] = await Promise.all([
          countJobs(msg.from.id),
          countResponses(msg.from.id),
        ]);
        await send(chatId, profileText(profile, jobsCount, responsesCount), {
          reply_markup: WEBAPP_URL
            ? { inline_keyboard: [[{ text: '👤 Открыть профиль', web_app: { url: appUrl('/profile') } }]] }
            : undefined,
        });
        return true;
      }

      case '/jobs': {
        await getOrCreateProfile(msg.from);
        await send(chatId, await jobsText(msg.from.id), {
          reply_markup: WEBAPP_URL
            ? {
                inline_keyboard: [
                  [
                    { text: '📋 Мои вакансии', web_app: { url: appUrl('/my-jobs') } },
                    { text: '📨 Мои отклики', web_app: { url: appUrl('/responses') } },
                  ],
                ],
              }
            : undefined,
        });
        return true;
      }

      default:
        await send(chatId, 'Неизвестная команда. Доступно: /start, /help, /profile, /jobs.');
        return true;
    }
  } catch (e) {
    console.error('[bot] ошибка команды', command, e.message);
    await send(chatId, 'Произошла ошибка. Попробуйте позже.');
    return true;
  }
}

// Кнопка-меню чата со ссылкой на Mini App + список команд (вызывается при старте сервера).
async function setMenuButton() {
  if (!BOT_TOKEN) return;

  if (WEBAPP_URL) {
    const res = await callTelegram('setChatMenuButton', {
      menu_button: { type: 'web_app', text: 'Открыть', web_app: { url: WEBAPP_URL } },
    });
    if (!res.ok) console.error('[bot] setChatMenuButton:', res.description);
  }

  const res = await callTelegram('setMyCommands', {
    commands: [
      { command: 'start', description: 'Главное меню' },
      { command: 'help', description: 'Помощь о приложении' },
      { command: 'profile', description: 'Мой профиль' },
      { command: 'jobs', description: 'Мои вакансии и отклики' },
    ],
  });
  if (!res.ok) console.error('[bot] setMyCommands:', res.description);
}

module.exports = { handleMessage, setMenuButton, getOrCreateProfile, WEBAPP_URL };
