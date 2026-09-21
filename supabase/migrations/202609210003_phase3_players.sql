begin;

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  version text not null,
  source_url text not null,
  license text,
  imported_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references public.data_sources(id) on delete restrict,
  source_player_id text not null,
  club_id uuid references public.clubs(id) on delete set null,
  name text not null,
  short_name text not null,
  age smallint not null check (age between 15 and 50),
  nationality text not null,
  primary_position text not null,
  secondary_position text,
  market_value numeric(16, 2) not null default 0 check (market_value >= 0),
  form smallint not null default 70 check (form between 0 and 100),
  fitness smallint not null default 100 check (fitness between 0 and 100),
  morale smallint not null default 70 check (morale between 0 and 100),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (data_source_id, source_player_id)
);
create index players_club_idx on public.players (club_id);
create index players_search_idx on public.players (lower(name));
create trigger players_set_updated_at before update on public.players
for each row execute function public.set_updated_at();

create table public.player_positions (
  player_id uuid not null references public.players(id) on delete cascade,
  position text not null,
  priority smallint not null check (priority between 1 and 10),
  primary key (player_id, position),
  unique (player_id, priority)
);

create table public.player_attributes (
  player_id uuid primary key references public.players(id) on delete cascade,
  overall smallint not null check (overall between 1 and 99),
  pace smallint not null check (pace between 1 and 99),
  shooting smallint not null check (shooting between 1 and 99),
  passing smallint not null check (passing between 1 and 99),
  dribbling smallint not null check (dribbling between 1 and 99),
  defending smallint not null check (defending between 1 and 99),
  physical smallint not null check (physical between 1 and 99),
  updated_at timestamptz not null default timezone('utc', now())
);
create index player_attributes_overall_idx on public.player_attributes (overall desc);

create table public.club_players (
  id uuid primary key default gen_random_uuid(),
  league_club_id uuid not null references public.league_clubs(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  squad_number smallint check (squad_number between 1 and 99),
  acquired_at timestamptz not null default timezone('utc', now()),
  acquired_fee numeric(16, 2) not null default 0 check (acquired_fee >= 0),
  resale_locked_until timestamptz,
  unique (league_club_id, player_id),
  unique (league_club_id, squad_number)
);
create index club_players_player_idx on public.club_players (player_id);

insert into public.data_sources (code, name, version, source_url, license)
values (
  'FC26_SOFIFA',
  'FC 26 Player Data (SoFIFA schema export)',
  '26.4-2025-09-19',
  'https://github.com/ismailoksuz/EAFC26-DataHub/blob/main/data/players.csv',
  'CC BY 4.0'
);

create or replace function public.sync_club_players()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  insert into public.club_players (league_club_id, player_id)
  select lc.id, p.id
  from public.league_clubs lc
  join public.players p on p.club_id = lc.club_id
  on conflict (league_club_id, player_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.create_league_instance(p_competition_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_number integer; v_count integer; v_limit integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_competition_id::text));
  select club_limit into v_limit from public.competitions where id=p_competition_id and is_active;
  if not found then raise exception using errcode='P0002',message='COMPETITION_NOT_FOUND'; end if;
  select count(*) into v_count from public.clubs where competition_id=p_competition_id;
  if v_count<>v_limit then raise exception using errcode='P0001',message='COMPETITION_CLUB_COUNT_INVALID'; end if;
  select coalesce(max(instance_number),0)+1 into v_number from public.league_instances where competition_id=p_competition_id;
  insert into public.league_instances(competition_id,instance_number) values(p_competition_id,v_number) returning id into v_id;
  insert into public.league_clubs(league_instance_id,club_id) select v_id,id from public.clubs where competition_id=p_competition_id order by name;
  perform public.sync_club_players();
  return v_id;
end;
$$;

alter table public.data_sources enable row level security;
alter table public.players enable row level security;
alter table public.player_positions enable row level security;
alter table public.player_attributes enable row level security;
alter table public.club_players enable row level security;
revoke all on table public.data_sources, public.players, public.player_positions,
  public.player_attributes, public.club_players from anon, authenticated;
revoke all on function public.sync_club_players() from public, anon, authenticated;
grant execute on function public.sync_club_players() to service_role;

commit;
