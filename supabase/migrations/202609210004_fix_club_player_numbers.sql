begin;

alter table public.club_players
drop constraint club_players_league_club_id_squad_number_key;

alter table public.club_players
add constraint club_players_league_club_id_squad_number_key
unique (league_club_id, squad_number);

commit;
