-- =========================================================
--  Job Mini App — схема базы данных для Supabase
--  Как применить: Supabase → SQL Editor → New query → вставить → Run.
--
--  ВНИМАНИЕ: скрипт ПЕРЕСОЗДАЁТ таблицы (удаляет старые данные).
--  Сейчас таблица jobs пустая, так что потерь не будет.
-- =========================================================

drop table if exists public.complaints cascade;
drop table if exists public.responses cascade;
drop table if exists public.payments cascade;
drop table if exists public.jobs cascade;
drop table if exists public.profiles cascade;

-- ---------- Пользователи (вход через Telegram) ----------
create table public.profiles (
  telegram_id   bigint primary key,
  username      text,
  first_name    text,
  last_name     text,
  language_code text,
  photo_url     text,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- Вакансии ----------
create table public.jobs (
  id                   uuid primary key default gen_random_uuid(),
  author_id            bigint not null references public.profiles(telegram_id) on delete cascade,
  title                text not null,
  company              text not null,
  company_logo_url     text,
  city                 text,
  is_remote            boolean not null default false,
  employment_type      text,   -- full / part / project / internship / volunteer
  schedule             text,   -- full_day / shift / flexible / remote / fly
  experience           text,   -- no_experience / between_1_3 / between_3_6 / more_6
  experience_years_min integer,
  salary_from          integer,
  salary_to            integer,
  currency             text not null default 'RUB',
  gross                boolean not null default true,
  description          text not null,
  responsibilities     text,
  requirements         text,
  conditions           text,
  skills               text[] not null default '{}',
  contact              text,
  contact_email        text,
  contact_phone        text,
  status               text not null default 'pending_payment', -- pending_payment / published / archived
  views                integer not null default 0,
  published_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------- Отклики ----------
create table public.responses (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  applicant_id bigint not null references public.profiles(telegram_id) on delete cascade,
  cover_letter text,
  contact      text,
  status       text not null default 'sent', -- sent / viewed / invited / rejected
  created_at   timestamptz not null default now(),
  unique (job_id, applicant_id)
);

-- ---------- Жалобы ----------
create table public.complaints (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  bigint not null references public.profiles(telegram_id) on delete cascade,
  job_id       uuid references public.jobs(id) on delete set null,
  reason       text not null,                    -- spam / fraud / offensive / wrong_info / other
  message      text,
  status       text not null default 'open',     -- open / resolved / rejected
  admin_reply  text,
  resolved_by  bigint references public.profiles(telegram_id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------- Платежи ----------
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  job_id      uuid references public.jobs(id) on delete set null,
  provider    text not null default 'telegram_stars',
  amount      integer not null,
  currency    text not null default 'XTR',
  status      text not null default 'pending', -- pending / paid / failed / canceled
  external_id text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);

-- ---------- Индексы ----------
create index jobs_status_idx       on public.jobs (status, published_at desc);
create index jobs_city_idx         on public.jobs (city);
create index jobs_author_idx       on public.jobs (author_id);
create index jobs_skills_idx       on public.jobs using gin (skills);
create index responses_job_idx     on public.responses (job_id);
create index responses_applicant_idx on public.responses (applicant_id);
create index payments_job_idx      on public.payments (job_id);
create index complaints_status_idx  on public.complaints (status, created_at desc);
create index complaints_job_idx     on public.complaints (job_id);
create index complaints_reporter_idx on public.complaints (reporter_id);

-- ---------- Автообновление updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ========================= RLS =========================
alter table public.profiles  enable row level security;
alter table public.jobs      enable row level security;
alter table public.responses enable row level security;
alter table public.payments  enable row level security;
alter table public.complaints enable row level security;

-- Публично (anon) можно читать опубликованные вакансии и профили авторов.
create policy "jobs public read"     on public.jobs     for select using (status = 'published');
create policy "profiles public read" on public.profiles for select using (true);

-- Все записи (insert/update/delete) делает ТОЛЬКО backend с ключом service_role,
-- который обходит RLS. Прямая запись из браузера (anon) запрещена.

-- ------------------------------------------------------------------
-- FALLBACK (НЕБЕЗОПАСНО, только для быстрой проверки без service_role):
-- если раскомментировать — любой с publishable-ключом сможет писать в базу
-- напрямую, минуя оплату. Для продакшена НЕ использовать.
-- ------------------------------------------------------------------
-- create policy "jobs anon write"      on public.jobs      for all using (true) with check (true);
-- create policy "profiles anon write"  on public.profiles  for all using (true) with check (true);
-- create policy "responses anon write" on public.responses for all using (true) with check (true);
-- create policy "payments anon write"  on public.payments  for all using (true) with check (true);
