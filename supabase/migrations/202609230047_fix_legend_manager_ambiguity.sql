-- Migration: 202609230047_fix_legend_manager_ambiguity.sql
-- Description: Add variable_conflict use_column to create_legend_purchase_intent and validate_legend_precheckout

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
#variable_conflict use_column
declare
  v_lc record;
  v_lp record;
  v_count integer;
  v_pid uuid;
begin
  -- 1. Validate user and club ownership (using manager_user_id)
  select lc.id, lc.league_instance_id, lc.manager_type, lc.manager_user_id, c.name as club_name, li.status as league_status
  into v_lc
  from public.league_clubs lc
  join public.clubs c on c.id = lc.club_id
  join public.league_instances li on li.id = lc.league_instance_id
  where lc.id = p_league_club_id;

  if not found then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  if v_lc.manager_type != 'HUMAN' or v_lc.manager_user_id != p_user_id then
    raise exception 'NOT_CLUB_MANAGER';
  end if;

  -- Allow legend purchases both in OPEN pre-season and in ACTIVE seasons
  if v_lc.league_status not in ('OPEN', 'ACTIVE') then
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

-- Pre-checkout Validation RPC
create or replace function public.validate_legend_precheckout(
  p_purchase_id uuid,
  p_user_id uuid,
  p_stars_amount integer
)
returns boolean language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
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

  if v_pur.league_status not in ('OPEN', 'ACTIVE') then
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

grant execute on function public.create_legend_purchase_intent(uuid, uuid, uuid) to service_role;
grant execute on function public.validate_legend_precheckout(uuid, uuid, integer) to service_role;
