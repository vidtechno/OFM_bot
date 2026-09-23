begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create table if not exists public.fixture_simulation_claims (
  fixture_id uuid primary key references public.fixtures(id) on delete cascade,
  worker_id uuid not null,
  claimed_at timestamptz not null default timezone('utc', now())
);

alter table public.fixture_simulation_claims enable row level security;
revoke all on table public.fixture_simulation_claims from public, anon, authenticated;

create or replace function public.claim_due_fixtures(
  p_limit integer default 20,
  p_worker_id uuid default gen_random_uuid()
) returns table(fixture_id uuid, home_club_id uuid, away_club_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select f.id, f.home_club_id, f.away_club_id
    from public.fixtures f
    left join public.fixture_simulation_claims existing on existing.fixture_id = f.id
    where f.status = 'SCHEDULED'
      and f.scheduled_at <= timezone('utc', now())
      and (existing.fixture_id is null or existing.claimed_at < timezone('utc', now()) - interval '5 minutes')
    order by f.scheduled_at, f.id
    limit greatest(1, least(p_limit, 40))
    for update of f skip locked
  ), claimed as (
    insert into public.fixture_simulation_claims(fixture_id, worker_id, claimed_at)
    select c.id, p_worker_id, timezone('utc', now())
    from candidates c
    on conflict (fixture_id) do update
      set worker_id = excluded.worker_id,
          claimed_at = excluded.claimed_at
      where public.fixture_simulation_claims.claimed_at < timezone('utc', now()) - interval '5 minutes'
    returning fixture_id
  )
  select c.id, c.home_club_id, c.away_club_id
  from candidates c
  join claimed x on x.fixture_id = c.id;
end;
$$;

create or replace function public.release_fixture_claim(p_fixture_id uuid, p_worker_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.fixture_simulation_claims
  where fixture_id = p_fixture_id and worker_id = p_worker_id;
$$;

revoke all on function public.claim_due_fixtures(integer, uuid) from public, anon, authenticated;
revoke all on function public.release_fixture_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_due_fixtures(integer, uuid) to service_role;
grant execute on function public.release_fixture_claim(uuid, uuid) to service_role;

create or replace function public.complete_match(
  p_fixture_id uuid,p_home_goals smallint,p_away_goals smallint,p_stats jsonb,p_events jsonb,p_engine_version text default 'v1'
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_fixture public.fixtures%rowtype;v_match uuid;v_home_income numeric:=1500000;v_away_income numeric:=1500000;v_balance numeric;
begin
  select * into v_fixture from public.fixtures where id=p_fixture_id for update;
  if not found then raise exception 'FIXTURE_NOT_FOUND';end if;
  if v_fixture.status='PLAYED' then
    delete from public.fixture_simulation_claims where fixture_id=p_fixture_id;
    select id into v_match from public.matches where fixture_id=p_fixture_id;
    return v_match;
  end if;
  if v_fixture.status<>'SCHEDULED' or v_fixture.scheduled_at>timezone('utc',now()) then raise exception 'FIXTURE_NOT_DUE';end if;
  insert into public.matches(fixture_id,league_instance_id,home_club_id,away_club_id,home_goals,away_goals,engine_version)
  values(p_fixture_id,v_fixture.league_instance_id,v_fixture.home_club_id,v_fixture.away_club_id,p_home_goals,p_away_goals,p_engine_version) returning id into v_match;
  insert into public.match_stats values(v_match,(p_stats->>'possessionHome')::smallint,(p_stats->>'shotsHome')::smallint,(p_stats->>'shotsAway')::smallint,
    (p_stats->>'shotsOnTargetHome')::smallint,(p_stats->>'shotsOnTargetAway')::smallint,(p_stats->>'cornersHome')::smallint,(p_stats->>'cornersAway')::smallint,
    (p_stats->>'foulsHome')::smallint,(p_stats->>'foulsAway')::smallint);
  insert into public.match_events(match_id,minute,event_type,club_id,metadata)
  select v_match,(e->>'minute')::smallint,e->>'type',case when e->>'side'='HOME' then v_fixture.home_club_id else v_fixture.away_club_id end,'{}'::jsonb
  from jsonb_array_elements(p_events)e;
  if p_home_goals>p_away_goals then v_home_income:=v_home_income+900000;
  elsif p_home_goals<p_away_goals then v_away_income:=v_away_income+900000;
  else v_home_income:=v_home_income+400000;v_away_income:=v_away_income+400000;end if;
  update public.league_clubs set played=played+1,wins=wins+(p_home_goals>p_away_goals)::int,draws=draws+(p_home_goals=p_away_goals)::int,
    losses=losses+(p_home_goals<p_away_goals)::int,goals_for=goals_for+p_home_goals,goals_against=goals_against+p_away_goals,
    points=points+case when p_home_goals>p_away_goals then 3 when p_home_goals=p_away_goals then 1 else 0 end,cash_balance=cash_balance+v_home_income
  where id=v_fixture.home_club_id returning cash_balance into v_balance;
  insert into public.finance_transactions(league_club_id,match_id,kind,amount,balance_after,description) values(v_fixture.home_club_id,v_match,'MATCH_BASE',1500000,v_balance-(v_home_income-1500000),'Match income');
  if v_home_income>1500000 then insert into public.finance_transactions values(default,v_fixture.home_club_id,v_match,'RESULT_BONUS',v_home_income-1500000,v_balance,'Result bonus',default);end if;
  update public.league_clubs set played=played+1,wins=wins+(p_away_goals>p_home_goals)::int,draws=draws+(p_home_goals=p_away_goals)::int,
    losses=losses+(p_away_goals<p_home_goals)::int,goals_for=goals_for+p_away_goals,goals_against=goals_against+p_home_goals,
    points=points+case when p_away_goals>p_home_goals then 3 when p_home_goals=p_away_goals then 1 else 0 end,cash_balance=cash_balance+v_away_income
  where id=v_fixture.away_club_id returning cash_balance into v_balance;
  insert into public.finance_transactions(league_club_id,match_id,kind,amount,balance_after,description) values(v_fixture.away_club_id,v_match,'MATCH_BASE',1500000,v_balance-(v_away_income-1500000),'Match income');
  if v_away_income>1500000 then insert into public.finance_transactions values(default,v_fixture.away_club_id,v_match,'RESULT_BONUS',v_away_income-1500000,v_balance,'Result bonus',default);end if;
  update public.fixtures set status='PLAYED' where id=p_fixture_id;
  update public.league_instances li
  set current_round=coalesce(
    (select min(f.round_number)-1 from public.fixtures f where f.league_instance_id=li.id and f.status<>'PLAYED'),
    (select max(f.round_number) from public.fixtures f where f.league_instance_id=li.id),
    0
  )
  where id=v_fixture.league_instance_id;
  delete from public.fixture_simulation_claims where fixture_id=p_fixture_id;
  return v_match;
end $$;

revoke all on function public.complete_match(uuid,smallint,smallint,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.complete_match(uuid,smallint,smallint,jsonb,jsonb,text) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'match_scheduler') then
    perform cron.unschedule('match_scheduler');
  end if;
end $$;

select cron.schedule(
  'match_scheduler',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := 'https://fcwonehtpuyzdyuxcvre.supabase.co/functions/v1/match-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
        current_setting('app.settings.service_role_key', true)
      ),
      'User-Agent', 'Supabase-Match-Scheduler/1.0'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);

commit;
