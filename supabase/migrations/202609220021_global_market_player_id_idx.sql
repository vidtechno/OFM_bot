begin;

create unique index if not exists global_market_listings_player_id_idx
on public.global_market_listings(player_id)
where player_id is not null;

commit;
