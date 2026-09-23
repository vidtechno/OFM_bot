begin;

-- Portable core scheduler migration. This deliberately does not try to install
-- pg_cron/pg_net: managed Supabase projects may reject extension privilege changes.
create table if not exists public.fixture_simulation_claims (
  fixture_id uuid primary key references public.fixtures(id) on delete cascade,
  worker_id uuid not null,
  claimed_at timestamptz not null default timezone('utc', now())
);

alter table public.fixture_simulation_claims enable row level security;
revoke all on table public.fixture_simulation_claims from public, anon, authenticated;

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
    insert into public.fixture_simulation_claims(fixture_id,worker_id,claimed_at)
    select id,p_worker_id,timezone('utc',now()) from candidates
    on conflict(fixture_id) do update set worker_id=excluded.worker_id,claimed_at=excluded.claimed_at
      where public.fixture_simulation_claims.claimed_at<timezone('utc',now())-interval '5 minutes'
    returning fixture_id
  ) select c.id,c.home_club_id,c.away_club_id from candidates c join claimed x on x.fixture_id=c.id;
end $$;

create or replace function public.release_fixture_claim(p_fixture_id uuid,p_worker_id uuid)
returns void language sql security definer set search_path='' as $$
  delete from public.fixture_simulation_claims where fixture_id=p_fixture_id and worker_id=p_worker_id;
$$;

revoke all on function public.claim_due_fixtures(integer,uuid) from public,anon,authenticated;
revoke all on function public.release_fixture_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_due_fixtures(integer,uuid) to service_role;
grant execute on function public.release_fixture_claim(uuid,uuid) to service_role;

commit;
