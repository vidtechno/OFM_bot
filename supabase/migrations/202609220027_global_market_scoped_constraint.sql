-- 202609220027_global_market_scoped_constraint.sql
-- Drop single player_id unique constraint on global_market_listings
-- and replace with (league_instance_id, player_id) unique constraint to allow
-- per-league-instance scoped global market pools.

begin;

alter table public.global_market_listings
drop constraint if exists global_market_listings_player_id_key;

alter table public.global_market_listings
drop constraint if exists global_market_listings_instance_player_unique;

alter table public.global_market_listings
add constraint global_market_listings_instance_player_unique unique (league_instance_id, player_id);

commit;
