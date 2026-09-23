begin;

-- Persistent career fields. Existing lifetime W/D/L, XP and streak columns stay authoritative.
alter table public.manager_profiles
  add column if not exists runner_up_finishes integer not null default 0 check (runner_up_finishes >= 0),
  add column if not exists third_place_finishes integer not null default 0 check (third_place_finishes >= 0),
  add column if not exists best_finish integer check (best_finish is null or best_finish > 0);

create table if not exists public.manager_season_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  league_instance_id uuid not null references public.league_instances(id) on delete restrict,
  competition_code text not null,
  competition_name text not null,
  instance_number integer not null,
  club_name text not null,
  final_position integer not null check (final_position > 0),
  played integer not null,
  wins integer not null,
  draws integer not null,
  losses integer not null,
  goals_for integer not null,
  goals_against integer not null,
  goal_difference integer not null,
  points integer not null,
  season_xp_earned integer not null default 0,
  champion boolean not null default false,
  runner_up boolean not null default false,
  third_place boolean not null default false,
  finished_at timestamptz not null default timezone('utc',now()),
  unique(user_id, league_instance_id)
);
create index if not exists manager_season_history_user_idx
  on public.manager_season_history(user_id, finished_at desc);

create table if not exists public.season_summary_deliveries (
  id uuid primary key default gen_random_uuid(),
  season_history_id uuid not null unique references public.manager_season_history(id) on delete cascade,
  telegram_id bigint not null,
  attempts integer not null default 0 check(attempts >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc',now())
);
create index if not exists season_summary_pending_idx
  on public.season_summary_deliveries(created_at) where sent_at is null;

create table if not exists public.league_invites (
  id uuid primary key default gen_random_uuid(),
  league_instance_id uuid not null references public.league_instances(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text,'-',''),
  created_at timestamptz not null default timezone('utc',now()),
  revoked_at timestamptz,
  unique(league_instance_id, created_by)
);
create index if not exists league_invites_token_idx on public.league_invites(token);

create table if not exists public.match_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  reminder_type text not null default '45_MIN',
  telegram_id bigint not null,
  league_club_id uuid not null references public.league_clubs(id) on delete cascade,
  attempts integer not null default 0 check(attempts >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  unique(user_id, fixture_id, reminder_type)
);
create index if not exists match_reminders_pending_idx
  on public.match_reminders(created_at) where sent_at is null;

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.users(id) on delete set null,
  event_name text not null,
  dedup_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now()),
  unique(event_name, dedup_key)
);
create index if not exists analytics_events_name_time_idx on public.analytics_events(event_name, created_at desc);

