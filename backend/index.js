require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { validateInitData } = require('./initData');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

if (!BOT_TOKEN) {
  console.error('Ошибка: BOT_TOKEN не задан. Скопируйте .env.example в .env и укажите токен.');
  process.exit(1);
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Хранилище в памяти — только для демо. В продакшене замените на БД.
const jobs = [];
const responses = [];

// Middleware: пускает дальше только запросы с валидным initData.
function requireTelegramAuth(req, res, next) {
  const user = validateInitData(req.body?.initData, BOT_TOKEN);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'invalid initData' });
  }
  req.tgUser = user;
  next();
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Список вакансий (демо-хранилище в памяти).
app.get('/api/jobs', (_req, res) => res.json({ ok: true, jobs }));

// Публикация вакансии.
app.post('/api/jobs', requireTelegramAuth, (req, res) => {
  const { title, company, salary, city, remote, description } = req.body;
  if (!title || !company) {
    return res.status(400).json({ ok: false, error: 'title and company are required' });
  }

  const job = {
    id: jobs.length + 1,
    title,
    company,
    salary: salary || '',
    city: city || '',
    remote: Boolean(remote),
    description: description || '',
    authorId: req.tgUser.id,
    createdAt: new Date().toISOString(),
  };
  jobs.push(job);
  res.json({ ok: true, job });
});

// Отклик на вакансию.
app.post('/api/respond', requireTelegramAuth, (req, res) => {
  const { jobId } = req.body;
  if (jobId === undefined || jobId === null) {
    return res.status(400).json({ ok: false, error: 'jobId is required' });
  }

  const response = { jobId, user: req.tgUser, at: new Date().toISOString() };
  responses.push(response);
  console.log('Новый отклик:', response);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Backend запущен на порту ${PORT}`);
});
