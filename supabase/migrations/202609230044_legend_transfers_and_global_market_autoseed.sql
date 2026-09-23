-- Migration: 202609230044_legend_transfers_and_global_market_autoseed.sql
-- Production-ready 👑 Legend Transfers (Telegram Stars XTR) and Global Market auto-seeding.

begin;

-- 1. Data Source for Historic Legends
insert into public.data_sources (code, name, version, source_url, license)
values (
  'OFM_LEGENDS',
  'OFM Historic Football Legends Dataset',
  '1.0-2026',
  'https://t.me/OFMgame_bot',
  'Proprietary'
)
on conflict (code) do update set
  name = excluded.name,
  version = excluded.version;

-- 2. Legend Players Table (Canonical Definitions)
create table if not exists public.legend_players (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  slug text unique not null,
  name text not null,
  display_name text not null,
  category text not null check (category in ('GK', 'DEF', 'MID', 'ATT')),
  primary_position text not null,
  secondary_positions text[] not null default '{}',
  overall smallint not null check (overall between 50 and 99),
  pace smallint not null check (pace between 1 and 99),
  shooting smallint not null check (shooting between 1 and 99),
  passing smallint not null check (passing between 1 and 99),
  dribbling smallint not null check (dribbling between 1 and 99),
  defending smallint not null check (defending between 1 and 99),
  physical smallint not null check (physical between 1 and 99),
  tier text not null check (tier in ('GOAT', 'Icon', 'Elite Legend', 'Legend')),
  stars_price integer not null default 1 check (stars_price >= 1),
  active boolean not null default true,
  card_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists legend_players_category_idx on public.legend_players(category, overall desc);
create index if not exists legend_players_active_idx on public.legend_players(active);

-- 3. Flag in club_players for Legend protection (No sale, no normal transfers, no AI buyout)
alter table public.club_players add column if not exists is_legend boolean not null default false;

-- 4. League Legend Players (Assignment per League Instance)
create table if not exists public.league_legend_players (
  id uuid primary key default gen_random_uuid(),
  league_instance_id uuid not null references public.league_instances(id) on delete cascade,
  league_club_id uuid not null references public.league_clubs(id) on delete cascade,
  legend_id uuid not null references public.legend_players(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  club_player_id uuid not null references public.club_players(id) on delete cascade,
  purchased_by_user_id uuid not null references public.users(id),
  purchase_id uuid,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default timezone('utc', now()),
  constraint league_legend_unique unique (league_instance_id, legend_id)
);

create index if not exists league_legend_club_idx on public.league_legend_players(league_club_id);
create index if not exists league_legend_instance_idx on public.league_legend_players(league_instance_id);

-- 5. Legend Purchases (Payment Ledger & Idempotency)
create table if not exists public.legend_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  league_instance_id uuid not null references public.league_instances(id),
  league_club_id uuid not null references public.league_clubs(id),
  legend_id uuid not null references public.legend_players(id),
  stars_amount integer not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'FULFILLED', 'REFUNDED', 'FAILED', 'CANCELLED')),
  invoice_payload text,
  telegram_payment_charge_id text unique,
  provider_payment_charge_id text,
  created_at timestamptz not null default timezone('utc', now()),
  paid_at timestamptz,
  refunded_at timestamptz
);

create index if not exists legend_purchases_user_idx on public.legend_purchases(user_id);
create index if not exists legend_purchases_status_idx on public.legend_purchases(status);

-- 6. Helper function to seed or update the 41 Legends
create or replace function public.seed_41_legend_players()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_src_id uuid;
  v_p_id uuid;
  v_count integer := 0;
  
  -- Record type for legend data
  type_l record;
