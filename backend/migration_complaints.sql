-- =========================================================
--  Миграция для уже развёрнутой базы (без удаления данных).
--  Добавляет таблицу жалоб и поле is_admin (если их ещё нет).
--  Как применить: Supabase → SQL Editor → New query → вставить → Run.
-- =========================================================

-- Поле is_admin могло отсутствовать в старых версиях схемы.
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Таблица жалоб.
create table if not exists public.complaints (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  bigint not null references public.profiles(telegram_id) on delete cascade,
  job_id       uuid references public.jobs(id) on delete set null,
  reason       text not null,
  message      text,
  status       text not null default 'open',
  admin_reply  text,
  resolved_by  bigint references public.profiles(telegram_id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists complaints_status_idx   on public.complaints (status, created_at desc);
create index if not exists complaints_job_idx      on public.complaints (job_id);
create index if not exists complaints_reporter_idx on public.complaints (reporter_id);

alter table public.complaints enable row level security;
