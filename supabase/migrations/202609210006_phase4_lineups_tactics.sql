begin;

create table public.formations (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null unique,
  slots jsonb not null check(jsonb_typeof(slots)='array' and jsonb_array_length(slots)=11),
  attacking smallint not null check(attacking between 0 and 100),
  defensive smallint not null check(defensive between 0 and 100),
  midfield_density smallint not null check(midfield_density between 0 and 100),
  wing_strength smallint not null check(wing_strength between 0 and 100),
  counter_vulnerability smallint not null check(counter_vulnerability between 0 and 100),
  created_at timestamptz not null default timezone('utc',now())
);

create table public.tactics (
  league_club_id uuid primary key references public.league_clubs(id) on delete cascade,
  formation_id uuid not null references public.formations(id),
  mentality text not null default 'BALANCED' check(mentality in('VERY_DEFENSIVE','DEFENSIVE','BALANCED','ATTACKING','VERY_ATTACKING')),
  pressing smallint not null default 50 check(pressing between 0 and 100),
  tempo smallint not null default 50 check(tempo between 0 and 100),
  defensive_line smallint not null default 50 check(defensive_line between 0 and 100),
  width smallint not null default 50 check(width between 0 and 100),
  passing_style text not null default 'MIXED' check(passing_style in('SHORT','MIXED','DIRECT')),
  attack_focus text not null default 'MIXED' check(attack_focus in('LEFT','CENTRE','RIGHT','BOTH_WINGS','MIXED')),
  tackling text not null default 'NORMAL' check(tackling in('CAUTIOUS','NORMAL','AGGRESSIVE')),
  updated_at timestamptz not null default timezone('utc',now())
);
create trigger tactics_set_updated_at before update on public.tactics for each row execute function public.set_updated_at();

create table public.lineups (
  id uuid primary key default gen_random_uuid(), league_club_id uuid not null unique references public.league_clubs(id) on delete cascade,
  formation_id uuid not null references public.formations(id),
  updated_at timestamptz not null default timezone('utc',now())
);
create trigger lineups_set_updated_at before update on public.lineups for each row execute function public.set_updated_at();

create table public.lineup_players (
  lineup_id uuid not null references public.lineups(id) on delete cascade,
  slot_key text not null,
  slot_position text not null,
  club_player_id uuid not null references public.club_players(id) on delete restrict,
  effective_rating numeric(5,2) not null check(effective_rating between 1 and 99),
  primary key(lineup_id,slot_key), unique(lineup_id,club_player_id)
);

insert into public.formations(code,name,slots,attacking,defensive,midfield_density,wing_strength,counter_vulnerability) values
('433','4-3-3','[{"key":"GK","position":"GK"},{"key":"LB","position":"LB"},{"key":"LCB","position":"CB"},{"key":"RCB","position":"CB"},{"key":"RB","position":"RB"},{"key":"LCM","position":"CM"},{"key":"CM","position":"CM"},{"key":"RCM","position":"CM"},{"key":"LW","position":"LW"},{"key":"ST","position":"ST"},{"key":"RW","position":"RW"}]',78,65,72,88,58),
('4231','4-2-3-1','[{"key":"GK","position":"GK"},{"key":"LB","position":"LB"},{"key":"LCB","position":"CB"},{"key":"RCB","position":"CB"},{"key":"RB","position":"RB"},{"key":"LCDM","position":"CDM"},{"key":"RCDM","position":"CDM"},{"key":"LAM","position":"CAM"},{"key":"CAM","position":"CAM"},{"key":"RAM","position":"CAM"},{"key":"ST","position":"ST"}]',72,74,84,68,42),
('442','4-4-2','[{"key":"GK","position":"GK"},{"key":"LB","position":"LB"},{"key":"LCB","position":"CB"},{"key":"RCB","position":"CB"},{"key":"RB","position":"RB"},{"key":"LM","position":"LM"},{"key":"LCM","position":"CM"},{"key":"RCM","position":"CM"},{"key":"RM","position":"RM"},{"key":"LST","position":"ST"},{"key":"RST","position":"ST"}]',70,70,70,78,50),
('4321','4-3-2-1','[{"key":"GK","position":"GK"},{"key":"LB","position":"LB"},{"key":"LCB","position":"CB"},{"key":"RCB","position":"CB"},{"key":"RB","position":"RB"},{"key":"LCM","position":"CM"},{"key":"CM","position":"CM"},{"key":"RCM","position":"CM"},{"key":"LAM","position":"CAM"},{"key":"RAM","position":"CAM"},{"key":"ST","position":"ST"}]',75,68,86,45,48),
('352','3-5-2','[{"key":"GK","position":"GK"},{"key":"LCB","position":"CB"},{"key":"CB","position":"CB"},{"key":"RCB","position":"CB"},{"key":"LM","position":"LM"},{"key":"LCM","position":"CM"},{"key":"CAM","position":"CAM"},{"key":"RCM","position":"CM"},{"key":"RM","position":"RM"},{"key":"LST","position":"ST"},{"key":"RST","position":"ST"}]',76,62,90,74,68),
('343','3-4-3','[{"key":"GK","position":"GK"},{"key":"LCB","position":"CB"},{"key":"CB","position":"CB"},{"key":"RCB","position":"CB"},{"key":"LM","position":"LM"},{"key":"LCM","position":"CM"},{"key":"RCM","position":"CM"},{"key":"RM","position":"RM"},{"key":"LW","position":"LW"},{"key":"ST","position":"ST"},{"key":"RW","position":"RW"}]',84,55,70,92,78),
('532','5-3-2','[{"key":"GK","position":"GK"},{"key":"LWB","position":"LWB"},{"key":"LCB","position":"CB"},{"key":"CB","position":"CB"},{"key":"RCB","position":"CB"},{"key":"RWB","position":"RWB"},{"key":"LCM","position":"CM"},{"key":"CM","position":"CM"},{"key":"RCM","position":"CM"},{"key":"LST","position":"ST"},{"key":"RST","position":"ST"}]',62,86,76,72,30),
('523','5-2-3','[{"key":"GK","position":"GK"},{"key":"LWB","position":"LWB"},{"key":"LCB","position":"CB"},{"key":"CB","position":"CB"},{"key":"RCB","position":"CB"},{"key":"RWB","position":"RWB"},{"key":"LCM","position":"CM"},{"key":"RCM","position":"CM"},{"key":"LW","position":"LW"},{"key":"ST","position":"ST"},{"key":"RW","position":"RW"}]',68,82,58,84,38);

