begin;

create table if not exists public.match_report_deliveries (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  telegram_id bigint not null,
  attempts integer not null default 0 check(attempts>=0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  unique(match_id,telegram_id)
);

create index if not exists match_report_deliveries_pending_idx
  on public.match_report_deliveries(created_at)
  where sent_at is null;

alter table public.match_report_deliveries enable row level security;
revoke all on table public.match_report_deliveries from public,anon,authenticated;
grant select,insert,update,delete on table public.match_report_deliveries to service_role;

create or replace function public.enqueue_match_owner_reports()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.match_report_deliveries(match_id,telegram_id)
  select new.id,u.telegram_id
  from public.league_clubs lc
  join public.users u on u.id=lc.manager_user_id
  where lc.id in(new.home_club_id,new.away_club_id)
    and lc.manager_type='HUMAN'
    and u.telegram_id is not null
  on conflict(match_id,telegram_id) do nothing;
  return new;
end $$;

drop trigger if exists enqueue_match_owner_reports_trigger on public.matches;
create trigger enqueue_match_owner_reports_trigger
after insert on public.matches
for each row execute function public.enqueue_match_owner_reports();

-- Old matches must not flood users when the outbox is introduced.
insert into public.match_report_deliveries(match_id,telegram_id,attempts,sent_at)
select distinct m.id,u.telegram_id,1,timezone('utc',now())
from public.matches m
join public.league_clubs lc on lc.id in(m.home_club_id,m.away_club_id)
join public.users u on u.id=lc.manager_user_id
where lc.manager_type='HUMAN' and u.telegram_id is not null
on conflict(match_id,telegram_id) do nothing;

commit;
