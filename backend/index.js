require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { validateInitData } = require('./initData');
const { supabase, usingServiceRole } = require('./supabase');
const payments = require('./payments');
const bot = require('./bot');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ALLOW_DEV_LOGIN = process.env.ALLOW_DEV_LOGIN === 'true';

// Telegram ID администраторов (через запятую). Эти пользователи получают доступ
// к админ-разделу и API. Пример: ADMIN_TELEGRAM_IDS=123456789,987654321
const ADMIN_TELEGRAM_IDS = String(process.env.ADMIN_TELEGRAM_IDS || '')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

function isConfiguredAdmin(id) {
  return ADMIN_TELEGRAM_IDS.includes(Number(id));
}

const JOB_STATUSES = ['pending_payment', 'published', 'archived', 'rejected'];
const RESPONSE_STATUSES = ['sent', 'viewed', 'invited', 'rejected'];
const COMPLAINT_STATUSES = ['open', 'resolved', 'rejected'];
const COMPLAINT_REASONS = ['spam', 'fraud', 'offensive', 'wrong_info', 'other'];

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
  // Администраторы из ADMIN_TELEGRAM_IDS всегда получают флаг is_admin.
  if (isConfiguredAdmin(user.id)) row.is_admin = true;

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

// Доступ только для администраторов.
async function requireAdmin(req, res, next) {
  const user = getTgUser(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Не удалось подтвердить вход через Telegram' });
  }
  try {
    req.profile = await ensureProfile(user);
    if (!req.profile.is_admin) {
      return res.status(403).json({ ok: false, error: 'Доступ только для администраторов' });
    }
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

// Количество строк по фильтру (для статистики).
async function countRows(table, applyFilter) {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  if (applyFilter) query = applyFilter(query);
  const { count, error } = await query;
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count || 0;
}

// Безопасное приведение к целому (или null).
function toIntOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
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
    complaintReasons: COMPLAINT_REASONS,
  });
});

// ---------------------------------------------------------------- auth

app.post('/api/auth/me', requireAuth, (req, res) => {
  res.json({ ok: true, profile: req.profile });
});

// Регистрация в приложении / редактирование профиля.
// Заполняет роль, телефон, город и «о себе», ставит флаг is_registered.
const PROFILE_ROLES = ['seeker', 'employer', 'both'];

app.patch('/api/profile', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};

    if (b.first_name !== undefined) patch.first_name = b.first_name ? String(b.first_name).slice(0, 100) : null;
    if (b.last_name !== undefined) patch.last_name = b.last_name ? String(b.last_name).slice(0, 100) : null;
    if (b.phone !== undefined) patch.phone = b.phone ? String(b.phone).slice(0, 40) : null;
    if (b.city !== undefined) patch.city = b.city ? String(b.city).slice(0, 120) : null;
    if (b.about !== undefined) patch.about = b.about ? String(b.about).slice(0, 2000) : null;
    if (b.role !== undefined) {
      if (b.role && !PROFILE_ROLES.includes(b.role)) {
        return res.status(400).json({ ok: false, error: 'Недопустимая роль' });
      }
      patch.role = b.role || null;
    }

    // Явная регистрация: требуется имя и роль.
    if (b.register === true || b.is_registered === true) {
      const name = patch.first_name !== undefined ? patch.first_name : req.profile.first_name;
      const role = patch.role !== undefined ? patch.role : req.profile.role;
      if (!name) return res.status(400).json({ ok: false, error: 'Укажите имя' });
      if (!role) return res.status(400).json({ ok: false, error: 'Выберите роль' });
      patch.is_registered = true;
    }

    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, error: 'Нет полей для обновления' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('telegram_id', req.profile.telegram_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.json({ ok: true, profile: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
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

// Редактирование своей вакансии (и публикация/архив после оплаты).
app.patch('/api/my/jobs/:id', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) return res.status(404).json({ ok: false, error: 'Вакансия не найдена' });
    if (Number(job.author_id) !== Number(req.profile.telegram_id)) {
      return res.status(403).json({ ok: false, error: 'Нет доступа' });
    }

    const patch = {};
    const text = (v, max) => (v == null ? null : String(v).slice(0, max));
    if (b.title !== undefined) patch.title = text(b.title, 200);
    if (b.company !== undefined) patch.company = text(b.company, 200);
    if (b.company_logo_url !== undefined) patch.company_logo_url = b.company_logo_url || null;
    if (b.description !== undefined) patch.description = text(b.description, 20000);
    if (b.city !== undefined) patch.city = b.city || null;
    if (b.is_remote !== undefined) patch.is_remote = Boolean(b.is_remote);
    if (b.employment_type !== undefined) patch.employment_type = b.employment_type || null;
    if (b.schedule !== undefined) patch.schedule = b.schedule || null;
    if (b.experience !== undefined) patch.experience = b.experience || null;
    if (b.salary_from !== undefined) patch.salary_from = toIntOrNull(b.salary_from);
    if (b.salary_to !== undefined) patch.salary_to = toIntOrNull(b.salary_to);
    if (b.currency !== undefined) patch.currency = b.currency || 'RUB';
    if (b.gross !== undefined) patch.gross = b.gross !== false;
    if (b.responsibilities !== undefined) patch.responsibilities = text(b.responsibilities, 20000);
    if (b.requirements !== undefined) patch.requirements = text(b.requirements, 20000);
    if (b.conditions !== undefined) patch.conditions = text(b.conditions, 20000);
    if (b.contact !== undefined) patch.contact = b.contact || null;
    if (b.contact_email !== undefined) patch.contact_email = b.contact_email || null;
    if (b.contact_phone !== undefined) patch.contact_phone = b.contact_phone || null;
    if (Array.isArray(b.skills)) patch.skills = b.skills.slice(0, 30).map((s) => String(s).slice(0, 60));

    if (b.status !== undefined) {
      if (job.status === 'pending_payment') {
        return res.status(400).json({ ok: false, error: 'Сначала оплатите размещение вакансии' });
      }
      if (job.status === 'rejected') {
        return res.status(400).json({ ok: false, error: 'Вакансия отклонена модератором' });
      }
      if (!['published', 'archived'].includes(b.status)) {
        return res.status(400).json({ ok: false, error: 'Недопустимый статус' });
      }
      patch.status = b.status;
      if (b.status === 'published') patch.published_at = job.published_at || new Date().toISOString();
    }

    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, error: 'Нет полей для обновления' });
    }

    const { data: updated, error: updErr } = await supabase
      .from('jobs')
      .update(patch)
      .eq('id', job.id)
      .select()
      .single();
    if (updErr) throw new Error(updErr.message);
    res.json({ ok: true, job: updated });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Удаление своей вакансии.
