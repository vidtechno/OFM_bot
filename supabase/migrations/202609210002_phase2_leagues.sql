begin;
create type public.manager_type as enum ('AI','HUMAN');
create type public.league_status as enum ('ACTIVE','COMPLETED');

create table public.competitions (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 name text not null unique, country_code char(2) not null,
 club_limit smallint not null default 20 check(club_limit between 2 and 30),
 rounds smallint not null default 38 check(rounds>0), is_active boolean not null default true,
 created_at timestamptz not null default timezone('utc',now())
);
create table public.clubs (
 id uuid primary key default gen_random_uuid(), competition_id uuid not null references public.competitions(id),
 code text not null, name text not null, city text not null,
 starting_budget numeric(16,2) not null default 50000000 check(starting_budget>=0),
 created_at timestamptz not null default timezone('utc',now()),
 unique(competition_id,code), unique(competition_id,name)
);
create table public.league_instances (
 id uuid primary key default gen_random_uuid(), competition_id uuid not null references public.competitions(id),
 instance_number integer not null check(instance_number>0), season_number integer not null default 1,
 status public.league_status not null default 'ACTIVE', current_round smallint not null default 0,
 starts_at timestamptz, created_at timestamptz not null default timezone('utc',now()),
 updated_at timestamptz not null default timezone('utc',now()), unique(competition_id,instance_number)
);
create index league_instances_join_idx on public.league_instances(competition_id,status,instance_number);
create trigger league_instances_set_updated_at before update on public.league_instances
for each row execute function public.set_updated_at();

create table public.league_clubs (
 id uuid primary key default gen_random_uuid(), league_instance_id uuid not null references public.league_instances(id) on delete cascade,
 club_id uuid not null references public.clubs(id), manager_type public.manager_type not null default 'AI',
 manager_user_id uuid references public.users(id) on delete set null,
 played smallint not null default 0, wins smallint not null default 0, draws smallint not null default 0,
 losses smallint not null default 0, goals_for smallint not null default 0,
 goals_against smallint not null default 0, points smallint not null default 0,
 claimed_at timestamptz, created_at timestamptz not null default timezone('utc',now()),
 updated_at timestamptz not null default timezone('utc',now()), unique(league_instance_id,club_id),
 constraint league_club_manager_check check((manager_type='AI' and manager_user_id is null) or (manager_type='HUMAN' and manager_user_id is not null)),
 constraint league_club_record_check check(played=wins+draws+losses)
);
create index league_clubs_manager_idx on public.league_clubs(manager_user_id) where manager_user_id is not null;
create index league_clubs_table_idx on public.league_clubs(league_instance_id,points desc,((goals_for-goals_against)) desc,goals_for desc);
create trigger league_clubs_set_updated_at before update on public.league_clubs
for each row execute function public.set_updated_at();

