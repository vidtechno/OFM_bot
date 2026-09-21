begin;

alter table public.league_instances
  add column access_mode text not null default 'GLOBAL' check(access_mode in('GLOBAL','PRIVATE')),
  add column join_code text unique,
  add column registration_closes_at timestamptz,
  add column created_by_user_id uuid references public.users(id) on delete set null;

alter table public.league_memberships drop constraint if exists league_memberships_user_id_competition_id_key;
create index if not exists league_memberships_user_competition_idx on public.league_memberships(user_id,competition_id);
create index if not exists league_instances_lobby_idx on public.league_instances(competition_id,access_mode,registration_closes_at);

create table public.global_league_release_runs(
  run_key text primary key,
  created_at timestamptz not null default timezone('utc',now())
);

create function public.release_global_leagues(p_run_key text,p_start_at timestamptz)
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
    perform public.generate_league_fixtures(v_league,p_start_at::date);
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

create function public.create_private_league(p_user_id uuid,p_competition_id uuid)
returns table(league_id uuid,invite_code text) language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_code text;
begin
  if not exists(select 1 from public.users where id=p_user_id and not is_blocked) then raise exception 'USER_NOT_FOUND';end if;
  v_id:=public.create_league_instance(p_competition_id);
  loop
    v_code:=substring(upper(md5(random()::text||clock_timestamp()::text)) from 1 for 8);
    begin
      update public.league_instances set access_mode='PRIVATE',join_code=v_code,created_by_user_id=p_user_id,registration_closes_at=null where id=v_id;
      exit;
    exception when unique_violation then end;
  end loop;
  perform public.generate_league_fixtures(v_id,current_date);
  return query select v_id,v_code;
end $$;

create function public.claim_private_league_club(p_user_id uuid,p_join_code text,p_league_club_id uuid)
returns table(league_club_id uuid,club_name text,league_name text) language plpgsql security definer set search_path='' as $$
declare v_league public.league_instances%rowtype;v_club text;v_comp text;
begin
  select * into v_league from public.league_instances where join_code=upper(p_join_code) and access_mode='PRIVATE' for update;
  if not found then raise exception 'INVITE_CODE_NOT_FOUND';end if;
  if not exists(select 1 from public.league_clubs where id=p_league_club_id and league_instance_id=v_league.id and manager_type='AI') then raise exception 'CLUB_NOT_AVAILABLE';end if;
  update public.league_clubs set manager_type='HUMAN',manager_user_id=p_user_id,claimed_at=timezone('utc',now()) where id=p_league_club_id;
  insert into public.league_memberships(league_instance_id,competition_id,league_club_id,user_id) values(v_league.id,v_league.competition_id,p_league_club_id,p_user_id);
  select c.name,co.name into v_club,v_comp from public.league_clubs lc join public.clubs c on c.id=lc.club_id join public.competitions co on co.id=c.competition_id where lc.id=p_league_club_id;
  return query select p_league_club_id,v_club,v_comp||' · Private';
end $$;

revoke all on function public.release_global_leagues(text,timestamptz),public.create_private_league(uuid,uuid),public.claim_private_league_club(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.release_global_leagues(text,timestamptz),public.create_private_league(uuid,uuid),public.claim_private_league_club(uuid,text,uuid) to service_role;
commit;