app.delete('/api/my/jobs/:id', requireAuth, async (req, res) => {
  try {
    const { data: job, error } = await supabase
      .from('jobs')
      .select('id, author_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) return res.status(404).json({ ok: false, error: 'Вакансия не найдена' });
    if (Number(job.author_id) !== Number(req.profile.telegram_id)) {
      return res.status(403).json({ ok: false, error: 'Нет доступа' });
    }
    const { error: delErr } = await supabase.from('jobs').delete().eq('id', job.id);
    if (delErr) throw new Error(delErr.message);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Отклики на мои вакансии (для работодателя).
app.get('/api/my/received-responses', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('responses')
      .select(
        '*, job:jobs!inner(id, title, company, author_id, status), applicant:profiles!responses_applicant_id_fkey(telegram_id, first_name, last_name, username, photo_url)'
      )
      .eq('job.author_id', req.profile.telegram_id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ ok: true, responses: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Смена статуса отклика владельцем вакансии (просмотрен / приглашение / отказ).
app.patch('/api/responses/:id/status', requireAuth, async (req, res) => {
  try {
    const status = req.body?.status;
    if (!RESPONSE_STATUSES.includes(status)) {
      return res.status(400).json({ ok: false, error: 'Недопустимый статус отклика' });
    }
    const { data: resp, error } = await supabase
      .from('responses')
      .select('id, job:jobs(author_id)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!resp) return res.status(404).json({ ok: false, error: 'Отклик не найден' });
    if (Number(resp.job?.author_id) !== Number(req.profile.telegram_id)) {
      return res.status(403).json({ ok: false, error: 'Нет доступа' });
    }
    const { data, error: updErr } = await supabase
      .from('responses')
      .update({ status })
      .eq('id', resp.id)
      .select()
      .single();
    if (updErr) throw new Error(updErr.message);
    res.json({ ok: true, response: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------------------------------------------------------- complaints (users)

app.post('/api/complaints', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const reason = String(b.reason || '').trim();
    if (!COMPLAINT_REASONS.includes(reason)) {
      return res.status(400).json({ ok: false, error: 'Укажите корректную причину жалобы' });
    }

    const jobId = b.job_id || null;
    if (jobId) {
      const { data: job, error: jobErr } = await supabase
        .from('jobs')
        .select('id, author_id')
        .eq('id', jobId)
        .maybeSingle();
      if (jobErr) throw new Error(jobErr.message);
      if (!job) return res.status(404).json({ ok: false, error: 'Вакансия не найдена' });
      if (Number(job.author_id) === Number(req.profile.telegram_id)) {
        return res.status(400).json({ ok: false, error: 'Нельзя пожаловаться на свою вакансию' });
      }
    }

    // Не даём создавать дубли открытых жалоб.
    let dup = supabase
      .from('complaints')
      .select('id')
      .eq('reporter_id', req.profile.telegram_id)
      .eq('status', 'open');
    dup = jobId ? dup.eq('job_id', jobId) : dup.is('job_id', null);
    const { data: existing } = await dup.maybeSingle();
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Вы уже отправили жалобу, она на рассмотрении' });
    }

    const { data, error } = await supabase
      .from('complaints')
      .insert({
        reporter_id: req.profile.telegram_id,
        job_id: jobId,
        reason,
        message: b.message ? String(b.message).slice(0, 2000) : null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.json({ ok: true, complaint: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/my/complaints', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('complaints')
      .select('*, job:jobs(id, title, company)')
      .eq('reporter_id', req.profile.telegram_id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ ok: true, complaints: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------------------------------------------------------- admin

app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
  try {
    const [users, jobsTotal, jobsPublished, jobsPending, responses, complaintsOpen, complaintsTotal, paymentsPaid] =
      await Promise.all([
        countRows('profiles'),
        countRows('jobs'),
        countRows('jobs', (q) => q.eq('status', 'published')),
        countRows('jobs', (q) => q.eq('status', 'pending_payment')),
        countRows('responses'),
        countRows('complaints', (q) => q.eq('status', 'open')),
        countRows('complaints'),
        countRows('payments', (q) => q.eq('status', 'paid')),
      ]);
    res.json({
      ok: true,
      stats: { users, jobsTotal, jobsPublished, jobsPending, responses, complaintsOpen, complaintsTotal, paymentsPaid },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/admin/jobs', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    let query = supabase
      .from('jobs')
      .select('*, author:profiles!jobs_author_id_fkey(telegram_id, first_name, last_name, username)', {
        count: 'exact',
      });
    if (status) query = query.eq('status', status);
    const term = sanitizeSearch(req.query.q);
    if (term) query = query.or(`title.ilike.%${term}%,company.ilike.%${term}%`);
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    res.json({ ok: true, jobs: data, total: count });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.patch('/api/admin/jobs/:id', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};
    if (b.status !== undefined) {
      if (!JOB_STATUSES.includes(b.status)) {
        return res.status(400).json({ ok: false, error: 'Недопустимый статус вакансии' });
      }
      patch.status = b.status;
      if (b.status === 'published') patch.published_at = new Date().toISOString();
    }
    if (b.title !== undefined) patch.title = String(b.title).slice(0, 200);
    if (b.company !== undefined) patch.company = String(b.company).slice(0, 200);
    if (b.description !== undefined) patch.description = String(b.description).slice(0, 20000);

    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, error: 'Нет полей для обновления' });
    }
    const { data, error } = await supabase.from('jobs').update(patch).eq('id', req.params.id).select().single();
    if (error) throw new Error(error.message);
    res.json({ ok: true, job: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/admin/jobs/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase.from('jobs').delete().eq('id', req.params.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/admin/complaints', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    let query = supabase
      .from('complaints')
      .select(
        '*, job:jobs(id, title, company, status, author_id), reporter:profiles!complaints_reporter_id_fkey(telegram_id, first_name, last_name, username)',
        { count: 'exact' }
      );
    if (status) query = query.eq('status', status);
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    res.json({ ok: true, complaints: data, total: count });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.patch('/api/admin/complaints/:id', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};
    if (b.status !== undefined) {
      if (!COMPLAINT_STATUSES.includes(b.status)) {
        return res.status(400).json({ ok: false, error: 'Недопустимый статус жалобы' });
      }
      patch.status = b.status;
      if (b.status === 'open') {
        patch.resolved_by = null;
        patch.resolved_at = null;
      } else {
        patch.resolved_by = req.profile.telegram_id;
        patch.resolved_at = new Date().toISOString();
      }
    }
    if (b.admin_reply !== undefined) {
      patch.admin_reply = b.admin_reply ? String(b.admin_reply).slice(0, 2000) : null;
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ ok: false, error: 'Нет полей для обновления' });
    }
    const { data, error } = await supabase
      .from('complaints')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.json({ ok: true, complaint: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    let query = supabase.from('profiles').select('*', { count: 'exact' });
    const term = sanitizeSearch(req.query.q);
    if (term) {
      query = query.or(`username.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
    }
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    res.json({ ok: true, users: data, total: count });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const isAdmin = Boolean(req.body?.is_admin);
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_admin: isAdmin })
      .eq('telegram_id', req.params.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.json({ ok: true, user: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------------------------------------------------------- payments

// Demo-подтверждение оплаты (когда бот/Stars не настроены).
// В боевом режиме (BOT_TOKEN задан) этот эндпоинт отключён — иначе можно было бы
// публиковать вакансии бесплатно, минуя оплату Stars.
app.post('/api/payments/:id/demo-confirm', requireAuth, async (req, res) => {
  try {
    if (payments.enabled) {
      return res.status(400).json({ ok: false, error: 'Демо-оплата отключена. Используйте оплату звёздами.' });
    }
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
    if (payment.status === 'paid') {
      return res.json({ ok: true, payment, alreadyPaid: true });
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
    return;
  }

  // Команды бота (/start, /help, /jobs, /profile).
  if (update.message?.text) {
    try {
      await bot.handleMessage(update.message);
    } catch (e) {
      console.error('[bot] ошибка обработки команды:', e.message);
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
  if (payments.enabled) {
    payments.startPolling(handleTelegramUpdate);
    // Кнопка-меню со ссылкой на Mini App (нужен WEBAPP_URL).
    bot.setMenuButton().catch((e) => console.error('[bot] setMenuButton:', e.message));
  }
});
