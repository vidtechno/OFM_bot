begin;

-- Match-event persistence and report generation mark penalty goals explicitly.
alter table public.match_events
  add column if not exists is_penalty boolean not null default false;

commit;
