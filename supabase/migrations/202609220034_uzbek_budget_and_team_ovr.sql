-- Migration: 202609220034_uzbek_budget_and_team_ovr.sql
-- Goal: Set Uzbek Superliga starting transfer budget to €7,000,000.
-- Update existing fresh UZB lobbies to €7,000,000.
-- Update create_league_instance to set €7M for UZB and €100M for ELITE.
-- Add calculate_club_team_ovr database function.

begin;

-- 1. Update clubs catalog starting_budget for Uzbek clubs
update public.clubs
set starting_budget = 7000000
where competition_id in (select id from public.competitions where code = 'UZB');

update public.clubs
set starting_budget = 100000000
where competition_id in (select id from public.competitions where code = 'ELITE');

-- 2. Update existing fresh league_clubs in UZB league instances (with 0 transfer activity)
update public.league_clubs
set transfer_budget = 7000000,
    reserved_transfer_budget = 0,
    cash_balance = 7000000
where league_instance_id in (
  select li.id from public.league_instances li
  join public.competitions c on c.id = li.competition_id
  where c.code = 'UZB'
)
and not exists (
  select 1 from public.transfer_offers
  where buyer_club_id = league_clubs.id or seller_club_id = league_clubs.id
);

-- 3. Update create_league_instance RPC
create or replace function public.create_league_instance(p_competition_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_number integer;
  v_count integer;
  v_limit integer;
  v_comp_code text;
  v_budget numeric;
begin
  perform pg_advisory_xact_lock(hashtext(p_competition_id::text));
  select club_limit, code into v_limit, v_comp_code from public.competitions where id = p_competition_id and is_active;
  if not found then raise exception using errcode = 'P0002', message = 'COMPETITION_NOT_FOUND'; end if;
  select count(*) into v_count from public.clubs where competition_id = p_competition_id;
  if v_count <> v_limit then raise exception using errcode = 'P0001', message = 'COMPETITION_CLUB_COUNT_INVALID'; end if;
  select coalesce(max(instance_number), 0) + 1 into v_number from public.league_instances where competition_id = p_competition_id;
  
  v_budget := case when v_comp_code = 'UZB' then 7000000 else 100000000 end;

  insert into public.league_instances(competition_id, instance_number)
  values(p_competition_id, v_number)
  returning id into v_id;

  insert into public.league_clubs(
    league_instance_id, club_id, transfer_budget, reserved_transfer_budget, cash_balance
  )
  select v_id, id, coalesce(starting_budget, v_budget), 0, coalesce(starting_budget, v_budget)
  from public.clubs
  where competition_id = p_competition_id
  order by name;

  perform public.sync_club_players();
  return v_id;
end;
$$;

-- 4. Database-level Team OVR calculator
create or replace function public.calculate_club_team_ovr(p_league_club_id uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare
  v_lp_count integer;
  v_avg_ovr numeric;
begin
  -- 1. Check if club has 11 players in lineup_players
  select count(*), coalesce(avg(pa.overall), 0)
  into v_lp_count, v_avg_ovr
  from public.lineup_players lp
  join public.lineups l on l.id = lp.lineup_id
  join public.club_players cp on cp.id = lp.club_player_id
  join public.players p on p.id = cp.player_id
  join public.player_attributes pa on pa.player_id = p.id
  where l.league_club_id = p_league_club_id;

  if v_lp_count = 11 then
    return round(v_avg_ovr);
  end if;

  -- 2. Fallback: select top 11 players from squad
  select round(avg(sub.overall))
  into v_avg_ovr
  from (
    select pa.overall
    from public.club_players cp
    join public.players p on p.id = cp.player_id
    join public.player_attributes pa on pa.player_id = p.id
    where cp.league_club_id = p_league_club_id
    order by pa.overall desc
    limit 11
  ) sub;

  return coalesce(v_avg_ovr, 75);
end;
$$;

grant execute on function public.calculate_club_team_ovr(uuid) to authenticated, service_role;

commit;
