-- Reconcile the 2026 Uzbekistan Superliga identities that were duplicated by
-- the old club-scoped Wikipedia importer. Real-world facts were verified on
-- 2026-09-23 against current PFL/Sofascore/Transfermarkt records.
--
-- Important: the two Dostonbek Tursunovs below are different people:
--   Qizilqum #3  - born 2001-01-02, defender
--   Surkhon  #7  - born 2001-01-03, right midfielder

begin;

create temporary table uz_player_merge (
  drop_source_id text primary key,
  keep_source_id text not null
) on commit drop;

insert into uz_player_merge(drop_source_id, keep_source_id) values
  ('UZB_BUN_77_1194408092', 'UZB_NEF_71_1194408092'), -- Bilolkhon -> Neftchi (2026-08-08)
  ('UZB_PAK_13_2103623487', 'UZB_BUN_27_2103623487'), -- Islom -> Bunyodkor
  ('UZB_PAK_14_1734188352', 'UZB_AND_99_1734188352'), -- Rustam -> Andijon (loan)
  ('UZB_NAV_10_310027586',  'UZB_BUX_10_310027586'),  -- Shakhzod -> Buxoro
  ('UZB_NAV_8_1373629814',  'UZB_AND_8_1373629814'),  -- Shokhmalik -> Andijon
  ('UZB_SUR_0_288421521',   'UZB_PAK_90_288421521'),  -- Stephen -> Pakhtakor (loan)
  ('UZB_NAV_9_1659136881',  'UZB_SOG_19_1659136881'); -- Zabikhillo -> Sogdiana

create temporary table uz_player_merge_ids on commit drop as
select old.id as drop_id, canonical.id as keep_id
from uz_player_merge m
join public.players old on old.source_player_id = m.drop_source_id
join public.players canonical on canonical.source_player_id = m.keep_source_id;

-- Preserve match history before removing duplicate player rows.
insert into public.player_match_stats(
  match_id, player_id, club_id, minutes, rating, goals, assists, yellow_cards, red_cards
)
select s.match_id, m.keep_id, s.club_id, s.minutes, s.rating,
       s.goals, s.assists, s.yellow_cards, s.red_cards
from public.player_match_stats s
join uz_player_merge_ids m on m.drop_id = s.player_id
on conflict (match_id, player_id) do update set
  minutes = greatest(public.player_match_stats.minutes, excluded.minutes),
  rating = case
    when public.player_match_stats.rating is null then excluded.rating
    when excluded.rating is null then public.player_match_stats.rating
    else greatest(public.player_match_stats.rating, excluded.rating)
  end,
  goals = public.player_match_stats.goals + excluded.goals,
  assists = public.player_match_stats.assists + excluded.assists,
  yellow_cards = public.player_match_stats.yellow_cards + excluded.yellow_cards,
  red_cards = public.player_match_stats.red_cards + excluded.red_cards;

delete from public.player_match_stats s
using uz_player_merge_ids m
where s.player_id = m.drop_id;

update public.match_events e
set player_id = m.keep_id
from uz_player_merge_ids m
where e.player_id = m.drop_id;

-- The stale copies have no valid transfer/listing activity. Remove any stale
-- UI state first so the player rows can be merged without dangling references.
delete from public.lineup_players lp
using public.club_players cp, uz_player_merge_ids m
where lp.club_player_id = cp.id and cp.player_id = m.drop_id;

delete from public.transfer_offers o
using public.club_players cp, uz_player_merge_ids m
where o.club_player_id = cp.id and cp.player_id = m.drop_id;

delete from public.global_market_listings g
using public.club_players cp, uz_player_merge_ids m
where g.club_player_id = cp.id and cp.player_id = m.drop_id;

delete from public.club_players cp
using uz_player_merge_ids m
where cp.player_id = m.drop_id;

delete from public.players p
using uz_player_merge_ids m
where p.id = m.drop_id;

