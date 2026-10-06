-- Расширение таблицы профилей: резюме, портфолио, опыт, навыки.
-- Применить в Supabase → SQL Editor.

alter table public.profiles
  add column if not exists resume_url         text,
  add column if not exists portfolio_url       text,
  add column if not exists experience_years    integer,
  add column if not exists skills              text[],
  add column if not exists education           text,
  add column if not exists about_employer      text,  -- зачем размещает вакансию (для заказчика)
  add column if not exists about_seeker        text;  -- о себе (для исполнителя)