begin
  select id into v_src_id from public.data_sources where code = 'OFM_LEGENDS' limit 1;

  for type_l in (
    select * from (values
      -- GK (5)
      ('gianluigi-buffon', 'Gianluigi Buffon', 'Buffon', 'GK', 'GK', array[]::text[], 94, 94, 92, 87, 93, 55, 90, 'Icon', 1),
      ('iker-casillas', 'Iker Casillas', 'I. Casillas', 'GK', 'GK', array[]::text[], 93, 95, 89, 84, 94, 55, 86, 'Icon', 1),
      ('petr-cech', 'Petr Čech', 'P. Čech', 'GK', 'GK', array[]::text[], 92, 91, 90, 85, 90, 56, 89, 'Elite Legend', 1),
      ('edwin-van-der-sar', 'Edwin van der Sar', 'E. van der Sar', 'GK', 'GK', array[]::text[], 91, 89, 88, 91, 89, 52, 84, 'Elite Legend', 1),
      ('oliver-kahn', 'Oliver Kahn', 'O. Kahn', 'GK', 'GK', array[]::text[], 93, 91, 91, 82, 90, 58, 95, 'Icon', 1),

      -- DEF (12)
      ('paolo-maldini', 'Paolo Maldini', 'P. Maldini', 'DEF', 'CB', array['LB'], 94, 86, 58, 80, 76, 96, 86, 'Icon', 1),
      ('fabio-cannavaro', 'Fabio Cannavaro', 'F. Cannavaro', 'DEF', 'CB', array[]::text[], 93, 84, 48, 69, 72, 95, 88, 'Icon', 1),
      ('alessandro-nesta', 'Alessandro Nesta', 'A. Nesta', 'DEF', 'CB', array[]::text[], 93, 80, 45, 71, 74, 95, 86, 'Icon', 1),
      ('carles-puyol', 'Carles Puyol', 'C. Puyol', 'DEF', 'CB', array[]::text[], 92, 77, 50, 68, 65, 94, 92, 'Elite Legend', 1),
      ('roberto-carlos', 'Roberto Carlos', 'R. Carlos', 'DEF', 'LB', array[]::text[], 92, 93, 87, 86, 85, 84, 88, 'Elite Legend', 1),
      ('marcelo', 'Marcelo', 'Marcelo', 'DEF', 'LB', array['LM'], 91, 88, 76, 88, 93, 81, 79, 'Elite Legend', 1),
      ('cafu', 'Cafu', 'Cafu', 'DEF', 'RB', array['RWB'], 92, 91, 72, 85, 87, 88, 89, 'Elite Legend', 1),
      ('philipp-lahm', 'Philipp Lahm', 'P. Lahm', 'DEF', 'RB', array['LB', 'CDM'], 92, 87, 64, 88, 87, 92, 76, 'Elite Legend', 1),
      ('rio-ferdinand', 'Rio Ferdinand', 'R. Ferdinand', 'DEF', 'CB', array[]::text[], 91, 84, 50, 73, 74, 92, 86, 'Elite Legend', 1),
      ('nemanja-vidic', 'Nemanja Vidić', 'N. Vidić', 'DEF', 'CB', array[]::text[], 91, 78, 54, 62, 64, 93, 93, 'Elite Legend', 1),
      ('john-terry', 'John Terry', 'J. Terry', 'DEF', 'CB', array[]::text[], 91, 74, 56, 72, 65, 93, 91, 'Elite Legend', 1),
      ('dani-alves', 'Dani Alves', 'Dani Alves', 'DEF', 'RB', array['RWB'], 91, 90, 75, 87, 89, 84, 82, 'Elite Legend', 1),

      -- MID (12)
      ('zinedine-zidane', 'Zinedine Zidane', 'Z. Zidane', 'MID', 'CAM', array['CM'], 94, 83, 88, 94, 94, 74, 85, 'Icon', 1),
      ('xavi', 'Xavi', 'Xavi', 'MID', 'CM', array[]::text[], 93, 78, 75, 96, 92, 76, 74, 'Icon', 1),
      ('andres-iniesta', 'Andrés Iniesta', 'A. Iniesta', 'MID', 'CM', array['CAM'], 93, 82, 78, 94, 95, 68, 69, 'Icon', 1),
      ('toni-kroos', 'Toni Kroos', 'T. Kroos', 'MID', 'CM', array['CDM'], 92, 68, 84, 96, 86, 78, 77, 'Elite Legend', 1),
      ('andrea-pirlo', 'Andrea Pirlo', 'A. Pirlo', 'MID', 'CM', array['CDM'], 92, 72, 82, 96, 90, 73, 68, 'Elite Legend', 1),
      ('kaka', 'Kaká', 'Kaká', 'MID', 'CAM', array[]::text[], 92, 91, 86, 88, 92, 50, 76, 'Elite Legend', 1),
      ('steven-gerrard', 'Steven Gerrard', 'S. Gerrard', 'MID', 'CM', array['CAM'], 91, 82, 90, 90, 84, 82, 88, 'Elite Legend', 1),
      ('frank-lampard', 'Frank Lampard', 'F. Lampard', 'MID', 'CM', array['CAM'], 91, 79, 91, 89, 83, 76, 84, 'Elite Legend', 1),
      ('paul-scholes', 'Paul Scholes', 'P. Scholes', 'MID', 'CM', array[]::text[], 91, 76, 90, 93, 83, 72, 82, 'Elite Legend', 1),
      ('sergio-busquets', 'Sergio Busquets', 'S. Busquets', 'MID', 'CDM', array['CM'], 90, 60, 65, 89, 85, 89, 82, 'Legend', 1),
      ('mesut-ozil', 'Mesut Özil', 'M. Özil', 'MID', 'CAM', array[]::text[], 90, 78, 77, 93, 91, 38, 65, 'Legend', 1),
      ('yaya-toure', 'Yaya Touré', 'Y. Touré', 'MID', 'CM', array['CDM'], 90, 82, 84, 86, 84, 83, 91, 'Legend', 1),

      -- ATT (12)
      ('lionel-messi', 'Lionel Messi', 'L. Messi', 'ATT', 'RW', array['CAM'], 96, 90, 95, 96, 98, 40, 78, 'GOAT', 1),
      ('cristiano-ronaldo', 'Cristiano Ronaldo', 'C. Ronaldo', 'ATT', 'ST', array['LW'], 96, 93, 96, 84, 90, 42, 89, 'GOAT', 1),
      ('ronaldo-nazario', 'Ronaldo Nazário', 'Ronaldo', 'ATT', 'ST', array[]::text[], 95, 95, 93, 82, 94, 45, 84, 'GOAT', 1),
      ('ronaldinho', 'Ronaldinho', 'Ronaldinho', 'ATT', 'LW', array['CAM'], 94, 91, 86, 91, 96, 40, 78, 'Icon', 1),
      ('thierry-henry', 'Thierry Henry', 'T. Henry', 'ATT', 'ST', array['LW'], 93, 94, 91, 84, 90, 45, 82, 'Icon', 1),
      ('gareth-bale', 'Gareth Bale', 'G. Bale', 'ATT', 'RW', array['LW'], 91, 94, 88, 84, 88, 65, 82, 'Elite Legend', 1),
      ('zlatan-ibrahimovic', 'Zlatan Ibrahimović', 'Z. Ibrahimović', 'ATT', 'ST', array[]::text[], 92, 81, 93, 83, 88, 42, 90, 'Elite Legend', 1),
      ('samuel-etoo', 'Samuel Eto’o', 'S. Eto’o', 'ATT', 'ST', array[]::text[], 91, 93, 89, 80, 87, 50, 83, 'Elite Legend', 1),
      ('didier-drogba', 'Didier Drogba', 'D. Drogba', 'ATT', 'ST', array[]::text[], 91, 87, 90, 75, 81, 55, 91, 'Elite Legend', 1),
      ('wayne-rooney', 'Wayne Rooney', 'W. Rooney', 'ATT', 'ST', array['CF', 'CAM'], 91, 86, 90, 84, 85, 64, 89, 'Elite Legend', 1),
      ('arjen-robben', 'Arjen Robben', 'A. Robben', 'ATT', 'RW', array['RM'], 91, 93, 86, 82, 92, 40, 72, 'Elite Legend', 1),
      ('franck-ribery', 'Franck Ribéry', 'F. Ribéry', 'ATT', 'LW', array['LM'], 91, 91, 84, 86, 92, 44, 74, 'Elite Legend', 1)
    ) as t(slug, name, display_name, category, primary_position, secondary_positions, overall, pace, shooting, passing, dribbling, defending, physical, tier, stars_price)
  ) loop
    -- 1. Upsert into canonical players
    insert into public.players (
      data_source_id,
      source_player_id,
      name,
      short_name,
      age,
      nationality,
      primary_position,
      secondary_position,
      market_value
    ) values (
      v_src_id,
      'LEGEND_' || type_l.slug,
      type_l.name,
      type_l.display_name,
      30,
      'World Legend',
      type_l.primary_position,
      case when array_length(type_l.secondary_positions, 1) > 0 then type_l.secondary_positions[1] else null end,
      100000000
    )
    on conflict (data_source_id, source_player_id) do update set
      name = excluded.name,
      short_name = excluded.short_name,
      primary_position = excluded.primary_position,
      secondary_position = excluded.secondary_position
    returning id into v_p_id;

    -- 2. Upsert player_attributes
    insert into public.player_attributes (
      player_id, overall, pace, shooting, passing, dribbling, defending, physical
    ) values (
      v_p_id, type_l.overall, type_l.pace, type_l.shooting, type_l.passing, type_l.dribbling, type_l.defending, type_l.physical
    )
    on conflict (player_id) do update set
      overall = excluded.overall,
      pace = excluded.pace,
      shooting = excluded.shooting,
      passing = excluded.passing,
      dribbling = excluded.dribbling,
      defending = excluded.defending,
      physical = excluded.physical;

    -- 3. Upsert player_positions
    delete from public.player_positions where player_id = v_p_id;
    insert into public.player_positions (player_id, position, priority)
    values (v_p_id, type_l.primary_position, 1);

    if array_length(type_l.secondary_positions, 1) > 0 then
      insert into public.player_positions (player_id, position, priority)
      select v_p_id, pos, (ord + 1)::smallint
      from unnest(type_l.secondary_positions) with ordinality as u(pos, ord);
    end if;

    -- 4. Upsert into legend_players
    insert into public.legend_players (
      player_id, slug, name, display_name, category, primary_position,
      secondary_positions, overall, pace, shooting, passing, dribbling,
      defending, physical, tier, stars_price, active
    ) values (
      v_p_id, type_l.slug, type_l.name, type_l.display_name, type_l.category, type_l.primary_position,
      type_l.secondary_positions, type_l.overall, type_l.pace, type_l.shooting, type_l.passing, type_l.dribbling,
      type_l.defending, type_l.physical, type_l.tier, type_l.stars_price, true
    )
    on conflict (slug) do update set
      player_id = excluded.player_id,
      name = excluded.name,
      display_name = excluded.display_name,
      category = excluded.category,
      primary_position = excluded.primary_position,
      secondary_positions = excluded.secondary_positions,
      overall = excluded.overall,
      pace = excluded.pace,
      shooting = excluded.shooting,
      passing = excluded.passing,
      dribbling = excluded.dribbling,
      defending = excluded.defending,
      physical = excluded.physical,
      tier = excluded.tier,
      stars_price = excluded.stars_price,
      active = true,
      updated_at = timezone('utc', now());

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

