begin;

create or replace function public.create_league_invite(p_user_id uuid,p_league_instance_id uuid)
returns table(token text,competition_name text,instance_number integer,human_count integer,club_limit integer,remaining integer)
language plpgsql security definer set search_path='' as $$
declare v_token text;
begin
  if not exists(select 1 from public.league_clubs where league_instance_id=p_league_instance_id and manager_user_id=p_user_id) then
    raise exception using errcode='P0001',message='NOT_LEAGUE_MANAGER';
  end if;
  if not exists(select 1 from public.league_instances where id=p_league_instance_id and status='OPEN') then
    raise exception using errcode='P0001',message='INVITE_LEAGUE_NOT_OPEN';
  end if;
  insert into public.league_invites(league_instance_id,created_by)
  values(p_league_instance_id,p_user_id)
  on conflict(league_instance_id,created_by) do update set revoked_at=null
  returning league_invites.token into v_token;
  perform public.log_analytics_event(p_user_id,'league_invite_created',v_token,jsonb_build_object('league_instance_id',p_league_instance_id));
  return query
  select v_token,co.name,li.instance_number::integer,
         count(lc.id) filter(where lc.manager_type='HUMAN')::integer,co.club_limit::integer,
         (co.club_limit::bigint-count(lc.id) filter(where lc.manager_type='HUMAN'))::integer
  from public.league_instances li join public.competitions co on co.id=li.competition_id
  join public.league_clubs lc on lc.league_instance_id=li.id
  where li.id=p_league_instance_id group by co.name,li.instance_number,co.club_limit;
end $$;

create or replace function public.resolve_league_invite(p_token text,p_user_id uuid default null)
returns table(league_instance_id uuid,status text,competition_name text,instance_number integer,human_count integer,club_limit integer,remaining integer,recommended_open_league_id uuid)
language plpgsql security definer set search_path='' as $$
begin
  perform public.log_analytics_event(p_user_id,'league_invite_opened',coalesce(p_token,'')||':'||coalesce(p_user_id::text,'anon'),'{}'::jsonb);
  return query
  select li.id,li.status::text,co.name,li.instance_number::integer,
         count(lc.id) filter(where lc.manager_type='HUMAN')::integer,co.club_limit::integer,
         (co.club_limit::bigint-count(lc.id) filter(where lc.manager_type='HUMAN'))::integer,
         (select li2.id from public.league_instances li2 where li2.competition_id=li.competition_id and li2.status='OPEN'
          order by li2.created_at desc limit 1)
  from public.league_invites inv join public.league_instances li on li.id=inv.league_instance_id
  join public.competitions co on co.id=li.competition_id join public.league_clubs lc on lc.league_instance_id=li.id
  where inv.token=p_token and inv.revoked_at is null
  group by li.id,li.status,co.name,li.instance_number,co.club_limit,li.competition_id;
end $$;

commit;
