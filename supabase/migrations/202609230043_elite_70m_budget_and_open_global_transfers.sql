-- Migration: 202609230043_elite_70m_budget_and_open_global_transfers.sql
-- Goal 1: Set European Elite Leagues starting transfer budget to €70,000,000 (was €100,000,000).
-- Goal 2: Keep Uzbek Superliga at €7,000,000.
-- Goal 3: Allow Global Market transfers (seller_club_id is null) even when league is in OPEN status.
-- Goal 4: Keep in-league club transfers (seller_club_id is not null) locked until league is ACTIVE.

begin;

-- 1. Update clubs catalog starting_budget for Elite clubs to 70M
update public.clubs
set starting_budget = 70000000
where competition_id in (select id from public.competitions where code = 'ELITE');

-- 2. Alter column default for league_clubs transfer_budget
alter table public.league_clubs alter column transfer_budget set default 70000000;

-- 3. Update existing fresh OPEN lobbies in ELITE to 70M (where no transfer activity occurred)
update public.league_clubs
set transfer_budget = 70000000,
    cash_balance = 70000000
where league_instance_id in (
  select li.id from public.league_instances li
  join public.competitions c on c.id = li.competition_id
  where c.code = 'ELITE' and li.status = 'OPEN'
)
and not exists (
  select 1 from public.transfer_offers
  where buyer_club_id = league_clubs.id or seller_club_id = league_clubs.id
);

-- 4. Update create_league_instance to set 70M for ELITE and 7M for UZB
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
  
  v_budget := case when v_comp_code = 'UZB' then 7000000 else 70000000 end;

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

-- 5. Update buy_global_market_player:
-- Allow Global Market purchases (seller_club_id is null) even when league is OPEN.
-- Keep in-league transfers (seller_club_id is not null) locked during OPEN.
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

  -- 2. Fetch buyer league instance
  select * into v_buyer_league
  from public.league_instances
  where id = v_buyer.league_instance_id;

  if not found then
    raise exception 'LEAGUE_NOT_FOUND';
  end if;

  -- 3. Lock and verify listing
  select * into v_listing
  from public.global_market_listings
  where id = p_listing_id and status = 'ACTIVE' and available_until > timezone('utc', now())
  for update;

  if not found then
    raise exception 'LISTING_NOT_FOUND_OR_EXPIRED';
  end if;

  -- 4. Pre-season check:
  -- In-league player listings (seller_club_id is not null) are locked during pre-season (OPEN).
  -- Global market listings (seller_club_id is null) are ALWAYS OPEN to anyone who joined a league!
  if v_listing.seller_club_id is not null and v_buyer_league.status = 'OPEN' then
    raise exception 'LEAGUE_PRE_SEASON_LOCKED';
  end if;

  -- 5. Ensure listing belongs to same instance or is global unassigned
  if v_listing.league_instance_id is not null and v_listing.league_instance_id <> v_buyer.league_instance_id then
    raise exception 'CROSS_LEAGUE_FORBIDDEN';
  end if;

  -- 6. Check Uzbek Superliga max OVR 80 constraint
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

  -- 7. Check buyer budget
  if (v_buyer.cash_balance - v_buyer.reserved_transfer_budget) < v_listing.asking_price
     or (v_buyer.transfer_budget - v_buyer.reserved_transfer_budget) < v_listing.asking_price then
    raise exception 'INSUFFICIENT_BUDGET';
  end if;

  -- 8. Check squad limit (max 35)
  if (select count(*) from public.club_players where league_club_id = v_buyer.id) >= 35 then
    raise exception 'BUYER_MAX_SQUAD';
  end if;

  -- 9. Check duplicate player in buyer club
  if exists (
    select 1 from public.club_players
    where league_club_id = v_buyer.id and player_id = v_listing.player_id
  ) then
    raise exception 'PLAYER_ALREADY_IN_SQUAD';
  end if;

  -- 10. If in-league transfer, handle seller
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

  -- 11. Deduct budget from buyer
  update public.league_clubs
  set cash_balance = cash_balance - v_listing.asking_price,
      transfer_budget = transfer_budget - v_listing.asking_price
  where id = v_buyer.id
  returning cash_balance into v_balance;

  -- 12. Insert buyer finance transaction
  insert into public.finance_transactions(league_club_id, kind, amount, balance_after, description)
  values(v_buyer.id, 'TRANSFER', -v_listing.asking_price, v_balance, 'Futbolchi xaridi (Global Transfer)');

  -- 13. Auto-assign to lineup
  perform public.assign_player_to_lineup(v_buyer.id, v_new_cp);

  -- 14. Mark listing SOLD
  update public.global_market_listings
  set status = 'SOLD'
  where id = v_listing.id;

  return v_new_cp;
end $$;

-- 6. Ensure buy_global_player alias points to buy_global_market_player
create or replace function public.buy_global_player(
  p_user_id uuid,
  p_buyer_club_id uuid,
  p_listing_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
begin
  return public.buy_global_market_player(p_user_id, p_buyer_club_id, p_listing_id);
end $$;

grant execute on function public.buy_global_player(uuid, uuid, uuid) to service_role;
grant execute on function public.buy_global_market_player(uuid, uuid, uuid) to service_role;

commit;
