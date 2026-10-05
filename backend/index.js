require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { validateInitData } = require('./initData');
const { supabase, usingServiceRole } = require('./supabase');
const payments = require('./payments');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ALLOW_DEV_LOGIN = process.env.ALLOW_DEV_LOGIN === 'true';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------- auth

function parseInitData(req) {
  return req.get('X-Telegram-Init-Data') || req.body?.initData || req.query?.initData || '';
}

function getTgUser(req) {
  const initData = parseInitData(req);
  const user = validateInitData(initData, BOT_TOKEN);
  if (user) return user;

  // Только для локальной отладки в браузере без Telegram.
  if (ALLOW_DEV_LOGIN && req.get('X-Dev-User')) {
    return { id: Number(req.get('X-Dev-User')) || 1, first_name: 'Dev', username: 'dev' };
  }
  return null;
}

async function ensureProfile(user) {
  const row = {
    telegram_id: user.id,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    language_code: user.language_code || null,
    photo_url: user.photo_url || null,
  };
  const { data, error } = await supabase
    .from('profiles')
    .upsert(row, { onConflict: 'telegram_id' })
    .select()
    .single();
  if (error) throw new Error(`profiles upsert: ${error.message}`);
  return data;
}

// Обязательная авторизация.
async function requireAuth(req, res, next) {
  const user = getTgUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Не удалось подтвердить вход через Telegram' });
  try {
    req.profile = await ensureProfile(user);
    next();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

// Необязательная авторизация (для публичных страниц).
async function optionalAuth(req, _res, next) {
  const user = getTgUser(req);
  if (user) {
    try {
      req.profile = await ensureProfile(user);
    } catch {
      // игнорируем — публичный доступ остаётся доступным
    }
  }
  next();
}

// ---------------------------------------------------------------- helpers

function sanitizeSearch(q) {
  return String(q || '').replace(/[%,()*]/g, ' ').trim();
}

async function publishJob(jobId) {
  const { data, error } = await supabase
    .from('jobs')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', jobId)
    .select()
    .single();
  if (error) throw new Error(`publish job: ${error.message}`);
  return data;
}

async function markPaymentPaid(paymentId, externalId) {
  const { data: payment, error } = await supabase
    .from('payments')
    .update({ status: 'paid', external_id: externalId || null, paid_at: new Date().toISOString() })
    .eq('id', paymentId)
    .eq('status', 'pending')
    .select()
    .maybeSingle();
  if (error) throw new Error(`payment update: ${error.message}`);
  if (payment?.job_id) await publishJob(payment.job_id);
  return payment;
}

// ---------------------------------------------------------------- config

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/config', (_req, res) => {
  res.json({
    ok: true,
    priceStars: payments.PRICE_STARS,
    currency: 'XTR',
    paymentsEnabled: payments.enabled,
    usingServiceRole,
  });
});

// ---------------------------------------------------------------- auth

app.post('/api/auth/me', requireAuth, (req, res) => {
  res.json({ ok: true, profile: req.profile });
});

// ---------------------------------------------------------------- jobs (public)