create table public.league_memberships (
 id uuid primary key default gen_random_uuid(), league_instance_id uuid not null references public.league_instances(id) on delete cascade,
 competition_id uuid not null references public.competitions(id), league_club_id uuid not null unique references public.league_clubs(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 joined_at timestamptz not null default timezone('utc',now()), unique(user_id,competition_id), unique(user_id,league_instance_id)
);
create index league_memberships_user_idx on public.league_memberships(user_id);

create function public.create_league_instance(p_competition_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
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
 return v_id;
end $$;

create function public.claim_league_club(p_user_id uuid,p_league_club_id uuid)
returns table(league_club_id uuid,club_name text,league_name text)
language plpgsql security definer set search_path='' as $$
declare v_lc public.league_clubs%rowtype; v_comp uuid; v_club text; v_league text;
begin
 if not exists(select 1 from public.users where id=p_user_id and not is_blocked) then raise exception using errcode='P0002',message='USER_NOT_FOUND'; end if;
 select lc.* into v_lc from public.league_clubs lc where lc.id=p_league_club_id for update;
 if not found then raise exception using errcode='P0002',message='CLUB_NOT_FOUND'; end if;
 if v_lc.manager_type='HUMAN' then raise exception using errcode='P0001',message='CLUB_ALREADY_CLAIMED'; end if;
 select li.competition_id,c.name,co.name||' #'||lpad(li.instance_number::text,4,'0') into v_comp,v_club,v_league
 from public.league_instances li join public.competitions co on co.id=li.competition_id join public.clubs c on c.id=v_lc.club_id
 where li.id=v_lc.league_instance_id and li.status='ACTIVE';
 if not found then raise exception using errcode='P0001',message='LEAGUE_NOT_ACTIVE'; end if;
 if exists(select 1 from public.league_memberships where user_id=p_user_id and competition_id=v_comp) then
  raise exception using errcode='P0001',message='COMPETITION_LIMIT_REACHED'; end if;
 update public.league_clubs set manager_type='HUMAN',manager_user_id=p_user_id,claimed_at=timezone('utc',now()) where id=p_league_club_id;
 insert into public.league_memberships(league_instance_id,competition_id,league_club_id,user_id)
 values(v_lc.league_instance_id,v_comp,p_league_club_id,p_user_id);
 return query select p_league_club_id,v_club,v_league;
end $$;

insert into public.competitions(code,name,country_code) values('PL','Premier League','GB'),('LALIGA','LaLiga','ES');
insert into public.clubs(competition_id,code,name,city,starting_budget)
select c.id,s.code,s.name,s.city,s.budget from public.competitions c join(values
('PL','ARS','Arsenal','London',85000000::numeric),('PL','AVL','Aston Villa','Birmingham',65000000::numeric),
('PL','BOU','Bournemouth','Bournemouth',55000000::numeric),('PL','BRE','Brentford','London',55000000::numeric),
('PL','BHA','Brighton','Brighton',60000000::numeric),('PL','BUR','Burnley','Burnley',50000000::numeric),
('PL','CHE','Chelsea','London',80000000::numeric),('PL','CRY','Crystal Palace','London',55000000::numeric),
('PL','EVE','Everton','Liverpool',55000000::numeric),('PL','FUL','Fulham','London',55000000::numeric),
('PL','LEE','Leeds United','Leeds',55000000::numeric),('PL','LIV','Liverpool','Liverpool',85000000::numeric),
('PL','MCI','Manchester City','Manchester',75000000::numeric),('PL','MUN','Manchester United','Manchester',80000000::numeric),
('PL','NEW','Newcastle United','Newcastle',75000000::numeric),('PL','NFO','Nottingham Forest','Nottingham',55000000::numeric),
('PL','SUN','Sunderland','Sunderland',50000000::numeric),('PL','TOT','Tottenham Hotspur','London',75000000::numeric),
('PL','WHU','West Ham United','London',60000000::numeric),('PL','WOL','Wolverhampton','Wolverhampton',55000000::numeric),
('LALIGA','ALA','Alavés','Vitoria-Gasteiz',50000000::numeric),('LALIGA','ATH','Athletic Club','Bilbao',65000000::numeric),
('LALIGA','ATM','Atlético Madrid','Madrid',80000000::numeric),('LALIGA','FCB','Barcelona','Barcelona',75000000::numeric),
('LALIGA','CEL','Celta Vigo','Vigo',55000000::numeric),('LALIGA','ELC','Elche','Elche',50000000::numeric),
('LALIGA','ESP','Espanyol','Barcelona',52000000::numeric),('LALIGA','GET','Getafe','Getafe',52000000::numeric),
('LALIGA','GIR','Girona','Girona',60000000::numeric),('LALIGA','LEV','Levante','Valencia',50000000::numeric),
('LALIGA','MLL','Mallorca','Palma',52000000::numeric),('LALIGA','OSA','Osasuna','Pamplona',52000000::numeric),
('LALIGA','RAY','Rayo Vallecano','Madrid',52000000::numeric),('LALIGA','BET','Real Betis','Seville',62000000::numeric),
('LALIGA','RMA','Real Madrid','Madrid',80000000::numeric),('LALIGA','OVI','Real Oviedo','Oviedo',50000000::numeric),
('LALIGA','RSO','Real Sociedad','San Sebastián',65000000::numeric),('LALIGA','SEV','Sevilla','Seville',60000000::numeric),
('LALIGA','VAL','Valencia','Valencia',60000000::numeric),('LALIGA','VIL','Villarreal','Villarreal',65000000::numeric)
)as s(comp_code,code,name,city,budget)on s.comp_code=c.code;

select public.create_league_instance(id) from public.competitions order by code;
alter table public.competitions enable row level security;
alter table public.clubs enable row level security;
alter table public.league_instances enable row level security;
alter table public.league_clubs enable row level security;
alter table public.league_memberships enable row level security;
revoke all on table public.competitions,public.clubs,public.league_instances,public.league_clubs,public.league_memberships from anon,authenticated;
revoke all on function public.create_league_instance(uuid),public.claim_league_club(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_league_instance(uuid),public.claim_league_club(uuid,uuid) to service_role;
commit;
