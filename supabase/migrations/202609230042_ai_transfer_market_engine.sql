-- Migration: 202609230042_ai_transfer_market_engine.sql
-- Active AI Transfer Market Engine:
-- 1. ensure_ai_market_listings(p_league_instance_id): Populates 2-3 surplus rotation players per AI club on the transfer list
-- 2. ai_market_buy_cycle(p_league_instance_id): Enables AI clubs with budget to buy fair-priced human listings
-- 3. Automatic seeding of active leagues upon activation and maintenance

begin;

-- 1. Create or replace ensure_ai_market_listings
create or replace function public.ensure_ai_market_listings(p_league_instance_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_league public.league_instances%rowtype;
  v_comp_code text;
  v_club record;
  v_active_listings integer;
  v_needed integer;
  v_squad_count integer;
  v_player record;
  v_asking_price numeric(16,2);
  v_total_created integer := 0;
begin
  select * into v_league from public.league_instances where id = p_league_instance_id;
  if not found or v_league.status <> 'ACTIVE' then
    return 0;
  end if;

  select code into v_comp_code from public.competitions where id = v_league.competition_id;

  -- Iterate through all AI clubs in this league instance
  for v_club in
    select lc.id, c.name as club_name
    from public.league_clubs lc
    join public.clubs c on c.id = lc.club_id
    where lc.league_instance_id = p_league_instance_id
      and lc.manager_type = 'AI'
  loop
    -- Count current active listings by this AI club
    select count(*) into v_active_listings
    from public.global_market_listings
    where seller_club_id = v_club.id
      and status = 'ACTIVE'
      and available_until > timezone('utc', now());

    if v_active_listings < 2 then
      v_needed := 2 - v_active_listings;

      -- Check squad size (must remain > 18)
      select count(*) into v_squad_count
      from public.club_players
      where league_club_id = v_club.id;

      if v_squad_count > 18 then
        -- Find surplus players:
        -- - not currently active on transfer list
        -- - not in starting 11 (lineup_players)
        -- - not resale locked
        -- - club has more than 1 player in this position (especially GK)
        -- - for Uzbek league: max OVR <= 80
        for v_player in
          select cp.id as cp_id, cp.player_id, p.market_value, pa.overall, p.primary_position
          from public.club_players cp
          join public.players p on p.id = cp.player_id
          left join public.player_attributes pa on pa.player_id = p.id
          where cp.league_club_id = v_club.id
            and (cp.resale_locked_until is null or cp.resale_locked_until <= timezone('utc', now()))
            and not exists (
              select 1 from public.global_market_listings gml
              where gml.club_player_id = cp.id
                and gml.status = 'ACTIVE'
            )
            and not exists (
              select 1 from public.lineup_players lp
              where lp.club_player_id = cp.id
            )
            and (
              select count(*) from public.club_players cp2
              join public.players p2 on p2.id = cp2.player_id
              where cp2.league_club_id = v_club.id
                and p2.primary_position = p.primary_position
            ) > 1
            and (v_comp_code <> 'UZB' or coalesce(pa.overall, 70) <= 80)
          order by coalesce(pa.overall, 70) asc
          limit v_needed
        loop
          -- Calculate price (1.10x market value, rounded to 100k, min sensible price)
          v_asking_price := round((coalesce(v_player.market_value, 1000000) * 1.10) / 100000) * 100000;
          if v_comp_code = 'UZB' then
            v_asking_price := greatest(500000, v_asking_price);
          else
            v_asking_price := greatest(1000000, v_asking_price);
          end if;

          insert into public.global_market_listings (
            league_instance_id,
            club_player_id,
            player_id,
            seller_club_id,
            seller_name,
            asking_price,
            status,
            available_until
          ) values (
            p_league_instance_id,
            v_player.cp_id,
            v_player.player_id,
            v_club.id,
            v_club.club_name,
            v_asking_price,
            'ACTIVE',
            timezone('utc', now()) + interval '24 hours'
          );

          v_total_created := v_total_created + 1;
        end loop;
      end if;
    end if;
  end loop;

  return v_total_created;
end $$;

-- 2. Create or replace ai_market_buy_cycle
create or replace function public.ai_market_buy_cycle(p_league_instance_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_league public.league_instances%rowtype;
  v_comp_code text;
  v_listing record;
  v_buyer record;
  v_purchased integer := 0;
begin
  select * into v_league from public.league_instances where id = p_league_instance_id;
  if not found or v_league.status <> 'ACTIVE' then
    return 0;
  end if;

  select code into v_comp_code from public.competitions where id = v_league.competition_id;

  -- Look for active club listings in this league instance (especially human seller listings)
  -- that are reasonably priced (asking_price <= 1.35 * market_value)
  for v_listing in
    select gml.id, gml.club_player_id, gml.player_id, gml.seller_club_id, gml.asking_price,
           coalesce(pa.overall, 70) as overall, p.primary_position, p.market_value
    from public.global_market_listings gml
    join public.players p on p.id = gml.player_id
    left join public.player_attributes pa on pa.player_id = p.id
    join public.league_clubs sc on sc.id = gml.seller_club_id
    where gml.league_instance_id = p_league_instance_id
      and gml.status = 'ACTIVE'
      and gml.club_player_id is not null
      and gml.available_until > timezone('utc', now())
      and gml.asking_price <= (coalesce(p.market_value, 1000000) * 1.35)
      and (v_comp_code <> 'UZB' or coalesce(pa.overall, 70) <= 80)
    order by sc.manager_type desc, gml.created_at asc -- Prioritize buying human listings first!
    limit 2 -- Process up to 2 purchases per cycle to avoid draining all AI budgets at once
  loop
    -- Find an eligible AI buyer club in this league
    select lc.id, lc.cash_balance, lc.transfer_budget
    into v_buyer
    from public.league_clubs lc
    where lc.league_instance_id = p_league_instance_id
      and lc.manager_type = 'AI'
      and lc.id <> v_listing.seller_club_id
      and (lc.cash_balance - lc.reserved_transfer_budget) >= v_listing.asking_price
      and (lc.transfer_budget - lc.reserved_transfer_budget) >= v_listing.asking_price
      and (select count(*) from public.club_players where league_club_id = lc.id) < 32
      and not exists (
        select 1 from public.club_players
        where league_club_id = lc.id and player_id = v_listing.player_id
      )
    order by (lc.transfer_budget - lc.reserved_transfer_budget) desc
    limit 1;

    if v_buyer.id is not null then
      begin
        perform public.buy_listed_player(v_buyer.id, v_listing.id);
        v_purchased := v_purchased + 1;
      exception when others then
        -- Continue if one buy fails due to lock/squad constraint
        null;
      end;
    end if;
  end loop;

  return v_purchased;
end $$;

-- 3. Trigger ensure_ai_market_listings on league activation in activate_due_open_leagues
create or replace function public.activate_due_open_leagues()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer := 0;
  v_rec record;
begin
  for v_rec in
    update public.league_instances
    set status = 'ACTIVE',
        updated_at = timezone('utc', now())
    where status = 'OPEN'
      and registration_closes_at is not null
      and registration_closes_at <= timezone('utc', now())
    returning id
  loop
    v_count := v_count + 1;
    perform public.ensure_ai_market_listings(v_rec.id);
  end loop;

  return v_count;
end $$;

-- 4. Immediately seed listings for all currently ACTIVE leagues
do $$
declare
  r record;
begin
  for r in select id from public.league_instances where status = 'ACTIVE' loop
    perform public.ensure_ai_market_listings(r.id);
  end loop;
end $$;

commit;
