begin;

-- Repair only still-open global lobbies with no human-owned clubs. They were
-- generated with an already-passed first kick-off time before the lobby closed.
do $$
declare v_league uuid;
begin
  for v_league in
    select li.id from public.league_instances li
    where li.access_mode='GLOBAL'
      and li.registration_closes_at>timezone('utc',now())
      and not exists(select 1 from public.league_clubs lc where lc.league_instance_id=li.id and lc.manager_type='HUMAN')
  loop
    delete from public.matches where league_instance_id=v_league;
    delete from public.fixtures where league_instance_id=v_league;
    update public.league_clubs lc set played=0,wins=0,draws=0,losses=0,goals_for=0,goals_against=0,points=0,
      cash_balance=c.starting_budget,transfer_budget=c.starting_budget,reserved_transfer_budget=0
      from public.clubs c where lc.league_instance_id=v_league and c.id=lc.club_id;
    perform public.generate_league_fixtures(v_league,current_date+1);
  end loop;
end $$;

create or replace function public.release_global_leagues(p_run_key text,p_start_at timestamptz)
returns integer language plpgsql security definer set search_path='' as $$
declare v_comp uuid;v_league uuid;v_count integer:=0;
begin
  insert into public.global_league_release_runs(run_key) values(p_run_key) on conflict do nothing;
  if not found then return 0; end if;
  update public.league_instances set registration_closes_at=timezone('utc',now())
   where access_mode='GLOBAL' and registration_closes_at is not null and registration_closes_at>timezone('utc',now());
  for v_comp in select id from public.competitions where code in('PL','LALIGA') and is_active loop
    v_league:=public.create_league_instance(v_comp);
    update public.league_instances set access_mode='GLOBAL',registration_closes_at=p_start_at+interval '12 hours' where id=v_league;
    perform public.generate_league_fixtures(v_league,p_start_at::date+1);
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

commit;
