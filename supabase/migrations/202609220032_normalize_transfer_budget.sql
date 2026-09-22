-- Migration: 202609220032_normalize_transfer_budget.sql
-- Goal: Normalize transfer budget to €100,000,000 for all fresh clubs in Elite and Uzbek leagues.
-- Ensure all future lobbies initialize clubs with transfer_budget = 100000000 and reserved_transfer_budget = 0.

begin;

-- 1. Alter default values on league_clubs
alter table public.league_clubs alter column transfer_budget set default 100000000;
alter table public.league_clubs alter column reserved_transfer_budget set default 0;

-- 2. Update default starting_budget in clubs catalog
update public.clubs set starting_budget = 100000000;

-- 3. Update existing fresh league_clubs in production
update public.league_clubs
set transfer_budget = 100000000,
    reserved_transfer_budget = 0,
    cash_balance = 100000000
where transfer_budget = 0
  and not exists (
    select 1 from public.transfer_offers
    where buyer_club_id = league_clubs.id or seller_club_id = league_clubs.id
  );

-- 4. Update create_league_instance to explicitly set 100M budget
create or replace function public.create_league_instance(p_competition_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_number integer;
  v_count integer;
  v_limit integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_competition_id::text));
  select club_limit into v_limit from public.competitions where id = p_competition_id and is_active;
  if not found then raise exception using errcode = 'P0002', message = 'COMPETITION_NOT_FOUND'; end if;
  select count(*) into v_count from public.clubs where competition_id = p_competition_id;
  if v_count <> v_limit then raise exception using errcode = 'P0001', message = 'COMPETITION_CLUB_COUNT_INVALID'; end if;
  select coalesce(max(instance_number), 0) + 1 into v_number from public.league_instances where competition_id = p_competition_id;
  
  insert into public.league_instances(competition_id, instance_number)
  values(p_competition_id, v_number)
  returning id into v_id;

  insert into public.league_clubs(
    league_instance_id, club_id, transfer_budget, reserved_transfer_budget, cash_balance
  )
  select v_id, id, 100000000, 0, 100000000
  from public.clubs
  where competition_id = p_competition_id
  order by name;

  perform public.sync_club_players();
  return v_id;
end;
$$;

commit;