-- Run the seed immediately
select public.seed_41_legend_players();

-- 7. Purchase Intent RPC
create or replace function public.create_legend_purchase_intent(
  p_user_id uuid,
  p_league_club_id uuid,
  p_legend_id uuid
)
returns table(
  purchase_id uuid,
  stars_amount integer,
  legend_name text,
  legend_pos text,
  legend_ovr smallint,
  club_name text,
  league_instance_id uuid
) language plpgsql security definer set search_path = '' as $$
declare
  v_lc record;
  v_lp record;
  v_count integer;
  v_pid uuid;
begin
  -- 1. Validate user and club ownership
  select lc.id, lc.league_instance_id, lc.manager_type, lc.user_id, c.name as club_name, li.status as league_status
  into v_lc
  from public.league_clubs lc
  join public.clubs c on c.id = lc.club_id
  join public.league_instances li on li.id = lc.league_instance_id
  where lc.id = p_league_club_id;

  if not found then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  if v_lc.manager_type != 'HUMAN' or v_lc.user_id != p_user_id then
    raise exception 'NOT_CLUB_MANAGER';
  end if;

  if v_lc.league_status != 'ACTIVE' then
    raise exception 'LEAGUE_NOT_ACTIVE';
  end if;

  -- 2. Validate Legend
  select * into v_lp from public.legend_players where id = p_legend_id and active;
  if not found then
    raise exception 'LEGEND_NOT_FOUND';
  end if;

  -- 3. Validate Legend limit (max 5 per club)
  select count(*) into v_count
  from public.league_legend_players
  where league_club_id = p_league_club_id and status = 'ACTIVE';

  if v_count >= 5 then
    raise exception 'LEGEND_LIMIT_REACHED';
  end if;

  -- 4. Validate League Uniqueness (Legend not already owned in this league)
  if exists (
    select 1 from public.league_legend_players
    where league_instance_id = v_lc.league_instance_id and legend_id = p_legend_id and status = 'ACTIVE'
  ) then
    raise exception 'LEGEND_ALREADY_OWNED';
  end if;

  -- 5. Insert pending purchase
  insert into public.legend_purchases (
    user_id,
    league_instance_id,
    league_club_id,
    legend_id,
    stars_amount,
    status
  ) values (
    p_user_id,
    v_lc.league_instance_id,
    p_league_club_id,
    p_legend_id,
    v_lp.stars_price,
    'PENDING'
  ) returning id into v_pid;

  return query
  select
    v_pid,
    v_lp.stars_price,
    v_lp.name,
    v_lp.primary_position,
    v_lp.overall,
    v_lc.club_name,
    v_lc.league_instance_id;