insert into public.tactics(league_club_id,formation_id)
select lc.id,f.id from public.league_clubs lc cross join public.formations f where f.code='433';
insert into public.lineups(league_club_id,formation_id)
select lc.id,f.id from public.league_clubs lc cross join public.formations f where f.code='433';

create function public.create_default_club_setup() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_formation uuid;
begin
 select id into v_formation from public.formations where code='433';
 insert into public.tactics(league_club_id,formation_id) values(new.id,v_formation);
 insert into public.lineups(league_club_id,formation_id) values(new.id,v_formation);
 return new;
end $$;
create trigger league_clubs_create_default_setup after insert on public.league_clubs
for each row execute function public.create_default_club_setup();

create function public.save_lineup(p_user_id uuid,p_league_club_id uuid,p_formation_code text,p_assignments jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_lineup uuid;v_formation uuid;v_slots jsonb;
begin
 if not exists(select 1 from public.league_clubs where id=p_league_club_id and manager_user_id=p_user_id) then raise exception 'CLUB_NOT_OWNED';end if;
 select id,slots into v_formation,v_slots from public.formations where code=p_formation_code;
 if v_formation is null or jsonb_array_length(p_assignments)<>11 then raise exception 'INVALID_LINEUP';end if;
 if exists(select 1 from jsonb_to_recordset(p_assignments) as x(slot_key text,slot_position text,club_player_id uuid,effective_rating numeric)
   where not exists(select 1 from public.club_players cp where cp.id=x.club_player_id and cp.league_club_id=p_league_club_id)) then raise exception 'INVALID_PLAYER';end if;
 update public.lineups set formation_id=v_formation where league_club_id=p_league_club_id returning id into v_lineup;
 delete from public.lineup_players where lineup_id=v_lineup;
 insert into public.lineup_players(lineup_id,slot_key,slot_position,club_player_id,effective_rating)
 select v_lineup,x.slot_key,x.slot_position,x.club_player_id,x.effective_rating from jsonb_to_recordset(p_assignments)
 as x(slot_key text,slot_position text,club_player_id uuid,effective_rating numeric);
 update public.tactics set formation_id=v_formation where league_club_id=p_league_club_id;
end $$;

alter table public.formations enable row level security;alter table public.tactics enable row level security;
alter table public.lineups enable row level security;alter table public.lineup_players enable row level security;
revoke all on table public.formations,public.tactics,public.lineups,public.lineup_players from anon,authenticated;
revoke all on function public.save_lineup(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_lineup(uuid,uuid,text,jsonb) to service_role;
commit;
