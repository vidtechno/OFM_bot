-- Migration: 202609220025_league_lifecycle_and_transfer_lock.sql
-- Description: Adds 'OPEN' league status, automated lobby activation, pre-season transfer locks, and ghost budget release on counter-offers.

-- 1. Add 'OPEN' to league_status enum if not already present
alter type public.league_status add value if not exists 'OPEN';

begin;

-- 2. Update claim_league_club to allow claiming clubs in both 'ACTIVE' and 'OPEN' leagues
create or replace function public.claim_league_club(p_user_id uuid, p_league_club_id uuid)
returns table(league_club_id uuid, club_name text, league_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_lc public.league_clubs%rowtype;
  v_comp uuid;
  v_club text;
  v_league text;
  v_instance_id uuid;
  v_human_count integer;
begin
  if not exists(select 1 from public.users where id = p_user_id and not is_blocked) then
    raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND';
  end if;

  select lc.* into v_lc from public.league_clubs lc where lc.id = p_league_club_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'CLUB_NOT_FOUND';
  end if;

  if v_lc.manager_type = 'HUMAN' then
    raise exception using errcode = 'P0001', message = 'CLUB_ALREADY_CLAIMED';
  end if;

  select li.id, li.competition_id, c.name, co.name || ' #' || lpad(li.instance_number::text, 4, '0')
  into v_instance_id, v_comp, v_club, v_league
  from public.league_instances li
  join public.competitions co on co.id = li.competition_id
  join public.clubs c on c.id = v_lc.club_id
  where li.id = v_lc.league_instance_id and li.status in ('ACTIVE', 'OPEN');

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_ACTIVE';
  end if;

  if exists(select 1 from public.league_memberships where user_id = p_user_id and competition_id = v_comp) then
    raise exception using errcode = 'P0001', message = 'COMPETITION_LIMIT_REACHED';
  end if;

  update public.league_clubs
  set manager_type = 'HUMAN', manager_user_id = p_user_id, claimed_at = timezone('utc', now())
  where id = p_league_club_id;

  insert into public.league_memberships(league_instance_id, competition_id, league_club_id, user_id)
  values(v_lc.league_instance_id, v_comp, p_league_club_id, p_user_id);

  -- Check if lobby just filled to 20/20 human managers; if so, trigger new lobby availability check
  select count(*) into v_human_count
  from public.league_clubs
  where league_instance_id = v_instance_id and manager_type = 'HUMAN';

  if v_human_count >= 20 then
    -- Close registration for this full lobby
    update public.league_instances
    set registration_closes_at = timezone('utc', now())
    where id = v_instance_id and status = 'OPEN';
  end if;

  return query select p_league_club_id, v_club, v_league;
end $$;

-- 3. Activate due open leagues (12 hours expired -> status becomes ACTIVE)
create or replace function public.activate_due_open_leagues()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer := 0;
begin
  with activated as (
    update public.league_instances
    set status = 'ACTIVE',
        updated_at = timezone('utc', now())
    where status = 'OPEN'
      and registration_closes_at is not null
      and registration_closes_at <= timezone('utc', now())
    returning id
  )
  select count(*) into v_count from activated;

  return v_count;
end $$;

-- 4. Ensure at least one OPEN lobby is available per competition (PL, LALIGA)
create or replace function public.ensure_open_lobby_available()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_comp record;
  v_open_league_id uuid;
  v_new_league uuid;
  v_created integer := 0;
  v_human_count integer;
begin
  for v_comp in select id, code from public.competitions where code in ('PL', 'LALIGA') and is_active loop
    -- Check if an OPEN lobby exists that is not expired and has < 20 human managers
    select li.id into v_open_league_id
    from public.league_instances li
    where li.competition_id = v_comp.id
      and li.access_mode = 'GLOBAL'
      and li.status = 'OPEN'
      and (li.registration_closes_at is null or li.registration_closes_at > timezone('utc', now()))
      and (
        select count(*) from public.league_clubs lc
        where lc.league_instance_id = li.id and lc.manager_type = 'HUMAN'
      ) < 20
    limit 1;

    if v_open_league_id is null then
      -- Create a new open lobby instance
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

-- 5. Release scheduled global leagues (07:00 and 19:00 slots)
create or replace function public.release_global_leagues(p_run_key text, p_start_at timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_comp uuid;
  v_league uuid;
  v_count integer := 0;
begin
  insert into public.global_league_release_runs(run_key) values(p_run_key) on conflict do nothing;
  if not found then return 0; end if;

  -- Transition previous global open lobbies to ACTIVE
  update public.league_instances
  set status = 'ACTIVE',
      registration_closes_at = timezone('utc', now())
  where access_mode = 'GLOBAL'
    and status = 'OPEN';

  -- Create fresh OPEN lobbies for PL and LALIGA
  for v_comp in select id from public.competitions where code in ('PL', 'LALIGA') and is_active loop
    v_league := public.create_league_instance(v_comp);
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

-- 6. Pre-season transfer lock & ghost budget resolution in create_transfer_offer
create or replace function public.create_transfer_offer(
  p_user_id uuid,
  p_buyer_club_id uuid,
  p_club_player_id uuid,
  p_amount numeric
)
returns table(offer_id uuid, status public.transfer_offer_status, counter_amount numeric)
language plpgsql security definer set search_path = '' as $$
declare
  v_buyer_league_status public.league_status;
  v_seller uuid;
  v_seller_league_status public.league_status;
  v_offer uuid;
  v_status public.transfer_offer_status := 'PENDING';
  v_counter numeric;
  v_value numeric;
  v_overall int;
  v_age int;
  v_ai boolean;
  v_threshold numeric;
begin
  -- Check buyer ownership and league status
  select li.status into v_buyer_league_status
  from public.league_clubs lc
  join public.league_instances li on li.id = lc.league_instance_id
  where lc.id = p_buyer_club_id and lc.manager_user_id = p_user_id;

  if not found then
    raise exception 'CLUB_NOT_OWNED';
  end if;

  if v_buyer_league_status = 'OPEN' then
    raise exception 'LEAGUE_PRE_SEASON_LOCKED';
  end if;

  -- Get target player & seller details
  select cp.league_club_id, p.market_value, pa.overall, p.age, (lc.manager_type = 'AI'), li.status
  into v_seller, v_value, v_overall, v_age, v_ai, v_seller_league_status
  from public.club_players cp
  join public.players p on p.id = cp.player_id
  join public.player_attributes pa on pa.player_id = p.id
  join public.league_clubs lc on lc.id = cp.league_club_id
  join public.league_instances li on li.id = lc.league_instance_id
  where cp.id = p_club_player_id
    and (cp.resale_locked_until is null or cp.resale_locked_until <= timezone('utc', now()));

  if not found or v_seller = p_buyer_club_id then
    raise exception 'PLAYER_NOT_AVAILABLE';
  end if;

  if v_seller_league_status = 'OPEN' then
    raise exception 'LEAGUE_PRE_SEASON_LOCKED';
  end if;

  if p_amount < greatest(100000, v_value * 0.5) then
    raise exception 'OFFER_TOO_LOW';
  end if;

  -- Check and reserve buyer budget
  perform 1 from public.league_clubs
  where id = p_buyer_club_id and (transfer_budget - reserved_transfer_budget) >= p_amount
  for update;

  if not found then
    raise exception 'INSUFFICIENT_BUDGET';
  end if;

  insert into public.transfer_offers(buyer_club_id, seller_club_id, club_player_id, amount)
  values(p_buyer_club_id, v_seller, p_club_player_id, p_amount)
  returning id into v_offer;

  update public.league_clubs
  set reserved_transfer_budget = reserved_transfer_budget + p_amount
  where id = p_buyer_club_id;

  if v_ai then
    v_threshold := v_value * (1.20 + greatest(0, v_overall - 82) * 0.025 + case when v_age <= 23 then 0.10 else 0 end);
    if p_amount >= v_threshold then
      perform public.settle_transfer(v_offer);
      v_status := 'ACCEPTED';
    elsif p_amount >= v_value * 1.2 then
      v_counter := round(v_threshold / 100000) * 100000;
      update public.transfer_offers
      set status = 'COUNTERED', counter_amount = v_counter
      where id = v_offer;
      -- CRITICAL GHOST BUDGET FIX: Release buyer's reservation immediately upon counter!
      update public.league_clubs
      set reserved_transfer_budget = greatest(0, reserved_transfer_budget - p_amount)
      where id = p_buyer_club_id;
      v_status := 'COUNTERED';
    else
      update public.transfer_offers
      set status = 'REJECTED', responded_at = timezone('utc', now())
      where id = v_offer;
      update public.league_clubs
      set reserved_transfer_budget = greatest(0, reserved_transfer_budget - p_amount)
      where id = p_buyer_club_id;
      v_status := 'REJECTED';
    end if;
  end if;

  return query select v_offer, v_status, v_counter;
end $$;

-- 7. Respond to transfer offer with ghost budget release on counter
create or replace function public.respond_transfer_offer(
  p_user_id uuid,
  p_offer_id uuid,
  p_decision text,
  p_counter numeric default null
)
returns public.transfer_offer_status
language plpgsql security definer set search_path = '' as $$
declare
  v public.transfer_offers%rowtype;
begin
  select o.* into v
  from public.transfer_offers o
  join public.league_clubs lc on lc.id = o.seller_club_id
  where o.id = p_offer_id and lc.manager_user_id = p_user_id
  for update;

  if not found then raise exception 'OFFER_NOT_OWNED'; end if;
  if v.status <> 'PENDING' or v.expires_at <= timezone('utc', now()) then
    raise exception 'OFFER_NOT_ACTIVE';
  end if;

  if p_decision = 'ACCEPT' then
    perform public.settle_transfer(v.id);
    return 'ACCEPTED';
  elsif p_decision = 'REJECT' then
    update public.transfer_offers
    set status = 'REJECTED', responded_at = timezone('utc', now())
    where id = v.id;
    update public.league_clubs
    set reserved_transfer_budget = greatest(0, reserved_transfer_budget - v.amount)
    where id = v.buyer_club_id;
    return 'REJECTED';
  elsif p_decision = 'COUNTER' and p_counter > v.amount then
    update public.transfer_offers
    set status = 'COUNTERED', counter_amount = p_counter, responded_at = timezone('utc', now())
    where id = v.id;
    -- CRITICAL GHOST BUDGET FIX: Release buyer's reservation immediately when seller counters!
    update public.league_clubs
    set reserved_transfer_budget = greatest(0, reserved_transfer_budget - v.amount)
    where id = v.buyer_club_id;
    return 'COUNTERED';
  end if;

  raise exception 'INVALID_DECISION';
end $$;

-- 8. Accept counter offer (reserve counter amount fresh and settle)
create or replace function public.accept_counter_offer(p_user_id uuid, p_offer_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.transfer_offers%rowtype;
  v_result uuid;
begin
  select o.* into v
  from public.transfer_offers o
  join public.league_clubs lc on lc.id = o.buyer_club_id
  where o.id = p_offer_id and lc.manager_user_id = p_user_id
  for update;

  if not found then raise exception 'OFFER_NOT_OWNED'; end if;
  if v.status <> 'COUNTERED' or v.counter_amount is null or v.expires_at <= timezone('utc', now()) then
    raise exception 'OFFER_NOT_ACTIVE';
  end if;

  -- Verify buyer has sufficient budget for the full counter amount
  perform 1 from public.league_clubs
  where id = v.buyer_club_id
    and (transfer_budget - reserved_transfer_budget) >= v.counter_amount
    and cash_balance >= v.counter_amount
  for update;

  if not found then
    raise exception 'INSUFFICIENT_BUDGET';
  end if;

  -- Temporarily hold counter amount so settle_transfer can cleanly deduct it
  update public.league_clubs
  set reserved_transfer_budget = reserved_transfer_budget + v.counter_amount
  where id = v.buyer_club_id;

  update public.transfer_offers
  set amount = v.counter_amount, status = 'PENDING'
  where id = v.id;

  v_result := public.settle_transfer(v.id);
  return v_result;
end $$;

-- 9. Pre-season transfer lock on buy_global_player
create or replace function public.buy_global_player(
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
  if v_listing.club_player_id is not null then
    update public.global_market_listings
    set status = 'SOLD'
    where id = v_listing.id;
  end if;

  return v_new_cp;
end $$;

commit;
