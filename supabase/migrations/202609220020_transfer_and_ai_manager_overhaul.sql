-- 202609220020_transfer_and_ai_manager_overhaul.sql
-- Overhauls Transfer System, AI Manager Logging/Strategy, and Global Market.

begin;

-- 1. AI Decisions Logging Table
create table if not exists public.ai_decisions (
  id uuid primary key default gen_random_uuid(),
  league_club_id uuid references public.league_clubs(id) on delete cascade,
  action text not null, -- 'STRATEGY', 'OFFER_RESPONSE', 'AI_BUY', 'AI_SELL'
  details jsonb not null,
  model text not null default 'gpt-4o-mini',
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists ai_decisions_club_idx on public.ai_decisions(league_club_id, created_at desc);

-- 2. Stateless User Input Sessions (replaces in-memory Maps in serverless edge functions)
create table if not exists public.user_input_sessions (
  user_id uuid primary key references public.users(id) on delete cascade,
  mode text not null, -- 'TRANSFER_OFFER', 'TRANSFER_SELL', 'TRANSFER_COUNTER'
  data jsonb not null,
  expires_at timestamptz not null default (timezone('utc', now()) + interval '10 minutes')
);

-- 3. External Clubs Support
alter table public.clubs add column if not exists is_external boolean not null default false;

-- 4. Global Market Listings Overhaul (Support both external stars and user listings)
alter table public.global_market_listings add column if not exists player_id uuid references public.players(id);
alter table public.global_market_listings alter column club_player_id drop not null;
alter table public.global_market_listings alter column seller_club_id drop not null;
alter table public.global_market_listings add column if not exists seller_name text not null default 'Global Market';

-- Function to buy directly from Global Market (Atomic, row-locked, zero duplicate copies)
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
  select * into v_player from public.players where id = v_listing.player_id;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  -- 4. Invariant: Player must not already be in this league instance
  if exists (
    select 1 from public.club_players cp
    join public.league_clubs lc on lc.id = cp.league_club_id
    where cp.player_id = v_player.id and lc.league_instance_id = v_buyer.league_instance_id
  ) then
    raise exception 'PLAYER_ALREADY_IN_LEAGUE';
  end if;

  -- 5. Check squad limits
  if (select count(*) from public.club_players where league_club_id = v_buyer.id) >= 35 then
    raise exception 'BUYER_MAX_SQUAD';
  end if;

  -- 6. Check budget
  if v_buyer.cash_balance < v_listing.asking_price or v_buyer.transfer_budget < v_listing.asking_price then
    raise exception 'INSUFFICIENT_BUDGET';
  end if;

  -- 7. Deduct funds
  update public.league_clubs
  set cash_balance = cash_balance - v_listing.asking_price,
      transfer_budget = transfer_budget - v_listing.asking_price
  where id = v_buyer.id
  returning cash_balance into v_balance;

  -- 8. Assign player to buyer's squad
  insert into public.club_players(
    league_club_id, player_id, acquired_fee, acquired_at, resale_locked_until, form, fitness, morale
  ) values (
    v_buyer.id, v_player.id, v_listing.asking_price, timezone('utc', now()),
    timezone('utc', now()) + interval '48 hours', 75, 100, 75
  ) returning id into v_new_cp;

  -- 9. Record financial transaction
  insert into public.finance_transactions(
    league_club_id, kind, amount, balance_after, description
  ) values (
    v_buyer.id, 'TRANSFER', -v_listing.asking_price, v_balance, 'Global Transfer: ' || v_player.short_name
  );

  -- 10. Mark listing SOLD (never reappears)
  update public.global_market_listings
  set status = 'SOLD'
  where id = v_listing.id;

  return v_new_cp;
end $$;

-- 5. RLS permissions
alter table public.ai_decisions enable row level security;
alter table public.user_input_sessions enable row level security;

revoke all on table public.ai_decisions, public.user_input_sessions from anon, authenticated;
grant select, insert, update, delete on table public.ai_decisions, public.user_input_sessions to service_role;

revoke all on function public.buy_global_player(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.buy_global_player(uuid, uuid, uuid) to service_role;

commit;
