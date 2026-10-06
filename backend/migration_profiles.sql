-- =========================================================
--  Миграция: поля регистрации в профиле пользователя.
--  Безопасна для уже развёрнутой базы (данные не удаляются).
--  Как применить: Supabase → SQL Editor → New query → вставить → Run.
-- =========================================================

alter table public.profiles add column if not exists role          text;
alter table public.profiles add column if not exists phone         text;
alter table public.profiles add column if not exists city          text;
alter table public.profiles add column if not exists about         text;
alter table public.profiles add column if not exists is_registered boolean not null default false;
