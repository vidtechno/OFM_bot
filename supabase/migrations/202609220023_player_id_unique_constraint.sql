begin;

alter table public.global_market_listings
add constraint global_market_listings_player_id_key unique (player_id);

commit;