-- Current club, age, position and public market value. OVR and the six game
-- attributes below are game balancing values; no source publishes FC-style
-- ratings for this league, so they must not be presented as official ratings.
with verified(source_id, club_name, age, primary_position, secondary_position,
              market_value, overall, pace, shooting, passing, dribbling, defending, physical) as (
  values
    ('UZB_NEF_71_1194408092', 'Neftchi Fergana',      29, 'LW',  'RW', 380000::numeric, 67, 72, 65, 66, 70, 38, 61),
    ('UZB_QIZ_3_125633829',   'FC Qizilqum',          25, 'CB',  null, 100000::numeric, 62, 64, 35, 55, 53, 63, 66),
    ('UZB_SUR_7_125633829',   'Surkhon Termiz',       25, 'RM',  'LB', 360000::numeric, 66, 71, 58, 65, 67, 61, 64),
    ('UZB_BUN_27_2103623487', 'Bunyodkor Tashkent',  20, 'LB',  'CB',  25000::numeric, 58, 65, 35, 52, 55, 57, 55),
    ('UZB_AND_99_1734188352', 'FC Andijon',           22, 'ST',  'CF', 360000::numeric, 68, 75, 70, 58, 69, 30, 66),
    ('UZB_BUX_10_310027586',  'FC Buxoro',            28, 'ST',  'CF', 160000::numeric, 65, 70, 67, 56, 65, 28, 64),
    ('UZB_AND_8_1373629814',  'FC Andijon',           26, 'CAM', 'CM', 260000::numeric, 66, 67, 62, 69, 68, 52, 62),
    ('UZB_PAK_90_288421521',  'Pakhtakor Tashkent',  26, 'ST',  'CF', 370000::numeric, 68, 73, 70, 57, 66, 29, 72),
    ('UZB_SOG_19_1659136881', 'Sogdiana Jizzakh',    31, 'ST',  'CF', 170000::numeric, 64, 62, 67, 55, 63, 28, 69)
), resolved as (
  select p.id, c.id as club_id, v.*
  from verified v
  join public.players p on p.source_player_id = v.source_id
  join public.clubs c on c.name = v.club_name
)
update public.players p
set club_id = r.club_id,
    age = r.age,
    nationality = 'UZB',
    primary_position = r.primary_position,
    secondary_position = r.secondary_position,
    market_value = r.market_value,
    updated_at = timezone('utc', now())
from resolved r
where p.id = r.id;

with verified(source_id, overall, pace, shooting, passing, dribbling, defending, physical) as (
  values
    ('UZB_NEF_71_1194408092', 67,72,65,66,70,38,61),
    ('UZB_QIZ_3_125633829',   62,64,35,55,53,63,66),
    ('UZB_SUR_7_125633829',   66,71,58,65,67,61,64),
    ('UZB_BUN_27_2103623487', 58,65,35,52,55,57,55),
    ('UZB_AND_99_1734188352', 68,75,70,58,69,30,66),
    ('UZB_BUX_10_310027586',  65,70,67,56,65,28,64),
    ('UZB_AND_8_1373629814',  66,67,62,69,68,52,62),
    ('UZB_PAK_90_288421521',  68,73,70,57,66,29,72),
    ('UZB_SOG_19_1659136881', 64,62,67,55,63,28,69)
)
update public.player_attributes a
set overall=v.overall, pace=v.pace, shooting=v.shooting, passing=v.passing,
    dribbling=v.dribbling, defending=v.defending, physical=v.physical,
    updated_at=timezone('utc', now())
from verified v
join public.players p on p.source_player_id=v.source_id
where a.player_id=p.id;

-- Replace guessed positions with verified positions.
with verified(source_id, positions) as (
  values
    ('UZB_NEF_71_1194408092', array['LW','RW']::text[]),
    ('UZB_QIZ_3_125633829',   array['CB']::text[]),
    ('UZB_SUR_7_125633829',   array['RM','LB','RB']::text[]),
    ('UZB_BUN_27_2103623487', array['LB','CB']::text[]),
    ('UZB_AND_99_1734188352', array['ST','CF']::text[]),
    ('UZB_BUX_10_310027586',  array['ST','CF']::text[]),
    ('UZB_AND_8_1373629814',  array['CAM','CM']::text[]),
    ('UZB_PAK_90_288421521',  array['ST','CF']::text[]),
    ('UZB_SOG_19_1659136881', array['ST','CF']::text[])
), ids as (
  select p.id, v.positions
  from verified v join public.players p on p.source_player_id=v.source_id
)
delete from public.player_positions pp using ids where pp.player_id=ids.id;

