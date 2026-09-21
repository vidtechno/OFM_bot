begin;

create type public.fixture_status as enum ('SCHEDULED','PLAYED','POSTPONED','CANCELLED');

create table public.game_schedule_config (
  id boolean primary key default true check(id),
  timezone text not null default 'Asia/Tashkent',
  first_match_time time not null default '13:00',
  second_match_time time not null default '21:00',
  updated_at timestamptz not null default timezone('utc',now())
);
insert into public.game_schedule_config default values;

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  league_instance_id uuid not null references public.league_instances(id) on delete cascade,
  round_number smallint not null check(round_number between 1 and 60),
  home_club_id uuid not null references public.league_clubs(id) on delete cascade,
  away_club_id uuid not null references public.league_clubs(id) on delete cascade,
  scheduled_at timestamptz not null,
  status public.fixture_status not null default 'SCHEDULED',
  created_at timestamptz not null default timezone('utc',now()),
  check(home_club_id<>away_club_id),
  unique(league_instance_id,round_number,home_club_id),
  unique(league_instance_id,round_number,away_club_id),
  unique(league_instance_id,home_club_id,away_club_id)
);
create index fixtures_schedule_idx on public.fixtures(status,scheduled_at);
create index fixtures_home_idx on public.fixtures(home_club_id,round_number);
create index fixtures_away_idx on public.fixtures(away_club_id,round_number);

create function public.generate_league_fixtures(p_league_instance_id uuid,p_start_date date default null)
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_clubs uuid[]; v_count integer; v_round integer; v_pair integer;
  v_home uuid; v_away uuid; v_left uuid; v_right uuid; v_inserted integer:=0;
  v_tz text; v_first time; v_second time; v_date date; v_time time; v_return_index integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_league_instance_id::text));
  select array_agg(lc.id order by c.name),count(*) into v_clubs,v_count
  from public.league_clubs lc join public.clubs c on c.id=lc.club_id
  where lc.league_instance_id=p_league_instance_id;
  if v_count<2 or mod(v_count,2)<>0 then raise exception 'INVALID_LEAGUE_CLUB_COUNT'; end if;
  select timezone,first_match_time,second_match_time into v_tz,v_first,v_second from public.game_schedule_config where id=true;
  if p_start_date is null then p_start_date=(timezone(v_tz,now()))::date+1; end if;

  for v_round in 0..v_count-2 loop
    v_date:=p_start_date+(v_round/2);
    v_time:=case when mod(v_round,2)=0 then v_first else v_second end;
    for v_pair in 0..(v_count/2)-1 loop
      if v_pair=0 then v_left:=v_clubs[v_count]; v_right:=v_clubs[mod(v_round,v_count-1)+1];
      else
        v_left:=v_clubs[mod(v_round+v_pair,v_count-1)+1];
        v_right:=v_clubs[mod(v_round-v_pair+(v_count-1)*2,v_count-1)+1];
      end if;
      if mod(v_round,2)=1 then v_home:=v_right;v_away:=v_left;else v_home:=v_left;v_away:=v_right;end if;
      insert into public.fixtures(league_instance_id,round_number,home_club_id,away_club_id,scheduled_at)
      values(p_league_instance_id,v_round+1,v_home,v_away,make_timestamptz(extract(year from v_date)::int,extract(month from v_date)::int,extract(day from v_date)::int,extract(hour from v_time)::int,extract(minute from v_time)::int,0,v_tz))
      on conflict do nothing;
      if found then v_inserted:=v_inserted+1;end if;
      v_return_index:=v_round+v_count-1;
      insert into public.fixtures(league_instance_id,round_number,home_club_id,away_club_id,scheduled_at)
      values(p_league_instance_id,v_round+v_count,v_away,v_home,make_timestamptz(
        extract(year from (p_start_date+(v_return_index/2)))::int,
        extract(month from (p_start_date+(v_return_index/2)))::int,
        extract(day from (p_start_date+(v_return_index/2)))::int,
        extract(hour from (case when mod(v_return_index,2)=0 then v_first else v_second end))::int,
        extract(minute from (case when mod(v_return_index,2)=0 then v_first else v_second end))::int,0,v_tz))
      on conflict do nothing;
      if found then v_inserted:=v_inserted+1;end if;
    end loop;
  end loop;
  update public.league_instances set starts_at=make_timestamptz(extract(year from p_start_date)::int,extract(month from p_start_date)::int,extract(day from p_start_date)::int,extract(hour from v_first)::int,extract(minute from v_first)::int,0,v_tz)
  where id=p_league_instance_id and starts_at is null;
  return v_inserted;
end $$;

select public.generate_league_fixtures(id,null) from public.league_instances where status='ACTIVE';

alter table public.game_schedule_config enable row level security;
alter table public.fixtures enable row level security;
revoke all on table public.game_schedule_config,public.fixtures from anon,authenticated;
revoke all on function public.generate_league_fixtures(uuid,date) from public,anon,authenticated;
grant execute on function public.generate_league_fixtures(uuid,date) to service_role;
commit;