end $$;

-- 8. Pre-checkout Validation RPC
create or replace function public.validate_legend_precheckout(
  p_purchase_id uuid,
  p_user_id uuid,
  p_stars_amount integer
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_pur record;
  v_league_status text;
  v_count integer;
begin
  select p.*, li.status as league_status
  into v_pur
  from public.legend_purchases p
  join public.league_instances li on li.id = p.league_instance_id
  where p.id = p_purchase_id and p.user_id = p_user_id and p.status = 'PENDING';

  if not found then
    return false;
  end if;

  if v_pur.league_status != 'ACTIVE' then
    return false;
  end if;

  if v_pur.stars_amount != p_stars_amount then
    return false;
  end if;

  -- Re-check club legend limit (< 5)
  select count(*) into v_count
  from public.league_legend_players
  where league_club_id = v_pur.league_club_id and status = 'ACTIVE';

  if v_count >= 5 then
    return false;
  end if;

  -- Re-check league uniqueness
  if exists (
    select 1 from public.league_legend_players
    where league_instance_id = v_pur.league_instance_id and legend_id = v_pur.legend_id and status = 'ACTIVE'
  ) then
    return false;
  end if;

  return true;
end $$;

-- 9. Atomic Fulfillment RPC
create or replace function public.fulfill_legend_purchase(
  p_purchase_id uuid,
  p_telegram_payment_charge_id text,
  p_provider_payment_charge_id text default null
)
returns table(
  club_player_id uuid,
  legend_name text,
  legend_pos text,
  legend_ovr smallint,
  club_name text,
  league_instance_id uuid
) language plpgsql security definer set search_path = '' as $$
declare
  v_pur record;
  v_lp record;
  v_lc record;
  v_cp_id uuid;
  v_squad_num smallint;
  v_count integer;
begin
  -- Idempotency check: If this payment charge id has already been fulfilled, return existing data
  select p.id, p.league_instance_id, lp.name, lp.primary_position, lp.overall, c.name as club_name, llp.club_player_id
  into v_pur
  from public.legend_purchases p
  join public.legend_players lp on lp.id = p.legend_id
  join public.league_clubs lc on lc.id = p.league_club_id
  join public.clubs c on c.id = lc.club_id
  left join public.league_legend_players llp on llp.purchase_id = p.id
  where p.telegram_payment_charge_id = p_telegram_payment_charge_id and p.status = 'FULFILLED';

  if found and v_pur.club_player_id is not null then
    return query
    select v_pur.club_player_id, v_pur.name, v_pur.primary_position, v_pur.overall, v_pur.club_name, v_pur.league_instance_id;
    return;
  end if;

  -- Lock purchase row
  select * into v_pur
  from public.legend_purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'PURCHASE_NOT_FOUND';
  end if;

  if v_pur.status = 'FULFILLED' then
    -- Already fulfilled
    select llp.club_player_id, lp.name, lp.primary_position, lp.overall, c.name as club_name, v_pur.league_instance_id
    into v_cp_id, v_lp.name, v_lp.primary_position, v_lp.overall, v_lc.club_name, v_pur.league_instance_id
    from public.league_legend_players llp
    join public.legend_players lp on lp.id = llp.legend_id
    join public.league_clubs lc on lc.id = llp.league_club_id
    join public.clubs c on c.id = lc.club_id
    where llp.purchase_id = p_purchase_id;

    return query
    select v_cp_id, v_lp.name, v_lp.primary_position, v_lp.overall, v_lc.club_name, v_pur.league_instance_id;
    return;
  end if;

  -- Fetch legend info
  select * into v_lp from public.legend_players where id = v_pur.legend_id;
  select lc.*, c.name as club_name into v_lc
  from public.league_clubs lc
  join public.clubs c on c.id = lc.club_id
  where lc.id = v_pur.league_club_id;

  -- Check legend limit (< 5)
  select count(*) into v_count
  from public.league_legend_players
  where league_club_id = v_pur.league_club_id and status = 'ACTIVE';

  if v_count >= 5 then
    raise exception 'LEGEND_LIMIT_REACHED';
  end if;

  -- Check League Uniqueness
  if exists (
    select 1 from public.league_legend_players
    where league_instance_id = v_pur.league_instance_id and legend_id = v_pur.legend_id and status = 'ACTIVE'
  ) then
    raise exception 'LEGEND_ALREADY_OWNED';
  end if;

  -- Pick unused squad number
  select coalesce(min(n), 99) into v_squad_num
  from generate_series(1, 99) n
  where not exists (
    select 1 from public.club_players cp
    where cp.league_club_id = v_pur.league_club_id and cp.squad_number = n
  );

  -- Insert into club_players with is_legend = true
  insert into public.club_players (
    league_club_id,
    player_id,
    squad_number,
    acquired_fee,
    is_legend,
    resale_locked_until
  ) values (
    v_pur.league_club_id,
    v_lp.player_id,
    v_squad_num,
    0,
    true,
    'infinity'::timestamptz
  ) returning id into v_cp_id;

  -- Insert into league_legend_players (enforces unique(league_instance_id, legend_id))
  insert into public.league_legend_players (
    league_instance_id,
    league_club_id,
    legend_id,
    player_id,
    club_player_id,
    purchased_by_user_id,
    purchase_id,
    status
  ) values (
    v_pur.league_instance_id,
    v_pur.league_club_id,
    v_pur.legend_id,
    v_lp.player_id,
    v_cp_id,
    v_pur.user_id,
    p_purchase_id,
    'ACTIVE'
  );

  -- Update legend_purchases to FULFILLED
  update public.legend_purchases
  set status = 'FULFILLED',
      telegram_payment_charge_id = p_telegram_payment_charge_id,
      provider_payment_charge_id = p_provider_payment_charge_id,
      paid_at = timezone('utc', now())
  where id = p_purchase_id;

  return query
  select v_cp_id, v_lp.name, v_lp.primary_position, v_lp.overall, v_lc.club_name, v_pur.league_instance_id;
end $$;

-- 10. Record Refund RPC
create or replace function public.record_legend_refund(p_purchase_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.legend_purchases
  set status = 'REFUNDED',
      refunded_at = timezone('utc', now())
  where id = p_purchase_id;
  return found;
end $$;

-- 11. Ensure League Global Market (Automatic Seeding for European & Uzbek Leagues)
create or replace function public.ensure_league_global_market(p_league_instance_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_li record;
  v_count integer;
  v_inserted integer := 0;
  v_is_uzbek boolean;
  v_ext_player record;
  v_price numeric(16, 2);
  v_rarity numeric(5, 2);
begin
  select li.id, li.status, co.code as comp_code
  into v_li
  from public.league_instances li
  join public.competitions co on co.id = li.competition_id
  where li.id = p_league_instance_id;

  if not found then return 0; end if;

  -- Count existing active global market listings for this instance (where seller_club_id is null)
  select count(*) into v_count
  from public.global_market_listings
  where league_instance_id = p_league_instance_id
    and seller_club_id is null
    and status = 'ACTIVE';

  -- If already has at least 15 active global external listings, no need to re-seed
  if v_count >= 15 then
    return 0;
  end if;

  v_is_uzbek := (v_li.comp_code = 'UZB');

  -- Select up to 40 balanced external players from DB
  for v_ext_player in (
    with ranked as (
      select
        p.id as player_id,
        p.name,
        coalesce(c.name, 'Global Agent') as seller_name,
        pa.overall,
        p.market_value,
        pp.position,
        case
          when pp.position = 'GK' then 'GK'
          when pp.position in ('CB', 'LB', 'RB', 'LWB', 'RWB') then 'DEF'
          when pp.position in ('CM', 'CDM', 'CAM', 'LM', 'RM') then 'MID'
          else 'ATT'
        end as pos_group,
        row_number() over (
          partition by (
            case
              when pp.position = 'GK' then 'GK'
              when pp.position in ('CB', 'LB', 'RB', 'LWB', 'RWB') then 'DEF'
              when pp.position in ('CM', 'CDM', 'CAM', 'LM', 'RM') then 'MID'
              else 'ATT'
            end
          ) order by pa.overall desc, p.market_value desc
        ) as rn
      from public.players p
      join public.player_attributes pa on pa.player_id = p.id
      join public.player_positions pp on pp.player_id = p.id and pp.priority = 1
      left join public.clubs c on c.id = p.club_id
      where p.source_player_id like 'EXT_%'
        and (
          (v_is_uzbek and pa.overall between 75 and 80)
          or
          (not v_is_uzbek and pa.overall >= 80)
        )
    )
    select * from ranked where rn <= 10
  ) loop
    if v_is_uzbek then
      v_price := round((1500000 + (v_ext_player.overall - 74) * 650000) / 100000) * 100000;
      v_rarity := 1.0;
    else
      v_price := greatest(1000000, round((v_ext_player.market_value * 1.15) / 100000) * 100000);
      v_rarity := case when v_ext_player.overall >= 86 then 1.3 else 1.0 end;
    end if;

    insert into public.global_market_listings (
      league_instance_id,
      player_id,
      seller_name,
      asking_price,
      demand_multiplier,
      rarity_multiplier,
      status,
      available_until
    ) values (
      p_league_instance_id,
      v_ext_player.player_id,
      v_ext_player.seller_name,
      v_price,
      1.0,
      v_rarity,
      'ACTIVE',
      timezone('utc', now()) + interval '30 days'
    )
    on conflict (league_instance_id, player_id) do update set
      status = 'ACTIVE',
      asking_price = excluded.asking_price,
      available_until = excluded.available_until;

    v_inserted := v_inserted + 1;
  end loop;

  return v_inserted;
end $$;

-- 12. Run Global Market auto-seeding across ALL current OPEN and ACTIVE leagues right now!
do $$
declare
  v_inst record;
begin
  for v_inst in select id from public.league_instances where status in ('OPEN', 'ACTIVE') loop
    perform public.ensure_league_global_market(v_inst.id);
  end loop;
end $$;

-- 13. Update create_league_instance to automatically call ensure_league_global_market
create or replace function public.create_league_instance(p_competition_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_instance_id uuid;
  v_comp_code text;
  v_budget numeric(16, 2);
begin
  select code into v_comp_code from public.competitions where id = p_competition_id;
  v_budget := case when v_comp_code = 'UZB' then 7000000 else 70000000 end;

  insert into public.league_instances(competition_id, status, registration_closes_at)
  values (p_competition_id, 'DRAFT', timezone('utc', now()) + interval '12 hours')
  returning id into v_instance_id;

  insert into public.league_clubs(league_instance_id, club_id, transfer_budget, reserved_transfer_budget, cash_balance)
  select v_instance_id, id, v_budget, 0, v_budget
  from public.clubs
  where competition_id = p_competition_id;

  -- Auto-seed Global Market external listings for this new league instance
  perform public.ensure_league_global_market(v_instance_id);

  return v_instance_id;
end $$;

-- 14. Grants
grant execute on function public.seed_41_legend_players() to service_role;
grant execute on function public.create_legend_purchase_intent(uuid, uuid, uuid) to service_role;
grant execute on function public.validate_legend_precheckout(uuid, uuid, integer) to service_role;
grant execute on function public.fulfill_legend_purchase(uuid, text, text) to service_role;
grant execute on function public.record_legend_refund(uuid) to service_role;
grant execute on function public.ensure_league_global_market(uuid) to service_role;

commit;
