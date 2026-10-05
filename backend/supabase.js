const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url) {
  throw new Error('SUPABASE_URL не задан. Скопируйте backend/.env.example в .env и заполните.');
}
if (!serviceKey && !anonKey) {
  throw new Error('Задайте SUPABASE_SERVICE_ROLE_KEY (рекомендуется) или SUPABASE_ANON_KEY.');
}

const usingServiceRole = Boolean(serviceKey);

if (!usingServiceRole) {
  console.warn(
    '\n[!] Используется SUPABASE_ANON_KEY без service_role.\n' +
      '    Запись в базу будет отклонена RLS, пока вы не включите fallback-политики\n' +
      '    в schema.sql или не добавите SUPABASE_SERVICE_ROLE_KEY в .env.\n'
  );
}

const supabase = createClient(url, serviceKey || anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = { supabase, usingServiceRole };
