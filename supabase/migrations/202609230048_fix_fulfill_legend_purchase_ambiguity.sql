-- Migration: 202609230048_fix_fulfill_legend_purchase_ambiguity.sql
-- Fix: column reference "league_instance_id" is ambiguous in fulfill_legend_purchase
-- Root cause: v_pur.league_instance_id clashes with the return column league_instance_id
-- Solution: Add #variable_conflict use_column and use explicit v_pur prefix everywhere

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
#variable_conflict use_column
declare
  v_pur record;
  v_lp  record;
  v_lc  record;
  v_cp_id uuid;
  v_squad_num smallint;
  v_count integer;
begin
  -- Idempotency: if already fulfilled with this charge ID, return stored result
  select
    p.id,
    p.league_instance_id as v_league_instance_id,
    p.league_club_id     as v_league_club_id,
    lp.name,
    lp.primary_position,
    lp.overall,
    c.name               as v_club_name,
    llp.club_player_id   as v_cp_id_existing
  into v_pur
  from public.legend_purchases p
  join public.legend_players lp on lp.id = p.legend_id
  join public.league_clubs lc on lc.id = p.league_club_id
  join public.clubs c on c.id = lc.club_id
  left join public.league_legend_players llp on llp.purchase_id = p.id
  where p.telegram_payment_charge_id = p_telegram_payment_charge_id
    and p.status = 'FULFILLED';

  if found and v_pur.v_cp_id_existing is not null then
    return query
    select
      v_pur.v_cp_id_existing,
      v_pur.name,
      v_pur.primary_position,
      v_pur.overall,
      v_pur.v_club_name,
      v_pur.v_league_instance_id;
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
    -- Already fulfilled — return existing data
    declare
      v_cp2_id uuid;
      v_name2 text;
      v_pos2 text;
      v_ovr2 smallint;
      v_cname2 text;
    begin
      select llp.club_player_id, lp.name, lp.primary_position, lp.overall, c.name
      into v_cp2_id, v_name2, v_pos2, v_ovr2, v_cname2
      from public.league_legend_players llp
      join public.legend_players lp on lp.id = llp.legend_id
      join public.league_clubs lc2 on lc2.id = llp.league_club_id
      join public.clubs c on c.id = lc2.club_id
      where llp.purchase_id = p_purchase_id;

      return query
      select v_cp2_id, v_name2, v_pos2, v_ovr2, v_cname2, v_pur.league_instance_id;
      return;
    end;
  end if;

  -- Fetch legend and club info into separate vars
  select * into v_lp from public.legend_players where id = v_pur.legend_id;

  select lc.*, c.name as v_club_name
  into v_lc
  from public.league_clubs lc
  join public.clubs c on c.id = lc.club_id
  where lc.id = v_pur.league_club_id;

  -- Check legend limit (max 5 per club)
  select count(*) into v_count
  from public.league_legend_players
  where league_club_id = v_pur.league_club_id and status = 'ACTIVE';

  if v_count >= 5 then
    raise exception 'LEGEND_LIMIT_REACHED';
  end if;

  -- Check league uniqueness (one legend per league)
  if exists (
    select 1 from public.league_legend_players llp2
    where llp2.league_instance_id = v_pur.league_instance_id
      and llp2.legend_id = v_pur.legend_id
      and llp2.status = 'ACTIVE'
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

  -- Insert into club_players
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

  -- Insert into league_legend_players
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

  -- Mark purchase as FULFILLED
  update public.legend_purchases
  set status = 'FULFILLED',
      telegram_payment_charge_id = p_telegram_payment_charge_id,
      provider_payment_charge_id = p_provider_payment_charge_id,
      paid_at = timezone('utc', now())
  where id = p_purchase_id;

  return query
  select v_cp_id, v_lp.name, v_lp.primary_position, v_lp.overall, v_lc.v_club_name, v_pur.league_instance_id;
end $$;

grant execute on function public.fulfill_legend_purchase(uuid, text, text) to service_role;
