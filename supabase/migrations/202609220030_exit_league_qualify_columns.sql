-- 202609220030_exit_league_qualify_columns.sql
-- Qualify table columns in exit_league_club to prevent ambiguous reference with output parameter

begin;

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
    update public.league_clubs lc
    set manager_type = 'AI', manager_user_id = null, claimed_at = null
    where lc.id = p_league_club_id;

    delete from public.league_memberships lm
    where lm.league_club_id = p_league_club_id and lm.user_id = p_user_id;

  elsif v_status = 'ACTIVE' then
    -- Transition club to AI management, retaining squad, budget, standings, and fixtures
    update public.league_clubs lc
    set manager_type = 'AI', manager_user_id = null
    where lc.id = p_league_club_id;

    delete from public.league_memberships lm
    where lm.league_club_id = p_league_club_id and lm.user_id = p_user_id;

    -- Record departure to block re-joining the same active instance
    insert into public.league_departures(league_instance_id, user_id, departed_at)
    values(v_instance_id, p_user_id, timezone('utc', now()))
    on conflict (league_instance_id, user_id) do update set departed_at = timezone('utc', now());
  else
    raise exception using errcode = 'P0001', message = 'CANNOT_EXIT_COMPLETED_LEAGUE';
  end if;

  return query select p_league_club_id, v_club, v_league, v_status;
end $$;

grant execute on function public.exit_league_club(uuid, uuid) to service_role;

commit;
