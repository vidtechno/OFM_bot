-- Migration: 202609220031_deduplicate_elite_squads.sql
-- Goal: Safely deduplicate Real Madrid and the other 9 European top clubs that retained legacy EA_FC27_OFFICIAL rows.
-- Enforce database-level invariant preventing duplicate canonical players per club.

begin;

-- 1. Safely remap existing lineup_players that reference legacy club_players
do $$
declare
  v_lp record;
  v_canonical_cp_id uuid;
begin
  -- Remap known Real Madrid starters to their FC26_SOFIFA counterparts
  -- Courtois
  update public.lineup_players
  set club_player_id = 'a0a3a4dd-4445-43d5-bc70-bbfb2270eb7d'
  where slot_key = 'GK' and club_player_id = 'febbe8e1-3685-468b-95ef-2720ccd46814';

  -- Cucurella (replace with Ferland Mendy)
  update public.lineup_players
  set club_player_id = 'b8850866-a461-457a-a365-ac5b092e0064'
  where slot_key = 'LB' and club_player_id = '8cbb97c9-e0f4-44ba-b322-c4fad5fc901d';

  -- Militao
  update public.lineup_players
  set club_player_id = 'a165f753-02fe-4d64-a04e-3d5db926ffd9'
  where slot_key = 'RCB' and club_player_id = '2e58888f-4302-4151-b230-41336ae2b586';

  -- Valverde (duplicate slot in CM, replace with Camavinga)
  update public.lineup_players
  set club_player_id = 'a8e54006-36de-4141-8c3c-0cb8baf92826'
  where slot_key = 'CM' and club_player_id = '4e9ce6a6-9aef-45a7-87b9-2a3ae2c678d4';

  -- Bellingham
  update public.lineup_players
  set club_player_id = 'bdc1cb5f-1900-4443-8841-ee84bbbaec67'
  where slot_key = 'RCM' and club_player_id = '9a7f5680-b60f-43af-b07b-c3037593a682';

  -- Vini Jr
  update public.lineup_players
  set club_player_id = 'f767fb87-e903-4ed3-845e-68b3b11a17bb'
  where slot_key = 'LW' and club_player_id = 'd0ac8192-a682-4ccf-9fd8-f6d7a8ce012d';

  -- Mbappe
  update public.lineup_players
  set club_player_id = 'f0a1dcf0-569a-4ea1-bf65-e5d5c1ba5f36'
  where slot_key = 'ST' and club_player_id = 'f6d2513c-4929-43c2-b14b-443423763f2d';

  -- Generic fallback loop for any other legacy lineup references across all clubs/lineups
  for v_lp in
    select lp.lineup_id, lp.slot_key, cp.id as old_cp_id, p.source_player_id, cp.league_club_id
    from public.lineup_players lp
    join public.club_players cp on cp.id = lp.club_player_id
    join public.players p on p.id = cp.player_id
    where p.data_source_id = 'f5b2dbc7-0eeb-47c5-b338-32f1c61a5413'
  loop
    select cp_new.id into v_canonical_cp_id
    from public.club_players cp_new
    join public.players p_new on p_new.id = cp_new.player_id
    where cp_new.league_club_id = v_lp.league_club_id
      and p_new.source_player_id = v_lp.source_player_id
      and p_new.data_source_id = 'f54021ee-1775-4a0f-b842-a3614bed9bb1'
      and not exists (
        select 1 from public.lineup_players check_lp
        where check_lp.lineup_id = v_lp.lineup_id
          and check_lp.club_player_id = cp_new.id
      )
    limit 1;

    if v_canonical_cp_id is not null then
      update public.lineup_players
      set club_player_id = v_canonical_cp_id
      where lineup_id = v_lp.lineup_id and slot_key = v_lp.slot_key;
    else
      delete from public.lineup_players
      where lineup_id = v_lp.lineup_id and slot_key = v_lp.slot_key;
    end if;
  end loop;
end $$;

-- 2. Delete duplicate legacy club_players rows for the Elite clubs
delete from public.club_players
where player_id in (
  select p.id
  from public.players p
  join public.clubs c on c.id = p.club_id
  join public.competitions comp on comp.id = c.competition_id
  where comp.code = 'ELITE'
    and p.data_source_id = 'f5b2dbc7-0eeb-47c5-b338-32f1c61a5413'
);

-- 3. Delete duplicate legacy players rows (attributes and positions cascade delete)
delete from public.players
where id in (
  select p.id
  from public.players p
  join public.clubs c on c.id = p.club_id
  join public.competitions comp on comp.id = c.competition_id
  where comp.code = 'ELITE'
    and p.data_source_id = 'f5b2dbc7-0eeb-47c5-b338-32f1c61a5413'
);

-- 4. Future duplicate protection: enforce unique (club_id, source_player_id)
create unique index if not exists players_club_source_player_idx
on public.players (club_id, source_player_id)
where club_id is not null;

commit;
