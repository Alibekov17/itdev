// Обновлённые команды Telegram-бота.
//
// Ключевые изменения:
// 1. /start — мгновенный ответ, авто-регистрация, клавиатура выбора роли.
// 2. Обработка выбора роли (заказчик / исполнитель / оба).
// 3. Разные формы заполнения профиля для разных ролей.
// 4. Уведомления заказчикам об откликах исполнителей.

const { supabase } = require('./supabase');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
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
  seeker: 'Исполнитель',
  employer: 'Заказчик',
  both: 'Заказчик и Исполнитель',
};

// ---- Telegram API helpers ----

let botUsername = null;

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

// Получаем имя бота из Telegram API (для ссылок).
async function getMe() {
  if (botUsername) return botUsername;
  try {
    const res = await callTelegram('getMe', {});
    if (res.ok) {
      botUsername = res.result.username;
      console.log('[bot] имя бота:', botUsername);
    }
  } catch (e) {
    console.error('[bot] ошибка getMe:', e.message);
  }
  return botUsername;
}

function send(chatId, text, extra = {}) {
  return callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

function botLink(path = '') {
  return botUsername ? `https://t.me/${botUsername}${path}` : appUrl(path);
}

function appUrl(path = '') {
  return WEBAPP_URL ? `${WEBAPP_URL}${path}` : '';
}

// ---- Клавиатуры ----

function roleKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🏢 Заказчик (ищу сотрудников)', callback_data: 'role_employer' },
        { text: '👷 Исполнитель (ищу работу)', callback_data: 'role_seeker' },
      ],
      [{ text: '🔄 И то и другое', callback_data: 'role_both' }],
    ],
  };
}

function profileKeyboard() {
  const url = appUrl('/profile');
  return url
    ? {
        inline_keyboard: [
          [{ text: '👤 Заполнить профиль в приложении', web_app: { url } }],
          [{ text: '🔍 Вакансии', web_app: { url: appUrl('/') } }],
        ],
      }
    : undefined;
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
      [{ text: '📝 Разместить вакансию', web_app: { url: appUrl('/create') } }],
    ],
  };
}

// ---- Профиль ----

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

async function getProfile(telegramId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function updateProfile(telegramId, patch) {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('telegram_id', telegramId)
    .select()
    .single();
  if (error) throw new Error(error.message);
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

// ---- Тексты ----

function startText(name) {
  return (
    `Привет, ${name}! 👋\n\n` +
    'Я — бот сервиса поиска работы и сотрудников.\n\n' +
    '🔍 Вакансии и соискатели\n' +
    '• Поиск по городам, зарплате, навыкам\n' +
    '• Отклики на вакансии\n' +
    '• Публикация вакансий (оплата звёздами ⭐)\n\n' +
    '📱 Мини-приложение доступно внутри Telegram — откройте кнопку ниже.'
  );
}

function roleSelectionText() {
  return (
    '🎯 Выберите вашу роль:\n\n' +
    '🏢 <b>Заказчик</b> — ищу сотрудников, размещаю вакансии\n' +
    '👷 <b>Исполнитель</b> — ищу работу, откликаюсь на вакансии\n\n' +
    'Это можно будет изменить в профиле.'
  );
}

function roleConfirmationText(role) {
  return `✅ Вы выбрали роль: ${ROLE_RU[role] || role}\n\n` +
    'Теперь заполните ваш профиль — так работодатели и соискатели быстрее найдут друг друга.\n\n' +
    'Вы можете заполнить профиль прямо здесь в боте или открыть расширенную форму в приложении.';
}

function profileSummaryText(profile) {
  const reg = profile.is_registered ? '✅ профиль заполнен' : '⚠️ профиль не заполнен';
  const lines = [
    '👤 Ваш профиль:',
    '',
    `Имя: ${fullName(profile)}`,
    profile.username ? `@${profile.username}` : null,
    `Роль: ${ROLE_RU[profile.role] || 'не указана'}`,
    profile.city ? `Город: ${profile.city}` : null,
    profile.phone ? `Телефон: ${profile.phone}` : null,
    profile.experience_years ? `Опыт: ${profile.experience_years} лет` : null,
    profile.skills ? `Навыки: ${profile.skills.join(', ')}` : null,
    profile.resume_url ? '📄 Резюме: прикреплено' : null,
    profile.portfolio_url ? '💼 Портфолио: прикреплено' : null,
    profile.about_seeker ? `О себе: ${profile.about_seeker}` : null,
    profile.about_employer ? `О проекте: ${profile.about_employer}` : null,
    '',
    `Статус: ${reg}`,
  ];
  return lines.filter(Boolean).join('\n');
}

// ---- Команды ----

async function handleStart(from, chatId) {
  const name = from.first_name || 'друг';
  const profile = await getOrCreateProfile(from);

  await send(chatId, startText(name), {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📱 Открыть приложение', web_app: { url: appUrl() } }],
      ],
    },
  });

  // Быстрый переход к выбору роли, если роль не выбрана
  if (!profile.role) {
    await new Promise(r => setTimeout(r, 1500));
    await send(chatId, roleSelectionText(), { reply_markup: roleKeyboard() });
  } else {
    await new Promise(r => setTimeout(r, 1500));
    await send(chatId, profileSummaryText(profile), { reply_markup: profileKeyboard() });
  }
}

