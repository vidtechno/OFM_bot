-- Migration: 202609220035_sync_reconciled_rosters.sql
-- Goal: Reconcile 2026/27 European Elite club player ownership and clean up fantasy/misplaced players.
-- Sync club_players in fresh OPEN lobbies.

begin;

-- Helper function to move player by name pattern (safe: removes duplicates at target first)
create or replace function public.reconcile_move_player(p_pattern text, p_target_club_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_club_id uuid;
  v_player record;
begin
  if p_target_club_name is not null then
    select id into v_club_id from public.clubs where name = p_target_club_name;
  else
    v_club_id := null;
  end if;

  -- For each matching player, remove any duplicate at the target club first
  for v_player in
    select id, source_player_id from public.players
    where short_name ilike p_pattern
  loop
    if v_club_id is not null and v_player.source_player_id is not null then
      -- Delete duplicate entries at the target club (keep only lowest id = canonical)
      delete from public.players
      where club_id = v_club_id
        and source_player_id = v_player.source_player_id
        and id <> v_player.id;
    end if;

    -- Now safely move the player
    update public.players
    set club_id = v_club_id
    where id = v_player.id;
  end loop;
end;
$$;

-- 1. Reconcile verified 2026/27 moves
select public.reconcile_move_player('H. Kane', 'Bayern München');
select public.reconcile_move_player('J. Kimmich', 'Bayern München');
select public.reconcile_move_player('K. De Bruyne', 'Manchester City');
select public.reconcile_move_player('%Gündoğan%', 'Manchester City');
select public.reconcile_move_player('G. Donnarumma', 'Paris Saint-Germain');
select public.reconcile_move_player('K. Kvaratskhelia', 'Napoli');
select public.reconcile_move_player('S. McTominay', 'Napoli');
select public.reconcile_move_player('R. Lukaku', 'Napoli');
select public.reconcile_move_player('T. Reijnders', 'AC Milan');
select public.reconcile_move_player('M. Rashford', 'Manchester United');
select public.reconcile_move_player('A. Garnacho', 'Manchester United');
select public.reconcile_move_player('R. Højlund', 'Manchester United');
select public.reconcile_move_player('L. Díaz', 'Liverpool');
select public.reconcile_move_player('F. Wirtz', 'Bayer Leverkusen');
select public.reconcile_move_player('J. Frimpong', 'Bayer Leverkusen');
select public.reconcile_move_player('A. Isak', 'Newcastle United');
select public.reconcile_move_player('V. Gyökeres', 'Sporting CP');
select public.reconcile_move_player('N. Jackson', 'Chelsea');
select public.reconcile_move_player('N. Madueke', 'Chelsea');
select public.reconcile_move_player('C. Nkunku', 'Chelsea');
select public.reconcile_move_player('J. Alvarez', 'Atlético Madrid');

-- 2. Move external players (not belonging to the 20 Elite clubs) to external pool (club_id = null)
select public.reconcile_move_player('A. Khusanov', null);
select public.reconcile_move_player('R. Aït-Nouri', null);
select public.reconcile_move_player('R. Cherki', null);
select public.reconcile_move_player('L. Chevalier', null);
select public.reconcile_move_player('%Zubimendi%', null);
select public.reconcile_move_player('E. Eze', null);
select public.reconcile_move_player('H. Ekitiké', null);
select public.reconcile_move_player('M. Kerkez', null);
select public.reconcile_move_player('L. Openda', null);
select public.reconcile_move_player('C. Nørgaard', null);
select public.reconcile_move_player('Mosquera', null);
select public.reconcile_move_player('Dro', null);

-- Clean up helper
drop function public.reconcile_move_player(text, text);

-- 3. Deduplicate players within the same club if any duplicate short_name
-- Cascade: remove all references before deleting the duplicate player row
do $$
declare
  dup_id uuid;
begin
  for dup_id in
    select p1.id
    from public.players p1
    join public.players p2
      on p1.club_id = p2.club_id
      and p1.club_id is not null
      and p1.short_name = p2.short_name
      and p1.id > p2.id
  loop
    -- 3a. Remove lineup_players referencing this duplicate
    delete from public.lineup_players lp
    using public.club_players cp
    where lp.club_player_id = cp.id
      and cp.player_id = dup_id;

    -- 3b. Remove global_market_listings referencing this duplicate
    delete from public.global_market_listings where player_id = dup_id;

    -- 3c. Remove transfer_offers referencing this duplicate via club_player
    delete from public.transfer_offers tf
    using public.club_players cp
    where tf.club_player_id = cp.id
      and cp.player_id = dup_id;

    -- 3d. Remove club_players referencing this duplicate
    delete from public.club_players where player_id = dup_id;

    -- 3e. Now safe to delete the duplicate player
    delete from public.players where id = dup_id;
  end loop;
end;
$$;

-- 4. Clean up stale club_players in open lobbies with 0 transfer activity
delete from public.lineup_players lp
where lp.club_player_id in (
  select cp.id
  from public.club_players cp
  join public.league_clubs lc on lc.id = cp.league_club_id
  join public.league_instances li on li.id = lc.league_instance_id
  join public.players p on p.id = cp.player_id
  where li.status = 'OPEN'
    and p.club_id is distinct from lc.club_id
    and not exists (
      select 1 from public.transfer_offers
      where buyer_club_id = lc.id or seller_club_id = lc.id
    )
);

delete from public.club_players cp
using public.league_clubs lc, public.league_instances li, public.players p
where cp.league_club_id = lc.id
  and cp.player_id = p.id
  and lc.league_instance_id = li.id
  and li.status = 'OPEN'
  and p.club_id is distinct from lc.club_id
  and not exists (
    select 1 from public.transfer_offers
    where buyer_club_id = lc.id or seller_club_id = lc.id
  );

-- 5. Sync club_players to populate new canonical squad players into open lobbies
select public.sync_club_players();

commit;