create or replace function public.log_analytics_event(
  p_user_id uuid, p_event_name text, p_dedup_key text default null, p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.analytics_events(user_id,event_name,dedup_key,metadata)
  values(p_user_id,p_event_name,p_dedup_key,coalesce(p_metadata,'{}'::jsonb))
  on conflict(event_name,dedup_key) do nothing;
end $$;

create or replace function public.archive_completed_league(p_league_instance_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer := 0;
begin
  if not exists(select 1 from public.league_instances where id=p_league_instance_id and status='COMPLETED') then
    return 0;
  end if;

  with ranked as (
    select lc.*, row_number() over(order by lc.points desc,(lc.goals_for-lc.goals_against) desc,lc.goals_for desc,lc.id)::int as final_position,
           li.instance_number,co.code competition_code,co.name competition_name,c.name club_name
    from public.league_clubs lc
    join public.league_instances li on li.id=lc.league_instance_id
    join public.competitions co on co.id=li.competition_id
    join public.clubs c on c.id=lc.club_id
    where lc.league_instance_id=p_league_instance_id
  ), inserted as (
    insert into public.manager_season_history(
      user_id,league_instance_id,competition_code,competition_name,instance_number,club_name,
      final_position,played,wins,draws,losses,goals_for,goals_against,goal_difference,points,
      season_xp_earned,champion,runner_up,third_place,finished_at
    )
    select r.manager_user_id,p_league_instance_id,r.competition_code,r.competition_name,r.instance_number,r.club_name,
           r.final_position,r.played,r.wins,r.draws,r.losses,r.goals_for,r.goals_against,
           r.goals_for-r.goals_against,r.points,
           coalesce((select sum(x.xp_amount) from public.manager_xp_events x join public.matches m on m.id=x.match_id
                     where x.user_id=r.manager_user_id and m.league_instance_id=p_league_instance_id),0)::int,
           r.final_position=1,r.final_position=2,r.final_position=3,timezone('utc',now())
    from ranked r where r.manager_user_id is not null
    on conflict(user_id,league_instance_id) do nothing
    returning *
  ), profile_updates as (
    select user_id,count(*)::int seasons,
           count(*) filter(where champion)::int champions,
           count(*) filter(where runner_up)::int runners,
           count(*) filter(where third_place)::int thirds,
           min(final_position)::int best_finish
    from inserted group by user_id
  )
  update public.manager_profiles p set
    seasons=p.seasons+u.seasons,
    titles=p.titles+u.champions,
    runner_up_finishes=p.runner_up_finishes+u.runners,
    third_place_finishes=p.third_place_finishes+u.thirds,
    best_finish=case when p.best_finish is null then u.best_finish else least(p.best_finish,u.best_finish) end,
    updated_at=timezone('utc',now())
  from profile_updates u where p.user_id=u.user_id;

  insert into public.manager_honours(manager_user_id,league_instance_id,competition_code,season,honour_type,title)
  select h.user_id,h.league_instance_id,h.competition_code,1,
         case h.final_position when 1 then 'CHAMPION' when 2 then 'RUNNER_UP' else 'THIRD_PLACE' end,
         h.competition_name||' #'||lpad(h.instance_number::text,4,'0')||
         case h.final_position when 1 then ' — Chempion' when 2 then ' — 2-o‘rin' else ' — 3-o‘rin' end
  from public.manager_season_history h
  where h.league_instance_id=p_league_instance_id and h.final_position<=3
  on conflict(manager_user_id,league_instance_id,honour_type) do nothing;

  insert into public.season_summary_deliveries(season_history_id,telegram_id)
  select h.id,u.telegram_id from public.manager_season_history h join public.users u on u.id=h.user_id
  where h.league_instance_id=p_league_instance_id and u.telegram_id is not null
  on conflict(season_history_id) do nothing;

  get diagnostics v_count=row_count;
  return v_count;
end $$;

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
  select v_token,co.name,li.instance_number,
         count(lc.id) filter(where lc.manager_type='HUMAN')::int,co.club_limit,
         (co.club_limit-count(lc.id) filter(where lc.manager_type='HUMAN'))::int
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
  select li.id,li.status::text,co.name,li.instance_number,
         count(lc.id) filter(where lc.manager_type='HUMAN')::int,co.club_limit,
         (co.club_limit-count(lc.id) filter(where lc.manager_type='HUMAN'))::int,
         (select li2.id from public.league_instances li2 where li2.competition_id=li.competition_id and li2.status='OPEN'
          order by li2.created_at desc limit 1)
  from public.league_invites inv join public.league_instances li on li.id=inv.league_instance_id
  join public.competitions co on co.id=li.competition_id join public.league_clubs lc on lc.league_instance_id=li.id
  where inv.token=p_token and inv.revoked_at is null
  group by li.id,li.status,co.name,li.instance_number,co.club_limit,li.competition_id;
end $$;

create or replace function public.period_leaderboard(p_user_id uuid,p_period text,p_limit integer default 10)
returns table(user_id uuid,display_name text,username text,xp bigint,wins bigint,matches bigint,rank bigint,is_current boolean)
language sql stable security definer set search_path='' as $$
  with bounds as (
    select case
      when p_period='DAILY' then (date_trunc('day',timezone('Asia/Tashkent',timezone('utc',now()))) at time zone 'Asia/Tashkent')
      when p_period='WEEKLY' then (date_trunc('week',timezone('Asia/Tashkent',timezone('utc',now()))) at time zone 'Asia/Tashkent')
      else '-infinity'::timestamptz end as starts_at
  ), totals as (
    select u.id user_id,u.first_name display_name,u.username,
           coalesce(sum(x.xp_amount),0)::bigint xp,
           count(*) filter(where x.reason='MATCH_WIN')::bigint wins,
           count(distinct x.match_id) filter(where x.match_id is not null)::bigint matches
    from public.users u left join public.manager_xp_events x on x.user_id=u.id and x.created_at >= (select starts_at from bounds)
    where not u.is_blocked group by u.id,u.first_name,u.username
  ), ranked as (
    select t.*,row_number() over(order by xp desc,wins desc,matches asc,user_id asc)::bigint rank from totals t
  )
  select r.user_id,r.display_name,r.username,r.xp,r.wins,r.matches,r.rank,r.user_id=p_user_id
  from ranked r where r.rank<=least(greatest(p_limit,1),50) or r.user_id=p_user_id order by r.rank;
$$;

create or replace function public.launch_dashboard_stats()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'users',(select count(*) from public.users),
    'todayUsers',(select count(*) from public.users where created_at >= (date_trunc('day',timezone('Asia/Tashkent',timezone('utc',now()))) at time zone 'Asia/Tashkent')),
    'activeManagers',(select count(distinct lc.manager_user_id) from public.league_clubs lc join public.league_instances li on li.id=lc.league_instance_id where lc.manager_user_id is not null and li.status in('OPEN','ACTIVE')),
    'claimedClubs',(select count(*) from public.league_clubs lc join public.league_instances li on li.id=lc.league_instance_id where lc.manager_type='HUMAN' and li.status in('OPEN','ACTIVE')),
    'activeLeagues',(select count(*) from public.league_instances where status='ACTIVE'),
    'completedMatches',(select count(*) from public.matches),
    'transfers',(select count(*) from public.finance_transactions where kind='TRANSFER' and amount<0),
    'starsAttempts',(select count(*) from public.legend_purchases),
    'starsPending',(select count(*) from public.legend_purchases where status='PENDING'),
    'starsPaid',(select count(*) from public.legend_purchases where status in('PAID','FULFILLED')),
    'starsRefunded',(select count(*) from public.legend_purchases where status='REFUNDED'),
    'starsFailed',(select count(*) from public.legend_purchases where status in('FAILED','CANCELLED'))
  );
$$;

-- Production Stars pricing. Payment flow continues reading the price from DB.
update public.legend_players set stars_price=case
  when lower(name) in ('lionel messi','cristiano ronaldo','ronaldo nazário','ronaldo nazario') then 100
  when lower(name) in ('zinedine zidane','ronaldinho','paolo maldini','gianluigi buffon') then 75
  when lower(name) in ('toni kroos','gareth bale','marcelo') then 50
  when upper(tier)='GOAT' then 100
  when upper(tier)='ICON' then 75
  when upper(tier) in('ELITE','ELITE LEGEND') then 50
  else 30 end
where active;

alter table public.manager_season_history enable row level security;
alter table public.season_summary_deliveries enable row level security;
alter table public.league_invites enable row level security;
alter table public.match_reminders enable row level security;
alter table public.analytics_events enable row level security;
revoke all on table public.manager_season_history,public.season_summary_deliveries,public.league_invites,public.match_reminders,public.analytics_events from public,anon,authenticated;
grant select,insert,update,delete on table public.manager_season_history,public.season_summary_deliveries,public.league_invites,public.match_reminders,public.analytics_events to service_role;
revoke all on function public.archive_completed_league(uuid),public.create_league_invite(uuid,uuid),public.resolve_league_invite(text,uuid),public.period_leaderboard(uuid,text,integer),public.launch_dashboard_stats(),public.log_analytics_event(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.archive_completed_league(uuid),public.create_league_invite(uuid,uuid),public.resolve_league_invite(text,uuid),public.period_leaderboard(uuid,text,integer),public.launch_dashboard_stats(),public.log_analytics_event(uuid,text,text,jsonb) to service_role;

commit;