with verified(source_id, positions) as (
  values
    ('UZB_NEF_71_1194408092', array['LW','RW']::text[]),
    ('UZB_QIZ_3_125633829',   array['CB']::text[]),
    ('UZB_SUR_7_125633829',   array['RM','LB','RB']::text[]),
    ('UZB_BUN_27_2103623487', array['LB','CB']::text[]),
    ('UZB_AND_99_1734188352', array['ST','CF']::text[]),
    ('UZB_BUX_10_310027586',  array['ST','CF']::text[]),
    ('UZB_AND_8_1373629814',  array['CAM','CM']::text[]),
    ('UZB_PAK_90_288421521',  array['ST','CF']::text[]),
    ('UZB_SOG_19_1659136881', array['ST','CF']::text[])
)
insert into public.player_positions(player_id, position, priority)
select p.id, pos.position, pos.ordinality::smallint
from verified v
join public.players p on p.source_player_id=v.source_id
cross join lateral unnest(v.positions) with ordinality as pos(position, ordinality)
on conflict (player_id, position) do update set priority=excluded.priority;

-- Prefer an in-game transfer over the base real-world club. Otherwise prefer
-- the verified base club. This keeps the user's Pakhtakor purchase of
-- Shokhmalik while removing the copy that sync_club_players re-created.
create temporary table uz_duplicate_club_players on commit drop as
with ranked as (
  select cp.id,
         row_number() over (
           partition by lc.league_instance_id, cp.player_id
           order by (coalesce(cp.acquired_fee,0) > 0) desc,
                    (lc.club_id = p.club_id) desc,
                    cp.acquired_at desc,
                    cp.id
         ) as rn
  from public.club_players cp
  join public.league_clubs lc on lc.id=cp.league_club_id
  join public.players p on p.id=cp.player_id
)
select id from ranked where rn > 1;

delete from public.lineup_players lp
using uz_duplicate_club_players d
where lp.club_player_id=d.id;

delete from public.transfer_offers o
using uz_duplicate_club_players d
where o.club_player_id=d.id;

delete from public.global_market_listings g
using uz_duplicate_club_players d
where g.club_player_id=d.id;

delete from public.club_players cp
using uz_duplicate_club_players d
where cp.id=d.id;

-- Current shirt numbers only apply to untouched base-roster memberships.
with shirts(source_id, shirt_number) as (
  values
    ('UZB_NEF_71_1194408092',71), ('UZB_QIZ_3_125633829',3),
    ('UZB_SUR_7_125633829',7), ('UZB_BUN_27_2103623487',60),
    ('UZB_AND_99_1734188352',14), ('UZB_BUX_10_310027586',10),
    ('UZB_AND_8_1373629814',24), ('UZB_PAK_90_288421521',90),
    ('UZB_SOG_19_1659136881',19)
)
update public.club_players cp
set squad_number=s.shirt_number
from shirts s
join public.players p on p.source_player_id=s.source_id
join public.league_clubs lc on lc.club_id=p.club_id
where cp.player_id=p.id and cp.league_club_id=lc.id
  and coalesce(cp.acquired_fee,0)=0;

-- A player may belong to only one club inside one league instance.
create or replace function public.enforce_one_player_club_per_league()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_league_instance_id uuid;
begin
  select league_instance_id into v_league_instance_id
  from public.league_clubs where id=new.league_club_id;

  if exists (
    select 1
    from public.club_players cp
    join public.league_clubs lc on lc.id=cp.league_club_id
    where cp.player_id=new.player_id
      and lc.league_instance_id=v_league_instance_id
      and cp.id<>new.id
  ) then
    raise exception using errcode='23505', message='PLAYER_ALREADY_IN_LEAGUE';
  end if;
  return new;
end;
$$;

drop trigger if exists club_players_one_club_per_league on public.club_players;
create trigger club_players_one_club_per_league
before insert or update of league_club_id, player_id on public.club_players
for each row execute function public.enforce_one_player_club_per_league();

create or replace function public.sync_club_players()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer;
begin
  insert into public.club_players (league_club_id, player_id)
  select lc.id, p.id
  from public.league_clubs lc
  join public.players p on p.club_id=lc.club_id
  where not exists (
    select 1
    from public.club_players existing
    join public.league_clubs existing_club on existing_club.id=existing.league_club_id
    where existing.player_id=p.id
      and existing_club.league_instance_id=lc.league_instance_id
  )
  on conflict (league_club_id, player_id) do nothing;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.enforce_one_player_club_per_league() from public, anon, authenticated;
revoke all on function public.sync_club_players() from public, anon, authenticated;
grant execute on function public.sync_club_players() to service_role;

commit;
