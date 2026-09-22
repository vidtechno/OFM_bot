-- Migration: 202609220026_competitions_elite_and_uzbek.sql
-- Description: Transition to OFM Elite League (20 clubs) & O‘zbekiston Superligasi (16 clubs)
-- Features: Safe old league reset, max 2 tournaments per manager, league exit RPC, scoped global market, OVR 80 cap for Uzbek league

begin;

-- 1. Exploit prevention table for departed managers
create table if not exists public.league_departures (
  id uuid primary key default gen_random_uuid(),
  league_instance_id uuid not null references public.league_instances(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  departed_at timestamptz not null default timezone('utc', now()),
  constraint league_departures_instance_user_key unique (league_instance_id, user_id)
);
alter table public.league_departures enable row level security;
revoke all on table public.league_departures from public, anon, authenticated;
grant select, insert, update on table public.league_departures to service_role;

-- 2. Clear legacy league-specific game state safely (users and manager_profiles are preserved!)
delete from public.transfer_offers;
delete from public.global_market_listings;
delete from public.lineup_players;
delete from public.lineups;
delete from public.tactics;
delete from public.match_events;
delete from public.player_match_stats;
delete from public.fixtures;
delete from public.league_memberships;
delete from public.club_players;
delete from public.league_clubs;
delete from public.league_instances;
delete from public.global_league_release_runs;
delete from public.user_input_sessions;

-- 3. Scope global_market_listings per league instance
alter table public.global_market_listings drop constraint if exists global_market_listings_player_id_key;
drop index if exists public.global_market_listings_player_id_idx;
alter table public.global_market_listings add column if not exists league_instance_id uuid references public.league_instances(id) on delete cascade;
create index if not exists global_market_instance_player_idx on public.global_market_listings(league_instance_id, player_id);

-- 4. Mark old competitions as inactive and insert new ones
update public.competitions set is_active = false where code in ('PL', 'LALIGA');

insert into public.competitions (code, name, country_code, club_limit, rounds, is_active)
values
  ('ELITE', 'OFM Elite League', 'EU', 20, 38, true),
  ('UZB', 'O‘zbekiston Superligasi', 'UZ', 16, 30, true)
on conflict (code) do update set
  name = excluded.name,
  country_code = excluded.country_code,
  club_limit = excluded.club_limit,
  rounds = excluded.rounds,
  is_active = true;

-- 5. Updated claim_league_club with max 2 tournaments per manager & exploit guard
create or replace function public.claim_league_club(p_user_id uuid, p_league_club_id uuid)
returns table(league_club_id uuid, club_name text, league_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_lc public.league_clubs%rowtype;
  v_comp uuid;
  v_comp_limit integer;
  v_club text;
  v_league text;
  v_instance_id uuid;
  v_instance_status text;
  v_active_count integer;
  v_human_count integer;
begin
  if not exists(select 1 from public.users where id = p_user_id and not is_blocked) then
    raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND';
  end if;

  -- Lock user row to serialize concurrent claim attempts from the same user
  perform 1 from public.users where id = p_user_id for update;

  select lc.* into v_lc from public.league_clubs lc where lc.id = p_league_club_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'CLUB_NOT_FOUND';
  end if;

  if v_lc.manager_type = 'HUMAN' then
    raise exception using errcode = 'P0001', message = 'CLUB_ALREADY_CLAIMED';
  end if;

  select li.id, li.status, li.competition_id, co.club_limit, c.name, co.name || ' #' || lpad(li.instance_number::text, 4, '0')
  into v_instance_id, v_instance_status, v_comp, v_comp_limit, v_club, v_league
  from public.league_instances li
  join public.competitions co on co.id = li.competition_id
  join public.clubs c on c.id = v_lc.club_id
  where li.id = v_lc.league_instance_id and li.status in ('ACTIVE', 'OPEN');

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_ACTIVE';
  end if;

  -- Exploit check: cannot rejoin an ACTIVE instance that user previously departed
  if v_instance_status = 'ACTIVE' and exists(
    select 1 from public.league_departures ld
    where ld.league_instance_id = v_instance_id and ld.user_id = p_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'DEPARTED_LEAGUE_REJOIN_BLOCKED';
  end if;

  -- Cannot join same instance twice
  if exists(
    select 1 from public.league_memberships lm
    where lm.user_id = p_user_id and lm.league_instance_id = v_instance_id
  ) then
    raise exception using errcode = 'P0001', message = 'ALREADY_IN_LEAGUE_INSTANCE';
  end if;

  -- Max 2 active/open tournament limit
  select count(*) into v_active_count
  from public.league_memberships lm
  join public.league_instances li on li.id = lm.league_instance_id
  where lm.user_id = p_user_id and li.status in ('ACTIVE', 'OPEN');

  if v_active_count >= 2 then
    raise exception using errcode = 'P0001', message = 'MAX_TOURNAMENT_LIMIT_REACHED';
  end if;

  update public.league_clubs
  set manager_type = 'HUMAN', manager_user_id = p_user_id, claimed_at = timezone('utc', now())
  where id = p_league_club_id;

  insert into public.league_memberships(league_instance_id, competition_id, league_club_id, user_id)
  values(v_lc.league_instance_id, v_comp, p_league_club_id, p_user_id);

  -- Check if lobby just reached capacity; if so, close registration and ensure open lobby
  select count(*) into v_human_count
  from public.league_clubs
  where league_instance_id = v_instance_id and manager_type = 'HUMAN';

  if v_human_count >= v_comp_limit then
    update public.league_instances
    set registration_closes_at = timezone('utc', now())
    where id = v_instance_id and status = 'OPEN';

    perform public.ensure_open_lobby_available();
  end if;

  return query select p_league_club_id, v_club, v_league;
end $$;

-- 6. Exit league RPC: exit_league_club
create or replace function public.exit_league_club(p_user_id uuid, p_league_club_id uuid)
returns table(league_club_id uuid, club_name text, league_name text, league_status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_lc public.league_clubs%rowtype;
  v_instance_id uuid;
  v_status text;
  v_club text;
  v_league text;
begin
  select lc.* into v_lc from public.league_clubs lc where lc.id = p_league_club_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'CLUB_NOT_FOUND';
  end if;

  if v_lc.manager_user_id is distinct from p_user_id then
    raise exception using errcode = 'P0001', message = 'NOT_CLUB_MANAGER';
  end if;

  select li.id, li.status, c.name, co.name || ' #' || lpad(li.instance_number::text, 4, '0')
  into v_instance_id, v_status, v_club, v_league
  from public.league_instances li
  join public.competitions co on co.id = li.competition_id
  join public.clubs c on c.id = v_lc.club_id
  where li.id = v_lc.league_instance_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'LEAGUE_NOT_FOUND';
  end if;

  if v_status = 'OPEN' then
    -- Reset club completely to AI so it is immediately available for others
    update public.league_clubs
    set manager_type = 'AI', manager_user_id = null, claimed_at = null
    where id = p_league_club_id;

    delete from public.league_memberships
    where league_club_id = p_league_club_id and user_id = p_user_id;

  elsif v_status = 'ACTIVE' then
    -- Transition club to AI management, retaining squad, budget, standings, and fixtures
    update public.league_clubs
    set manager_type = 'AI', manager_user_id = null
    where id = p_league_club_id;

    delete from public.league_memberships
    where league_club_id = p_league_club_id and user_id = p_user_id;

    -- Record departure to block re-joining the same active instance
    insert into public.league_departures(league_instance_id, user_id, departed_at)
    values(v_instance_id, p_user_id, timezone('utc', now()))
    on conflict (league_instance_id, user_id) do update set departed_at = timezone('utc', now());
  else
    raise exception using errcode = 'P0001', message = 'CANNOT_EXIT_COMPLETED_LEAGUE';
  end if;

  return query select p_league_club_id, v_club, v_league, v_status;
end $$;

-- 7. Updated buy_global_market_player with instance scoping and Uzbek league OVR <= 80 cap
create or replace function public.buy_global_market_player(
  p_user_id uuid,
  p_buyer_club_id uuid,
  p_listing_id uuid
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_buyer public.league_clubs%rowtype;
  v_buyer_league public.league_instances%rowtype;
  v_listing public.global_market_listings%rowtype;
  v_seller public.league_clubs%rowtype;
  v_new_cp uuid;
  v_balance numeric;
  v_player_overall integer;
begin
  -- 1. Lock and verify buyer club
  select * into v_buyer
  from public.league_clubs
  where id = p_buyer_club_id and manager_user_id = p_user_id
  for update;

  if not found then
    raise exception 'CLUB_NOT_OWNED';
  end if;

  -- 2. Verify league status is ACTIVE (Lock if OPEN)
  select * into v_buyer_league
  from public.league_instances
  where id = v_buyer.league_instance_id;

  if v_buyer_league.status = 'OPEN' then
    raise exception 'LEAGUE_PRE_SEASON_LOCKED';
  end if;

  -- 3. Lock and verify listing
  select * into v_listing
  from public.global_market_listings
  where id = p_listing_id and status = 'ACTIVE' and available_until > timezone('utc', now())
  for update;

  if not found then
    raise exception 'LISTING_NOT_FOUND_OR_EXPIRED';
  end if;

  -- Ensure listing belongs to same instance or is global unassigned
  if v_listing.league_instance_id is not null and v_listing.league_instance_id <> v_buyer.league_instance_id then
    raise exception 'CROSS_LEAGUE_FORBIDDEN';
  end if;

  -- Check Uzbek Superliga max OVR 80 constraint
  if exists (
    select 1
    from public.competitions co
    where co.id = v_buyer_league.competition_id and co.code = 'UZB'
  ) then
    select coalesce(pa.overall, 70) into v_player_overall
    from public.player_attributes pa
    where pa.player_id = v_listing.player_id;

    if v_player_overall > 80 then
      raise exception 'UZBEK_LEAGUE_MAX_OVR_80_EXCEEDED';
    end if;
  end if;

  -- 4. Check buyer budget
  if (v_buyer.cash_balance - v_buyer.reserved_transfer_budget) < v_listing.asking_price
     or (v_buyer.transfer_budget - v_buyer.reserved_transfer_budget) < v_listing.asking_price then
    raise exception 'INSUFFICIENT_BUDGET';
  end if;

  -- 5. Check squad limit (max 35)
  if (select count(*) from public.club_players where league_club_id = v_buyer.id) >= 35 then
    raise exception 'BUYER_MAX_SQUAD';
  end if;

  -- 6. Check duplicate player in buyer club
  if exists (
    select 1 from public.club_players
    where league_club_id = v_buyer.id and player_id = v_listing.player_id
  ) then
    raise exception 'PLAYER_ALREADY_IN_SQUAD';
  end if;

  -- 7. If in-league transfer, handle seller
  if v_listing.club_player_id is not null and v_listing.seller_club_id is not null then
    select * into v_seller
    from public.league_clubs
    where id = v_listing.seller_club_id
    for update;

    if v_seller.league_instance_id <> v_buyer.league_instance_id then
      raise exception 'CROSS_LEAGUE_FORBIDDEN';
    end if;

    if (select count(*) from public.club_players where league_club_id = v_seller.id) <= 18 then
      raise exception 'SELLER_MIN_SQUAD';
    end if;

    delete from public.lineup_players where club_player_id = v_listing.club_player_id;

    update public.club_players
    set league_club_id = v_buyer.id,
        acquired_at = timezone('utc', now()),
        acquired_fee = v_listing.asking_price,
        resale_locked_until = timezone('utc', now()) + interval '48 hours',
        squad_number = null
    where id = v_listing.club_player_id
    returning id into v_new_cp;

    update public.league_clubs
    set cash_balance = cash_balance + v_listing.asking_price,
        transfer_budget = transfer_budget + v_listing.asking_price
    where id = v_seller.id
    returning cash_balance into v_balance;

    insert into public.finance_transactions(league_club_id, kind, amount, balance_after, description)
    values(v_seller.id, 'TRANSFER', v_listing.asking_price, v_balance, 'Futbolchi sotuvi (Liga bozori)');
  else
    -- External star transfer: insert new club_player record
    insert into public.club_players (
      league_club_id, player_id, acquired_fee, acquired_at, resale_locked_until
    ) values (
      v_buyer.id, v_listing.player_id, v_listing.asking_price, timezone('utc', now()), timezone('utc', now()) + interval '48 hours'
    ) returning id into v_new_cp;
  end if;

  -- 8. Deduct budget from buyer
  update public.league_clubs
  set cash_balance = cash_balance - v_listing.asking_price,
      transfer_budget = transfer_budget - v_listing.asking_price
  where id = v_buyer.id
  returning cash_balance into v_balance;

  -- 9. Insert buyer finance transaction
  insert into public.finance_transactions(league_club_id, kind, amount, balance_after, description)
  values(v_buyer.id, 'TRANSFER', -v_listing.asking_price, v_balance, 'Futbolchi xaridi (Transfer bozori)');

  -- 10. Mark listing SOLD
  update public.global_market_listings
  set status = 'SOLD'
  where id = v_listing.id;

  return v_new_cp;
end $$;

-- 8. Dynamic ensure_open_lobby_available for all active competitions
create or replace function public.ensure_open_lobby_available()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_comp record;
  v_open_league_id uuid;
  v_new_league uuid;
  v_created integer := 0;
begin
  for v_comp in select id, club_limit, name from public.competitions where is_active loop
    select li.id into v_open_league_id
    from public.league_instances li
    where li.competition_id = v_comp.id
      and li.status = 'OPEN'
      and li.access_mode = 'GLOBAL'
      and (
        select count(*) from public.league_clubs lc
        where lc.league_instance_id = li.id and lc.manager_type = 'HUMAN'
      ) < v_comp.club_limit
    limit 1;

    if v_open_league_id is null then
      v_new_league := public.create_league_instance(v_comp.id);
      update public.league_instances
      set status = 'OPEN',
          access_mode = 'GLOBAL',
          registration_closes_at = timezone('utc', now()) + interval '12 hours'
      where id = v_new_league;

      perform public.generate_league_fixtures(v_new_league, current_date + 1);
      perform public.sync_club_players();
      v_created := v_created + 1;
    end if;
  end loop;

  return v_created;
end $$;

-- 9. Dynamic release_global_leagues (07:00 and 19:00 slots)
create or replace function public.release_global_leagues(p_run_key text, p_start_at timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_comp record;
  v_league uuid;
  v_count integer := 0;
begin
  insert into public.global_league_release_runs(run_key) values(p_run_key) on conflict do nothing;
  if not found then return 0; end if;

  -- Transition existing OPEN global lobbies to ACTIVE
  update public.league_instances
  set status = 'ACTIVE',
      registration_closes_at = timezone('utc', now())
  where access_mode = 'GLOBAL'
    and status = 'OPEN';

  -- Create fresh OPEN lobbies for all active competitions
  for v_comp in select id, club_limit from public.competitions where is_active loop
    v_league := public.create_league_instance(v_comp.id);
    update public.league_instances
    set status = 'OPEN',
        access_mode = 'GLOBAL',
        registration_closes_at = p_start_at + interval '12 hours'
    where id = v_league;

    perform public.generate_league_fixtures(v_league, p_start_at::date + 1);
    v_count := v_count + 1;
  end loop;

  perform public.sync_club_players();
  return v_count;
end $$;

grant execute on function public.claim_league_club(uuid, uuid) to service_role;
grant execute on function public.exit_league_club(uuid, uuid) to service_role;
grant execute on function public.buy_global_market_player(uuid, uuid, uuid) to service_role;
grant execute on function public.ensure_open_lobby_available() to service_role;
grant execute on function public.release_global_leagues(text, timestamptz) to service_role;

commit;