async function handleHelp(chatId) {
  const keyboard = mainKeyboard();
  await send(chatId,
    'ℹ️ <b>Сервис поиска работы</b>\n\n' +
    '🔍 <b>Поиск работы</b>\n' +
    'Откройте приложение → Вакансии. Фильтры: город, опыт, график, зарплата.\n\n' +
    '📨 <b>Отклики</b>\n' +
    'Откликнитесь на вакансию — заказчик увидит ваше резюме и контакты.\n\n' +
    '📝 <b>Публикация вакансий</b>\n' +
    'Разместите вакансию за оплату звёздами ⭐.\n\n' +
    '👤 <b>Профиль</b>\n' +
    'Заполните данные: роль, город, опыт, навыки, резюме, портфолио.\n\n' +
    '🚩 <b>Жалобы</b>\n' +
    'Пожалуйтесь на подозрительные объявления.\n\n' +
    '📊 <b>Мои вакансии / отклики</b>\n' +
    'Просматривайте статус через бота или приложение.',
    keyboard ? { reply_markup: keyboard } : {}
  );
}

async function handleProfile(from, chatId) {
  const profile = await getOrCreateProfile(from);
  const [jobsCount, responsesCount] = await Promise.all([
    countJobs(from.id),
    countResponses(from.id),
  ]);

  const lines = profileSummaryText(profile).split('\n');
  lines.push(`📋 Вакансий: ${jobsCount}`);
  lines.push(`📨 Откликов: ${responsesCount}`);

  await send(chatId, lines.join('\n'), { reply_markup: profileKeyboard() });
}

async function handleJobs(from, chatId) {
  const { data: jobs } = await supabase
    .from('jobs')
    .select('title, company, status, salary_from, city')
    .eq('author_id', from.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: responses } = await supabase
    .from('responses')
    .select('status, job:jobs(title, company, status)')
    .eq('applicant_id', from.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const parts = [];

  if (jobs && jobs.length) {
    parts.push('📋 Ваши вакансии:');
    jobs.forEach((j, i) => {
      const link = botLink(`/vacancy/${j.id}`);
      parts.push(`${i + 1}. ${j.title} — ${j.company || '—'} (${JOB_STATUS_RU[j.status] || j.status})\n   🔗 <a href="${link}">Подробнее</a>`);
    });
  } else {
    parts.push('📋 У вас пока нет вакансий.');
  }

  parts.push('');

  if (responses && responses.length) {
    parts.push('📨 Ваши отклики:');
    responses.forEach((r, i) => {
      const title = r.job?.title || 'вакансия удалена';
      const link = botLink(`/vacancy/${r.job?.id || ''}`);
      parts.push(`${i + 1}. <a href="${link}">${title}</a> (${RESPONSE_STATUS_RU[r.status] || r.status})`);
    });
  } else {
    parts.push('📨 Вы пока не откликались.');
  }

  await send(chatId, parts.join('\n'), {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📋 Мои вакансии', web_app: { url: appUrl('/my-jobs') } }],
        [{ text: '📨 Мои отклики', web_app: { url: appUrl('/responses') } }],
      ],
    },
  });
}

// ---- Обработка callback-запросов (выбор роли) ----

async function handleCallbackQuery(callbackQuery) {
  const { id, data, message } = callbackQuery;
  const chatId = message?.chat?.id;
  const from = callbackQuery.from;

  if (!chatId || !data || !from) return;

  // Ответ на callback (обязательно, чтобы исчезла кнопка "loading")
  await callTelegram('answerCallbackQuery', { callback_query_id: id });

  if (data.startsWith('role_')) {
    const role = data.replace('role_', '');
    if (!['employer', 'seeker', 'both'].includes(role)) {
      await send(chatId, '❌ Неизвестная роль. Попробуйте снова.');
      return;
    }

    const profile = await getOrCreateProfile(from);
    await updateProfile(from.id, { role, is_registered: true });

    const name = fullName(profile, from.first_name);
    await send(chatId, roleConfirmationText(role));

    // Отправляем форму для заполнения дополнительных полей
    if (role === 'employer') {
      await send(chatId,
        '🏢 <b>Данные заказчика</b>\n\n' +
        'Заполните краткую информацию о себе и проекте:\n' +
        '• Город\n' +
        '• Телефон или Telegram для связи\n' +
        '• О проекте — зачем ищете сотрудников\n\n' +
        'Или откройте полный профиль в приложении 👇',
        { reply_markup: { inline_keyboard: [[{ text: '👤 Открыть профиль', web_app: { url: appUrl('/profile') } }]] } }
      );
    } else {
      await send(chatId,
        '👷 <b>Данные исполнителя</b>\n\n' +
        'Заполните информацию о себе:\n' +
        '• Город и контакты\n' +
        '• Опыт работы (лет)\n' +
        '• Навыки (через запятую)\n' +
        '• Образование\n' +
        '• О себе\n\n' +
        '📄 Резюме и 💼 Портфолио — через приложение.\n\n' +
        'Или откройте полный профиль в приложении 👇',
        { reply_markup: { inline_keyboard: [[{ text: '👤 Открыть профиль', web_app: { url: appUrl('/profile') } }]] } }
      );
    }
  }
}

