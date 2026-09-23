begin;

create or replace function public.claim_due_fixtures(p_limit integer default 20,p_worker_id uuid default gen_random_uuid())
returns table(fixture_id uuid,home_club_id uuid,away_club_id uuid) language plpgsql security definer set search_path='' as $$
begin
  return query with candidates as (
    select f.id,f.home_club_id,f.away_club_id from public.fixtures f
    left join public.fixture_simulation_claims existing on existing.fixture_id=f.id
    where f.status='SCHEDULED' and f.scheduled_at<=timezone('utc',now())
      and (existing.fixture_id is null or existing.claimed_at<timezone('utc',now())-interval '5 minutes')
    order by f.scheduled_at,f.id limit greatest(1,least(p_limit,40)) for update of f skip locked
  ), claimed as (
    insert into public.fixture_simulation_claims as claims(fixture_id,worker_id,claimed_at)
    select id,p_worker_id,timezone('utc',now()) from candidates
    on conflict on constraint fixture_simulation_claims_pkey do update set worker_id=excluded.worker_id,claimed_at=excluded.claimed_at
      where claims.claimed_at<timezone('utc',now())-interval '5 minutes'
    returning claims.fixture_id
  ) select c.id,c.home_club_id,c.away_club_id from candidates c join claimed x on x.fixture_id=c.id;
end $$;

revoke all on function public.claim_due_fixtures(integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_due_fixtures(integer,uuid) to service_role;

commit;