app.get('/api/jobs', async (req, res) => {
  try {
    const { q, city, remote, experience, employment_type, schedule, salary_from, skills, sort } = req.query;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;

    let query = supabase.from('jobs').select('*', { count: 'exact' }).eq('status', 'published');

    if (city) query = query.ilike('city', `%${city}%`);
    if (remote === 'true') query = query.eq('is_remote', true);
    if (experience) query = query.eq('experience', experience);
    if (employment_type) query = query.eq('employment_type', employment_type);
    if (schedule) query = query.eq('schedule', schedule);
    if (salary_from) query = query.gte('salary_from', Number(salary_from));

    const skillList = String(skills || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (skillList.length) query = query.contains('skills', skillList);

    const term = sanitizeSearch(q);
    if (term) {
      query = query.or(
        `title.ilike.%${term}%,company.ilike.%${term}%,description.ilike.%${term}%`
      );
    }

    if (sort === 'salary') query = query.order('salary_from', { ascending: false, nullsFirst: false });
    else query = query.order('published_at', { ascending: false });

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    res.json({ ok: true, jobs: data, total: count });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/jobs/:id', optionalAuth, async (req, res) => {
  try {
    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) return res.status(404).json({ ok: false, error: 'Вакансия не найдена' });

    // Автор может смотреть свою вакансию в любом статусе, остальные — только опубликованную.
    const isOwner = req.profile && Number(req.profile.telegram_id) === Number(job.author_id);
    if (job.status !== 'published' && !isOwner) {
      return res.status(404).json({ ok: false, error: 'Вакансия не найдена' });
    }

    if (job.status === 'published' && !isOwner) {
      await supabase.from('jobs').update({ views: (job.views || 0) + 1 }).eq('id', job.id);
    }

    const { data: author } = await supabase
      .from('profiles')
      .select('telegram_id, first_name, last_name, username, photo_url')
      .eq('telegram_id', job.author_id)
      .maybeSingle();

    let hasResponded = false;
    if (req.profile) {
      const { data: resp } = await supabase
        .from('responses')
        .select('id')
        .eq('job_id', job.id)
        .eq('applicant_id', req.profile.telegram_id)
        .maybeSingle();
      hasResponded = Boolean(resp);
    }

    res.json({ ok: true, job: { ...job, author }, hasResponded, isOwner });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------------------------------------------------------- jobs (create + pay)

app.post('/api/jobs', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.title || !b.company || !b.description) {
      return res.status(400).json({ ok: false, error: 'Заполните название, компанию и описание' });
    }

    const jobRow = {
      author_id: req.profile.telegram_id,
      title: String(b.title).slice(0, 200),
      company: String(b.company).slice(0, 200),
      company_logo_url: b.company_logo_url || null,
      city: b.city || null,
      is_remote: Boolean(b.is_remote),
      employment_type: b.employment_type || null,
      schedule: b.schedule || null,
      experience: b.experience || null,
      experience_years_min: b.experience_years_min != null ? Number(b.experience_years_min) : null,
      salary_from: b.salary_from != null && b.salary_from !== '' ? Number(b.salary_from) : null,
      salary_to: b.salary_to != null && b.salary_to !== '' ? Number(b.salary_to) : null,
      currency: b.currency || 'RUB',
      gross: b.gross !== false,
      description: String(b.description),
      responsibilities: b.responsibilities || null,
      requirements: b.requirements || null,
      conditions: b.conditions || null,
      skills: Array.isArray(b.skills) ? b.skills.slice(0, 30) : [],
      contact: b.contact || null,
      contact_email: b.contact_email || null,
      contact_phone: b.contact_phone || null,
      status: 'pending_payment',
    };

    const { data: job, error: jobErr } = await supabase.from('jobs').insert(jobRow).select().single();
    if (jobErr) throw new Error(jobErr.message);

    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert({
        telegram_id: req.profile.telegram_id,
        job_id: job.id,
        provider: payments.enabled ? 'telegram_stars' : 'demo',
        amount: payments.PRICE_STARS,
        currency: 'XTR',
        status: 'pending',
        payload: { title: job.title },
      })
      .select()
      .single();
    if (payErr) throw new Error(payErr.message);

    let invoiceUrl = null;
    if (payments.enabled) {
      try {
        invoiceUrl = await payments.createInvoiceLink({
          title: 'Размещение вакансии',
          description: `Вакансия «${job.title}»`,
          payload: payment.id,
          amount: payments.PRICE_STARS,
        });
      } catch (e) {
        console.error('createInvoiceLink error:', e.message);
      }
    }

    res.json({
      ok: true,
      job,
      payment,
      invoiceUrl,
      paymentsEnabled: payments.enabled,
      priceStars: payments.PRICE_STARS,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------------------------------------------------------- responses

app.post('/api/jobs/:id/respond', requireAuth, async (req, res) => {
  try {
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, status, author_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (jobErr) throw new Error(jobErr.message);
    if (!job || job.status !== 'published') {
      return res.status(404).json({ ok: false, error: 'Вакансия недоступна' });
    }
    if (Number(job.author_id) === Number(req.profile.telegram_id)) {
      return res.status(400).json({ ok: false, error: 'Нельзя откликнуться на свою вакансию' });
    }

    const { data, error } = await supabase
      .from('responses')
      .upsert(
        {
          job_id: job.id,
          applicant_id: req.profile.telegram_id,
          cover_letter: req.body?.cover_letter || null,
          contact: req.body?.contact || null,
          status: 'sent',
        },
        { onConflict: 'job_id,applicant_id' }
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.json({ ok: true, response: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/my/responses', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('responses')
      .select('*, job:jobs(id, title, company, city, is_remote, salary_from, salary_to, currency, status)')
      .eq('applicant_id', req.profile.telegram_id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ ok: true, responses: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/my/jobs', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('*, payment:payments(id, status, amount, currency)')
      .eq('author_id', req.profile.telegram_id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ ok: true, jobs: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------------------------------------------------------- payments

// Demo-подтверждение оплаты (когда бот/Stars не настроены).
app.post('/api/payments/:id/demo-confirm', requireAuth, async (req, res) => {
  try {
    const { data: payment, error } = await supabase
      .from('payments')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!payment) return res.status(404).json({ ok: false, error: 'Платёж не найден' });
    if (Number(payment.telegram_id) !== Number(req.profile.telegram_id)) {
      return res.status(403).json({ ok: false, error: 'Нет доступа' });
    }

    const updated = await markPaymentPaid(payment.id, 'demo');
    res.json({ ok: true, payment: updated || payment });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// (Пере)создать ссылку на оплату для ожидающего платежа.
app.post('/api/payments/:id/invoice', requireAuth, async (req, res) => {
  try {
    const { data: payment, error } = await supabase
      .from('payments')
      .select('*, job:jobs(title)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!payment) return res.status(404).json({ ok: false, error: 'Платёж не найден' });
    if (Number(payment.telegram_id) !== Number(req.profile.telegram_id)) {
      return res.status(403).json({ ok: false, error: 'Нет доступа' });
    }
    if (payment.status !== 'pending') {
      return res.json({ ok: true, invoiceUrl: null, paymentsEnabled: payments.enabled, alreadyPaid: true });
    }

    if (!payments.enabled) {
      return res.json({ ok: true, invoiceUrl: null, paymentsEnabled: false });
    }

    const invoiceUrl = await payments.createInvoiceLink({
      title: 'Размещение вакансии',
      description: `Вакансия «${payment.job?.title || ''}»`,
      payload: payment.id,
      amount: payment.amount || payments.PRICE_STARS,
    });
    res.json({ ok: true, invoiceUrl, paymentsEnabled: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Проверить статус платежа (после возврата из openInvoice).
app.get('/api/payments/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('payments').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ ok: false, error: 'Платёж не найден' });
    if (Number(data.telegram_id) !== Number(req.profile.telegram_id)) {
      return res.status(403).json({ ok: false, error: 'Нет доступа' });
    }
    res.json({ ok: true, payment: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------------------------------------------------------- telegram updates

async function handleTelegramUpdate(update) {
  if (update.pre_checkout_query) {
    await payments.answerPreCheckoutQuery(update.pre_checkout_query.id, true);
    return;
  }
  const sp = update.message?.successful_payment;
  if (sp) {
    const paymentId = sp.invoice_payload;
    try {
      await markPaymentPaid(paymentId, sp.telegram_payment_charge_id || null);
      console.log('[payments] оплата подтверждена:', paymentId);
    } catch (e) {
      console.error('[payments] не удалось обработать оплату:', e.message);
    }
  }
}

app.post('/api/telegram/webhook', async (req, res) => {
  res.json({ ok: true });
  try {
    await handleTelegramUpdate(req.body);
  } catch (e) {
    console.error('webhook error:', e.message);
  }
});

// ---------------------------------------------------------------- start

app.listen(PORT, () => {
  console.log(`Backend запущен на порту ${PORT}`);
  console.log(`Платежи: ${payments.enabled ? 'Telegram Stars' : 'demo-режим (BOT_TOKEN не задан)'}`);
  if (payments.enabled) payments.startPolling(handleTelegramUpdate);
});