// ---- Уведомления об откликах ----

// Отправить уведомление заказчику о новом отклике.
async function notifyNewResponse(responseId, jobId, applicantId) {
  try {
    const { data: response } = await supabase
      .from('responses')
      .select('*, job:jobs!inner(telegram_id, title, company), applicant:profiles(telegram_id, first_name, last_name, username, phone, city, about_seeker)')
      .eq('id', responseId)
      .maybeSingle();

    if (!response || !response.job) return;

    const employerId = response.job.telegram_id;
    const applicant = response.applicant;

    if (!employerId || employerId === applicantId) return;

    const { data: employer } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('telegram_id', employerId)
      .maybeSingle();

    if (!employer) return;

    const applicantName = fullName(applicant, applicant.username);
    const text = (
      `📨 <b>Новый отклик на вашу вакансию!</b>\n\n` +
      `Вакансия: ${response.job.title}\n` +
      `Компания: ${response.job.company || '—'}\n\n` +
      `👤 Исполнитель: ${applicantName}\n` +
      (applicant.phone ? `📞 Телефон: ${applicant.phone}\n` : '') +
      (applicant.username ? `✈️ Telegram: @${applicant.username}\n` : '') +
      (applicant.city ? `📍 Город: ${applicant.city}\n` : '') +
      (applicant.about_seeker ? `\n📝 О себе: ${applicant.about_seeker}\n` : '') +
      `\nОткройте приложение, чтобы посмотреть детали и связаться.`
    );

    await send(employerId, text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Открыть отклик', web_app: { url: appUrl(`/responses`) } }],
        ],
      },
    });
  } catch (e) {
    console.error('[bot] ошибка уведомления об отклике:', e.message);
  }
}

// ---- Основной обработчик ----

async function handleMessage(msg) {
  const text = msg?.text;
  const chatId = msg?.chat?.id;
  if (!chatId || typeof text !== 'string' || !text.startsWith('/')) return false;

  const command = text.trim().split(/[\s@]/)[0].toLowerCase();
  const from = msg.from;

  try {
    switch (command) {
      case '/start':
        await handleStart(from, chatId);
        return true;

      case '/help':
        await handleHelp(chatId);
        return true;

      case '/profile':
        await handleProfile(from, chatId);
        return true;

      case '/jobs':
        await handleJobs(from, chatId);
        return true;

      default:
        await send(chatId, 'Неизвестная команда. Доступно: /start, /help, /profile, /jobs');
        return true;
    }
  } catch (e) {
    console.error('[bot] ошибка команды', command, e.message);
    try {
      await send(chatId, 'Произошла ошибка. Попробуйте позже.');
    } catch {}
    return true;
  }
}

// ---- Экспорт ----

module.exports = {
  handleMessage,
  handleCallbackQuery,
  notifyNewResponse,
  getMe,
  botLink,
  setMenuButton: async () => {
    if (!BOT_TOKEN) return;
    await getMe(); // Получаем имя бота для ссылок.
    const WEBAPP_URL = String(process.env.WEBAPP_URL || '').replace(/\/$/, '');
    if (WEBAPP_URL) {
      const res = await callTelegram('setChatMenuButton', {
        menu_button: { type: 'web_app', text: 'Открыть', web_app: { url: WEBAPP_URL } },
      });
      if (!res.ok) console.error('[bot] setChatMenuButton:', res.description);
    }
    const res = await callTelegram('setMyCommands', {
      commands: [
        { command: 'start', description: 'Главное меню' },
        { command: 'help', description: 'Помощь' },
        { command: 'profile', description: 'Мой профиль' },
        { command: 'jobs', description: 'Мои вакансии и отклики' },
      ],
    });
    if (!res.ok) console.error('[bot] setMyCommands:', res.description);
  },
  getOrCreateProfile,
};
