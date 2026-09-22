-- Migration: 202609230037_elite_2026_2027_rosters.sql
-- Goal: Reconcile European Elite rosters for 2026/27 season.
-- Removes fantasy/career-mode transfers (e.g. Modric at Milan, Trent at Real Madrid, Palhinha at Spurs).
-- Returns real players to their clubs (Modric to Real, Trent to Liverpool, Palhinha to Bayern, Sterling to Arsenal, Theo Hernandez to Milan, etc.)
-- O'zbekiston Superligasi (code = 'UZB') is completely untouched.

begin;

-- Helper function to safely reassign players (strictly protecting UZB competition)
create or replace function public.reconcile_move_elite_player(p_pattern text, p_target_club_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uzb_comp_id uuid;
  v_elite_comp_id uuid;
  v_club_id uuid;
  v_player record;
begin
  select id into v_uzb_comp_id from public.competitions where code = 'UZB';
  select id into v_elite_comp_id from public.competitions where code = 'ELITE';

  if p_target_club_name is not null then
    select id into v_club_id from public.clubs where name = p_target_club_name and competition_id = v_elite_comp_id;
    if v_club_id is null then
      raise exception 'Target club % not found in ELITE competition', p_target_club_name;
    end if;
  else
    v_club_id := null;
  end if;

  -- Process matching players while strictly excluding any Uzbek league clubs
  for v_player in
    select p.id, p.source_player_id
    from public.players p
    left join public.clubs c on c.id = p.club_id
    where p.short_name ilike p_pattern
      and (p.club_id is null or c.competition_id is distinct from v_uzb_comp_id)
  loop
    if v_club_id is not null and v_player.source_player_id is not null then
      -- Delete duplicate entries at the target club first
      delete from public.players
      where club_id = v_club_id
        and source_player_id = v_player.source_player_id
        and id <> v_player.id;
    end if;

    update public.players
    set club_id = v_club_id
    where id = v_player.id;
  end loop;
end;
$$;

-- 1. Real Madrid
select public.reconcile_move_elite_player('L. Modrić', 'Real Madrid');
select public.reconcile_move_elite_player('T. Alexander-Arnold', 'Liverpool');
select public.reconcile_move_elite_player('D. Huijsen', null);
select public.reconcile_move_elite_player('Álvaro Carreras', 'Benfica');
select public.reconcile_move_elite_player('Alvaro Carreras', 'Benfica');
select public.reconcile_move_elite_player('F. Mastantuono', null);

-- 2. Liverpool
select public.reconcile_move_elite_player('F. Chiesa', 'Liverpool');

-- 3. Manchester City
select public.reconcile_move_elite_player('M. Akanji', 'Manchester City');
select public.reconcile_move_elite_player('O. Marmoush', null);
select public.reconcile_move_elite_player('Nico González', null);

-- 4. Bayern München
select public.reconcile_move_elite_player('Palhinha', 'Bayern München');
select public.reconcile_move_elite_player('M. Tel', 'Bayern München');
select public.reconcile_move_elite_player('J. Tah', 'Bayer Leverkusen');
select public.reconcile_move_elite_player('David Santos Daiber', null);
select public.reconcile_move_elite_player('J. Bärtl', null);
select public.reconcile_move_elite_player('L. Klanac', null);

-- 5. Arsenal
select public.reconcile_move_elite_player('Kepa', null);
select public.reconcile_move_elite_player('P. Hincapié', 'Bayer Leverkusen');
select public.reconcile_move_elite_player('R. Sterling', 'Arsenal');
select public.reconcile_move_elite_player('T. Tomiyasu', 'Arsenal');

-- 6. AC Milan
select public.reconcile_move_elite_player('A. Rabiot', null);
select public.reconcile_move_elite_player('P. Estupiñán', null);
select public.reconcile_move_elite_player('P. Terracciano', null);
select public.reconcile_move_elite_player('S. Ricci', null);
select public.reconcile_move_elite_player('A. Jashari', null);
select public.reconcile_move_elite_player('K. De Winter', null);
select public.reconcile_move_elite_player('M. Thiaw', 'AC Milan');
select public.reconcile_move_elite_player('T. Hernández', 'AC Milan');
select public.reconcile_move_elite_player('T. Abraham', 'AC Milan');
select public.reconcile_move_elite_player('I. Bennacer', 'AC Milan');
select public.reconcile_move_elite_player('N. Okafor', 'AC Milan');

-- 7. Tottenham Hotspur
select public.reconcile_move_elite_player('X. Simons', null);
select public.reconcile_move_elite_player('R. Kolo Muani', 'Paris Saint-Germain');
select public.reconcile_move_elite_player('M. Kudus', null);

-- 8. Manchester United
select public.reconcile_move_elite_player('B. Mbeumo', null);
select public.reconcile_move_elite_player('Matheus Cunha', null);
select public.reconcile_move_elite_player('B. Šeško', null);
select public.reconcile_move_elite_player('P. Dorgu', null);

-- 9. Newcastle United
select public.reconcile_move_elite_player('Y. Wissa', null);
select public.reconcile_move_elite_player('A. Elanga', null);
select public.reconcile_move_elite_player('N. Woltemade', null);
select public.reconcile_move_elite_player('J. Ramsey', null);
select public.reconcile_move_elite_player('A. Ramsdale', null);

-- 10. Juventus
select public.reconcile_move_elite_player('J. David', null);
select public.reconcile_move_elite_player('E. Zhegrova', null);

-- 11. Chelsea
select public.reconcile_move_elite_player('J. Gittens', 'Borussia Dortmund');
select public.reconcile_move_elite_player('C. Chukwuemeka', 'Chelsea');
select public.reconcile_move_elite_player('João Pedro', null);
select public.reconcile_move_elite_player('L. Delap', null);
select public.reconcile_move_elite_player('J. Hato', null);
select public.reconcile_move_elite_player('F. Buonanotte', null);

-- 12. Atlético Madrid
select public.reconcile_move_elite_player('G. Raspadori', 'Napoli');
select public.reconcile_move_elite_player('Álex Baena', null);
select public.reconcile_move_elite_player('D. Hancko', null);
select public.reconcile_move_elite_player('Johnny Cardoso', null);
select public.reconcile_move_elite_player('T. Almada', null);
select public.reconcile_move_elite_player('M. Ruggeri', null);
select public.reconcile_move_elite_player('Pubill', null);

-- 13. Napoli
select public.reconcile_move_elite_player('Miguel Gutiérrez', null);
select public.reconcile_move_elite_player('N. Lang', null);
select public.reconcile_move_elite_player('V. Milinković-Savić', null);
select public.reconcile_move_elite_player('S. Beukema', null);
select public.reconcile_move_elite_player('L. Lucca', null);

-- 14. Inter
select public.reconcile_move_elite_player('Luis Henrique', null);
select public.reconcile_move_elite_player('Y. Bonny', null);
select public.reconcile_move_elite_player('A. Diouf', null);
select public.reconcile_move_elite_player('P. Sučić', null);
select public.reconcile_move_elite_player('F. Esposito', null);

-- 15. Borussia Dortmund
select public.reconcile_move_elite_player('D. Svensson', null);
select public.reconcile_move_elite_player('A. Anselmino', null);
select public.reconcile_move_elite_player('J. Bellingham', null);

-- 16. Barcelona
select public.reconcile_move_elite_player('R. Bardghji', null);

-- Clean up helper function
drop function public.reconcile_move_elite_player(text, text);

-- Deduplicate players within the same club if any duplicate short_name
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
    delete from public.lineup_players lp
    using public.club_players cp
    where lp.club_player_id = cp.id
      and cp.player_id = dup_id;

    delete from public.global_market_listings where player_id = dup_id;

    delete from public.transfer_offers tf
    using public.club_players cp
    where tf.club_player_id = cp.id
      and cp.player_id = dup_id;

    delete from public.club_players where player_id = dup_id;
    delete from public.players where id = dup_id;
  end loop;
end;
$$;

-- Clean up stale club_players in open lobbies with 0 transfer activity
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

-- Sync club_players to populate new canonical squad players into open lobbies
select public.sync_club_players();

commit;
