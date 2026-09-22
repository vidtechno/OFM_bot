-- 202609220028_buy_global_player_alias.sql
-- Ensure buy_global_player delegates to buy_global_market_player

begin;

create or replace function public.buy_global_player(
  p_user_id uuid,
  p_buyer_club_id uuid,
  p_listing_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
begin
  return public.buy_global_market_player(p_user_id, p_buyer_club_id, p_listing_id);
end $$;

grant execute on function public.buy_global_player(uuid, uuid, uuid) to service_role;

commit;
