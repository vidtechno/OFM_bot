begin;

-- A player exists once per league instance. Offers must never cross into a
-- different instance, otherwise the same real-world player appears twice.
create or replace function public.create_transfer_offer(p_user_id uuid,p_buyer_club_id uuid,p_club_player_id uuid,p_amount numeric)
returns table(offer_id uuid,status public.transfer_offer_status,counter_amount numeric)
language plpgsql security definer set search_path='' as $$
declare v_seller uuid;v_offer uuid;v_status public.transfer_offer_status:='PENDING';v_counter numeric;v_value numeric;v_overall int;v_age int;v_ai boolean;v_threshold numeric;v_buyer_league uuid;v_seller_league uuid;
begin
 select league_instance_id into v_buyer_league from public.league_clubs where id=p_buyer_club_id and manager_user_id=p_user_id;
 if not found then raise exception 'CLUB_NOT_OWNED';end if;
 select cp.league_club_id,lc.league_instance_id,p.market_value,pa.overall,p.age,(lc.manager_type='AI') into v_seller,v_seller_league,v_value,v_overall,v_age,v_ai
 from public.club_players cp join public.players p on p.id=cp.player_id join public.player_attributes pa on pa.player_id=p.id join public.league_clubs lc on lc.id=cp.league_club_id
 where cp.id=p_club_player_id and (cp.resale_locked_until is null or cp.resale_locked_until<=timezone('utc',now()));
 if not found or v_seller=p_buyer_club_id or v_seller_league<>v_buyer_league then raise exception 'PLAYER_NOT_AVAILABLE';end if;
 if p_amount<greatest(100000,v_value*0.5)then raise exception 'OFFER_TOO_LOW';end if;
 perform 1 from public.league_clubs where id=p_buyer_club_id and transfer_budget-reserved_transfer_budget>=p_amount for update;if not found then raise exception 'INSUFFICIENT_BUDGET';end if;
 insert into public.transfer_offers(buyer_club_id,seller_club_id,club_player_id,amount)values(p_buyer_club_id,v_seller,p_club_player_id,p_amount)returning id into v_offer;
 update public.league_clubs set reserved_transfer_budget=reserved_transfer_budget+p_amount where id=p_buyer_club_id;
 if v_ai then
   v_threshold:=v_value*(1.20+greatest(0,v_overall-82)*0.025+case when v_age<=23 then 0.10 else 0 end);
   if p_amount>=v_threshold then perform public.settle_transfer(v_offer);v_status:='ACCEPTED';
   elsif p_amount>=v_value*1.2 then v_counter:=round(v_threshold/100000)*100000;update public.transfer_offers set status='COUNTERED',counter_amount=v_counter where id=v_offer;v_status:='COUNTERED';
   else update public.transfer_offers set status='REJECTED',responded_at=timezone('utc',now())where id=v_offer;update public.league_clubs set reserved_transfer_budget=reserved_transfer_budget-p_amount where id=p_buyer_club_id;v_status:='REJECTED';end if;
 end if;
 return query select v_offer,v_status,v_counter;
end $$;

commit;
