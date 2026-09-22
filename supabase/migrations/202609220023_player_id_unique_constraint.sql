do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'global_market_listings_player_id_key'
  ) then
    alter table public.global_market_listings
    add constraint global_market_listings_player_id_key unique (player_id);
  end if;
end $$;