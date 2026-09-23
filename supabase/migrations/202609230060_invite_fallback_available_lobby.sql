begin;

create or replace function public.resolve_league_invite(p_token text,p_user_id uuid default null)
returns table(league_instance_id uuid,status text,competition_name text,instance_number integer,human_count integer,club_limit integer,remaining integer,recommended_open_league_id uuid)
language plpgsql security definer set search_path='' as $$
begin
  perform public.log_analytics_event(p_user_id,'league_invite_opened',coalesce(p_token,'')||':'||coalesce(p_user_id::text,'anon'),'{}'::jsonb);
  return query
  select li.id,li.status::text,co.name,li.instance_number::integer,
         count(lc.id) filter(where lc.manager_type='HUMAN')::integer,co.club_limit::integer,
         (co.club_limit::bigint-count(lc.id) filter(where lc.manager_type='HUMAN'))::integer,
         (select li2.id from public.league_instances li2
          where li2.competition_id=li.competition_id and li2.status='OPEN' and li2.id<>li.id
            and exists(select 1 from public.league_clubs lc2 where lc2.league_instance_id=li2.id and lc2.manager_type='AI')
          order by li2.created_at desc limit 1)
  from public.league_invites inv join public.league_instances li on li.id=inv.league_instance_id
  join public.competitions co on co.id=li.competition_id join public.league_clubs lc on lc.league_instance_id=li.id
  where inv.token=p_token and inv.revoked_at is null
  group by li.id,li.status,co.name,li.instance_number,co.club_limit,li.competition_id;
end $$;

commit;
