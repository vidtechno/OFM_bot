-- 202609220024_scoped_global_and_league_market.sql
-- Scopes Global Market external stars per league instance and supports in-league market operations.

begin;

create or replace function public.buy_global_player(
  p_user_id uuid,
  p_buyer_club_id uuid,
  p_listing_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_listing public.global_market_listings%rowtype;
  v_buyer public.league_clubs%rowtype;
  v_player public.players%rowtype;
  v_new_cp uuid;
  v_balance numeric;
begin
  -- 1. Verify buyer ownership
  select * into v_buyer from public.league_clubs where id = p_buyer_club_id and manager_user_id = p_user_id for update;
  if not found then raise exception 'CLUB_NOT_OWNED'; end if;

  -- 2. Lock and verify listing
  select * into v_listing from public.global_market_listings where id = p_listing_id and status = 'ACTIVE' for update;
  if not found then raise exception 'LISTING_NOT_AVAILABLE'; end if;
  if v_listing.available_until <= timezone('utc', now()) then raise exception 'LISTING_EXPIRED'; end if;

  -- 3. Verify player
  select * into v_player from public.players where id = coalesce(v_listing.player_id, (select player_id from public.club_players where id = v_listing.club_player_id));
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  -- 4. Invariant: Player must not already be in this league instance
  if exists (
    select 1 from public.club_players cp
    join public.league_clubs lc on lc.id = cp.league_club_id
    where cp.player_id = v_player.id and lc.league_instance_id = v_buyer.league_instance_id
  ) then
    raise exception 'PLAYER_ALREADY_IN_LEAGUE';
  end if;

  -- 5. Check squad limits (max 30 players)
  if (select count(*) from public.club_players where league_club_id = v_buyer.id) >= 30 then
    raise exception 'SQUAD_LIMIT_REACHED';
  end if;

  -- 6. Check budget
  if (v_buyer.cash_balance - v_buyer.reserved_transfer_budget) < v_listing.asking_price
     or (v_buyer.transfer_budget - v_buyer.reserved_transfer_budget) < v_listing.asking_price then
    raise exception 'INSUFFICIENT_BUDGET';
  end if;

  -- 7. Deduct funds from buyer
  update public.league_clubs
  set cash_balance = cash_balance - v_listing.asking_price,
      transfer_budget = transfer_budget - v_listing.asking_price
  where id = v_buyer.id
  returning cash_balance into v_balance;

  -- 8. If in-league listing, add funds to seller club
  if v_listing.seller_club_id is not null then
    update public.league_clubs
    set cash_balance = cash_balance + v_listing.asking_price,
        transfer_budget = transfer_budget + v_listing.asking_price
    where id = v_listing.seller_club_id;

    insert into public.finance_transactions(
      league_club_id, kind, amount, balance_after, description
    ) values (
      v_listing.seller_club_id, 'TRANSFER', v_listing.asking_price,
      (select cash_balance from public.league_clubs where id = v_listing.seller_club_id),
      'Player sale: ' || v_player.short_name
    );
  end if;

  -- 9. Assign player to buyer's squad (or reassign if in-league)
  if v_listing.club_player_id is not null then
    delete from public.lineup_players where club_player_id = v_listing.club_player_id;
    update public.club_players
    set league_club_id = v_buyer.id,
        acquired_fee = v_listing.asking_price,
        acquired_at = timezone('utc', now()),
        resale_locked_until = timezone('utc', now()) + interval '48 hours',
        squad_number = null,
        is_starting = false
    where id = v_listing.club_player_id
    returning id into v_new_cp;
  else
    insert into public.club_players(
      league_club_id, player_id, acquired_fee, acquired_at, resale_locked_until, form, fitness, morale, is_starting
    ) values (
      v_buyer.id, v_player.id, v_listing.asking_price, timezone('utc', now()),
      timezone('utc', now()) + interval '48 hours', 75, 100, 75, false
    ) returning id into v_new_cp;
  end if;

  -- 10. Record buyer financial transaction
  insert into public.finance_transactions(
    league_club_id, kind, amount, balance_after, description
  ) values (
    v_buyer.id, 'TRANSFER', -v_listing.asking_price, v_balance, 'Player purchase: ' || v_player.short_name
  );

  -- 11. Mark in-league listing SOLD. External listings stay active for other independent league instances.
  if v_listing.club_player_id is not null then
    update public.global_market_listings
    set status = 'SOLD'
    where id = v_listing.id;
  end if;

  return v_new_cp;
end $$;

commit;
