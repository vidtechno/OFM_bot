-- 202609220029_claim_league_club_order.sql
-- Check MAX_TOURNAMENT_LIMIT_REACHED before ALREADY_IN_LEAGUE_INSTANCE

begin;

create or replace function public.claim_league_club(p_user_id uuid, p_league_club_id uuid)
returns table(league_club_id uuid, club_name text, league_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_lc public.league_clubs%rowtype;
  v_comp uuid;
  v_comp_limit int;
  v_instance_id uuid;
  v_instance_status text;
  v_active_count int;
  v_club text;
  v_league text;
  v_human_count int;
begin
  -- 1. Row-level concurrency lock on the user row
  perform 1 from public.users where id = p_user_id for update;

  -- 2. Lock the target club row
  select lc.* into v_lc
  from public.league_clubs lc
  where lc.id = p_league_club_id
  for update;

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

  -- 3. Max 2 active/open tournament limit across entire bot
  select count(*) into v_active_count
  from public.league_memberships lm
  join public.league_instances li on li.id = lm.league_instance_id
  where lm.user_id = p_user_id and li.status in ('ACTIVE', 'OPEN');

  if v_active_count >= 2 then
    raise exception using errcode = 'P0001', message = 'MAX_TOURNAMENT_LIMIT_REACHED';
  end if;

  -- 4. Exploit check: cannot rejoin an ACTIVE instance that user previously departed
  if v_instance_status = 'ACTIVE' and exists(
    select 1 from public.league_departures ld
    where ld.league_instance_id = v_instance_id and ld.user_id = p_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'DEPARTED_LEAGUE_REJOIN_BLOCKED';
  end if;

  -- 5. Cannot join same instance twice
  if exists(
    select 1 from public.league_memberships lm
    where lm.user_id = p_user_id and lm.league_instance_id = v_instance_id
  ) then
    raise exception using errcode = 'P0001', message = 'ALREADY_IN_LEAGUE_INSTANCE';
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

grant execute on function public.claim_league_club(uuid, uuid) to service_role;

commit;
