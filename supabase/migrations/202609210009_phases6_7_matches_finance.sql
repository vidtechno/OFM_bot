begin;

alter table public.league_clubs add column cash_balance numeric(16,2) not null default 0 check(cash_balance>=0);
alter table public.league_clubs add column transfer_budget numeric(16,2) not null default 0 check(transfer_budget>=0);
update public.league_clubs lc set cash_balance=c.starting_budget,transfer_budget=c.starting_budget from public.clubs c where c.id=lc.club_id;

create table public.matches (
  id uuid primary key default gen_random_uuid(), fixture_id uuid not null unique references public.fixtures(id),
  league_instantace_id uuid not null references public.league_instances(id) on delete cascade,
  home_club_id uuid not null references public.league_clubs(id), away_club_id uuid not null references public.league_clubs(id),
  home_goals smallint not null check(home_goals between 0 and 20), away_goals smallint not null check(away_goals between 0 and 20),
  played_at timestamptz not null default timezone('utc',now()), engine_version text not null default 'v1'
);
create index matches_clubs_idx on public.matches(home_club_id,away_club_id,played_at desc);

create table public.match_stats (
  match_id uuid primary key references public.matches(id) on delete cascade,
  possession_home smallint not null check(possession_home between 0 and 100),
  shots_home smallint not null check(shots_home>=0), shots_away smallint not null check(shots_away>=0),
  shots_on_target_home smallint not null check(shots_on_target_home>=0), shots_on_target_away smallint not null check(shots_on_target_away>=0),
  corners_home smallint not null check(corners_home>=0), corners_away smallint not null check(corners_away>=0),
  fouls_home smallint not null check(fouls_home>=0), fouls_away smallint not null check(fouls_away>=0)
);

create table public.match_events (
  id bigint generated always as identity primary key, match_id uuid not null references public.matches(id) on delete cascade,
  minute smallint not null check(minute between 1 and 130), event_type text not null check(event_type in('GOAL','YELLOW_CARD','RED_CARD','SUBSTITUTION','INJURY')),
  club_id uuid not null references public.league_clubs(id), player_id uuid references public.players(id), metadata jsonb not null default '{}'
);
create index match_events_match_idx on public.match_events(match_id,minute,id);

create table public.player_match_stats (
  match_id uuid not null references public.matches(id) on delete cascade, player_id uuid not null references public.players(id),
  club_id uuid not null references public.league_clubs(id), minutes smallint not null default 0 check(minutes between 0 and 130),
  rating numeric(4,2) check(rating between 1 and 10), goals smallint not null default 0, assists smallint not null default 0,
  yellow_cards smallint not null default 0, red_cards smallint not null default 0,
  primary key(match_id,player_id)
);

create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(), league_club_id uuid not null references public.league_clubs(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade, kind text not null check(kind in('MATCH_BASE','RESULT_BONUS','SPONSOR','TRANSFER','ADMIN_ADJUSTMENT')),
  amount numeric(16,2) not null, balance_after numeric(16,2) not null, description text not null,
  created_at timestamptz not null default timezone('utc',now()), unique(match_id,league_club_id,kind)
);
create index finance_transactions_club_idx on public.finance_transactions(league_club_id,created_at desc);

create function public.complete_match(
  p_fixture_id uuid,p_home_goals smallint,p_away_goals smallint,p_stats jsonb,p_events jsonb,p_engine_version text default 'v1'
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_fixture public.fixtures%rowtype;v_match uuid;v_home_income numeric:=1500000;v_away_income numeric:=1500000;v_balance numeric;
begin
  select * into v_fixture from public.fixtures where id=p_fixture_id for update;
  if not found then raise exception 'FIXTURE_NOT_FOUND';end if;
  if v_fixture.status='PLAYED' then select id into v_match from public.matches where fixture_id=p_fixture_id;return v_match;end if;
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
  update public.league_instances li set current_round=coalesce((select min(r)-1 from generate_series(1,38)r where exists(select 1 from public.fixtures f where f.league_instance_id=li.id and f.round_number=r and f.status<>'PLAYED')),38)
  where id=v_fixture.league_instance_id;
  return v_match;
end $$;

alter table public.matches enable row level security;alter table public.match_stats enable row level security;alter table public.match_events enable row level security;
alter table public.player_match_stats enable row level security;alter table public.finance_transactions enable row level security;
revoke all on table public.matches,public.match_stats,public.match_events,public.player_match_stats,public.finance_transactions from anon,authenticated;
revoke all on function public.complete_match(uuid,smallint,smallint,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.complete_match(uuid,smallint,smallint,jsonb,jsonb,text) to service_role;
commit;
