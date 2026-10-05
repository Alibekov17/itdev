// Настройка Supabase одной командой: применяет schema.sql и получает service_role ключ.
//
// Что нужно: SUPABASE_ACCESS_TOKEN (personal access token) в backend/.env
// Получить: https://supabase.com/dashboard/account/tokens
//
// Запуск: npm run db:setup
//
// ВНИМАНИЕ: schema.sql пересоздаёт таблицы (удаляет данные в profiles/jobs/responses/payments).

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const PAT = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const ENV_FILE = path.join(__dirname, '.env');

function projectRef() {
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL не задан в .env');
  return new URL(SUPABASE_URL).hostname.split('.')[0];
}

async function api(ref, pathname, options = {}) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

function setEnvValue(key, value) {
  let content = fs.readFileSync(ENV_FILE, 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) content = content.replace(re, `${key}=${value}`);
  else content += `${content.endsWith('\n') ? '' : '\n'}${key}=${value}\n`;
  fs.writeFileSync(ENV_FILE, content);
}

(async () => {
  if (!PAT) {
    console.error(
      '\nНужен SUPABASE_ACCESS_TOKEN.\n' +
        '1) Откройте https://supabase.com/dashboard/account/tokens\n' +
        '2) Создайте токен и вставьте его в backend/.env как SUPABASE_ACCESS_TOKEN\n' +
        '3) Повторите: npm run db:setup\n'
    );
    process.exit(1);
  }

  const ref = projectRef();
  console.log(`Проект: ${ref}`);

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Применяю schema.sql…');
  await api(ref, '/database/query', { method: 'POST', body: JSON.stringify({ query: sql }) });
  console.log('✓ Схема применена.');

  console.log('Получаю ключи проекта…');
  const keys = await api(ref, '/api-keys?reveal=true');
  const serviceRole = (keys || []).find((k) => k.name === 'service_role');
  if (!serviceRole?.api_key) {
    throw new Error('service_role ключ не найден в ответе API.');
  }

  setEnvValue('SUPABASE_SERVICE_ROLE_KEY', serviceRole.api_key);
  console.log('✓ SUPABASE_SERVICE_ROLE_KEY записан в backend/.env.');
  console.log('\nГотово. Запускайте: npm run dev');
})().catch((e) => {
  console.error('\nОшибка:', e.message);
  process.exit(1);
});
