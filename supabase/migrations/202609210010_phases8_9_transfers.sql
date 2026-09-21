begin;

alter table public.league_clubs add column reserved_transfer_budget numeric(16,2) not null default 0 check(reserved_transfer_budget>=0);
create type public.transfer_offer_status as enum('PENDING','ACCEPTED','REJECTED','COUNTERED','EXPIRED','CANCELLED');
create type public.market_listing_status as enum('ACTIVE','SOLD','EXPIRED','CANCELLED');

create table public.transfer_offers(
 id uuid primary key default gen_random_uuid(),buyer_club_id uuid not null references public.league_clubs(id),seller_club_id uuid not null references public.league_clubs(id),
 club_player_id uuid not null references public.club_players(id),amount numeric(16,2) not null check(amount>0),counter_amount numeric(16,2) check(counter_amount>0),
 status public.transfer_offer_status not null default 'PENDING',expires_at timestamptz not null default timezone('utc',now())+interval '12 hours',
 responded_at timestamptz,created_at timestamptz not null default timezone('utc',now()),updated_at timestamptz not null default timezone('utc',now()),check(buyer_club_id<>seller_club_id)
);
create unique index transfer_offers_pending_unique on public.transfer_offers(buyer_club_id,club_player_id) where status in('PENDING','COUNTERED');
create index transfer_offers_seller_idx on public.transfer_offers(seller_club_id,status,created_at desc);
create trigger transfer_offers_set_updated_at before update on public.transfer_offers for each row execute function public.set_updated_at();

create table public.global_market_listings(
 id uuid primary key default gen_random_uuid(),club_player_id uuid not null unique references public.club_players(id),seller_club_id uuid not null references public.league_clubs(id),
 asking_price numeric(16,2) not null check(asking_price>0),demand_multiplier numeric(5,2) not null default 1 check(demand_multiplier between 0.8 and 2),
 rarity_multiplier numeric(5,2) not null default 1 check(rarity_multiplier between 0.8 and 2),status public.market_listing_status not null default 'ACTIVE',
 available_until timestamptz not null default timezone('utc',now())+interval '24 hours',created_at timestamptz not null default timezone('utc',now())
);
create index global_market_active_idx on public.global_market_listings(status,available_until,asking_price);

create function public.settle_transfer(p_offer_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_offer public.transfer_offers%rowtype;v_player public.club_players%rowtype;v_buyer public.league_clubs%rowtype;v_seller public.league_clubs%rowtype;v_new_cp uuid;v_balance numeric;
begin
 select * into v_offer from public.transfer_offers where id=p_offer_id for update;if not found then raise exception 'OFFER_NOT_FOUND';end if;
 if v_offer.status not in('PENDING','COUNTERED') then raise exception 'OFFER_NOT_ACTIVE';end if;
 select * into v_player from public.club_players where id=v_offer.club_player_id and league_club_id=v_offer.seller_club_id for update;if not found then raise exception 'PLAYER_NOT_AVAILABLE';end if;
 select * into v_buyer from public.league_clubs where id=v_offer.buyer_club_id for update;select * into v_seller from public.league_clubs where id=v_offer.seller_club_id for update;
 if v_buyer.cash_balance<v_offer.amount or v_buyer.transfer_budget<v_offer.amount then raise exception 'INSUFFICIENT_BUDGET';end if;
 if (select count(*) from public.club_players where league_club_id=v_seller.id)<=18 then raise exception 'SELLER_MIN_SQUAD';end if;
 if (select count(*) from public.club_players where league_club_id=v_buyer.id)>=35 then raise exception 'BUYER_MAX_SQUAD';end if;
 delete from public.lineup_players where club_player_id=v_player.id;
 update public.club_players set league_club_id=v_buyer.id,acquired_at=timezone('utc',now()),acquired_fee=v_offer.amount,resale_locked_until=timezone('utc',now())+interval '48 hours',squad_number=null where id=v_player.id returning id into v_new_cp;
 update public.league_clubs set cash_balance=cash_balance-v_offer.amount,transfer_budget=transfer_budget-v_offer.amount,reserved_transfer_budget=greatest(0,reserved_transfer_budget-v_offer.amount) where id=v_buyer.id returning cash_balance into v_balance;
 insert into public.finance_transactions(league_club_id,kind,amount,balance_after,description)values(v_buyer.id,'TRANSFER',-v_offer.amount,v_balance,'Player purchase');
 update public.league_clubs set cash_balance=cash_balance+v_offer.amount,transfer_budget=transfer_budget+v_offer.amount where id=v_seller.id returning cash_balance into v_balance;
 insert into public.finance_transactions(league_club_id,kind,amount,balance_after,description)values(v_seller.id,'TRANSFER',v_offer.amount,v_balance,'Player sale');
 update public.transfer_offers set status='ACCEPTED',responded_at=timezone('utc',now()) where id=v_offer.id;
 with cancelled as(update public.transfer_offers set status='CANCELLED',responded_at=timezone('utc',now()) where club_player_id=v_player.id and id<>v_offer.id and status in('PENDING','COUNTERED') returning buyer_club_id,amount), totals as(select buyer_club_id,sum(amount) amount from cancelled group by buyer_club_id)
 update public.league_clubs lc set reserved_transfer_budget=greatest(0,lc.reserved_transfer_budget-t.amount)from totals t where lc.id=t.buyer_club_id;
 update public.global_market_listings set status='SOLD' where club_player_id=v_player.id and status='ACTIVE';return v_new_cp;
end $$;

create function public.accept_counter_offer(p_user_id uuid,p_offer_id uuid)returns uuid language plpgsql security definer set search_path='' as $$
declare v public.transfer_offers%rowtype;v_extra numeric;v_result uuid;
begin select o.* into v from public.transfer_offers o join public.league_clubs lc on lc.id=o.buyer_club_id where o.id=p_offer_id and lc.manager_user_id=p_user_id for update;if not found then raise exception 'OFFER_NOT_OWNED';end if;
 if v.status<>'COUNTERED' or v.counter_amount is null or v.expires_at<=timezone('utc',now())then raise exception 'OFFER_NOT_ACTIVE';end if;v_extra:=v.counter_amount-v.amount;
 perform 1 from public.league_clubs where id=v.buyer_club_id and transfer_budget-reserved_transfer_budget>=v_extra for update;if not found then raise exception 'INSUFFICIENT_BUDGET';end if;
 update public.league_clubs set reserved_transfer_budget=reserved_transfer_budget+v_extra where id=v.buyer_club_id;update public.transfer_offers set amount=v.counter_amount where id=v.id;
 v_result:=public.settle_transfer(v.id);return v_result;end $$;

create function public.expire_transfer_offers()returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin with expired as(update public.transfer_offers set status='EXPIRED',responded_at=timezone('utc',now())where status in('PENDING','COUNTERED')and expires_at<=timezone('utc',now())returning buyer_club_id,amount),totals as(select buyer_club_id,sum(amount)amount from expired group by buyer_club_id),released as(update public.league_clubs lc set reserved_transfer_budget=greatest(0,lc.reserved_transfer_budget-t.amount)from totals t where lc.id=t.buyer_club_id returning lc.id)select count(*) into v_count from released;return v_count;end $$;

create function public.create_transfer_offer(p_user_id uuid,p_buyer_club_id uuid,p_club_player_id uuid,p_amount numeric)
returns table(offer_id uuid,status public.transfer_offer_status,counter_amount numeric) language plpgsql security definer set search_path='' as $$
declare v_seller uuid;v_offer uuid;v_status public.transfer_offer_status:='PENDING';v_counter numeric;v_value numeric;v_overall int;v_age int;v_ai boolean;v_threshold numeric;
begin
 if not exists(select 1 from public.league_clubs where id=p_buyer_club_id and manager_user_id=p_user_id)then raise exception 'CLUB_NOT_OWNED';end if;
 select cp.league_club_id,p.market_value,pa.overall,p.age,(lc.manager_type='AI') into v_seller,v_value,v_overall,v_age,v_ai from public.club_players cp join public.players p on p.id=cp.player_id join public.player_attributes pa on pa.player_id=p.id join public.league_clubs lc on lc.id=cp.league_club_id where cp.id=p_club_player_id and (cp.resale_locked_until is null or cp.resale_locked_until<=timezone('utc',now()));
 if not found or v_seller=p_buyer_club_id then raise exception 'PLAYER_NOT_AVAILABLE';end if;
 if p_amount<greatest(100000,v_value*0.5)then raise exception 'OFFER_TOO_LOW';end if;
 perform 1 from public.league_clubs where id=p_buyer_club_id and transfer_budget-reserved_transfer_budget>=p_amount for update;if not found then raise exception 'INSUFFICIENT_BUDGET';end if;
 insert into public.transfer_offers(buyer_club_id,seller_club_id,club_player_id,amount)values(p_buyer_club_id,v_seller,p_club_player_id,p_amount)returning id into v_offer;
 update public.league_clubs set reserved_transfer_budget=reserved_transfer_budget+p_amount where id=p_buyer_club_id;
 if v_ai then
   v_threshold:=v_value*(1.20+greatest(0,v_overall-82)*0.025+case when v_age<=23 then 0.10 else 0 end);
   if p_amount>=v_threshold then perform public.settle_transfer(v_offer);v_status:='ACCEPTED';
   elsif p_amount>=v_value*1.2 then v_counter:=round(v_threshold/100000)*100000;update public.transfer_offers set status='COUNTERED',counter_amount=v_counter where id=v_offer;v_status:='COUNTERED';
   else update public.transfer_offers set status='REJECTED',responded_at=timezone('utc',now())where id=v_offer;update public.league_clubs set reserved_transfer_budget=reserved_transfer_budget-p_amount where id=p_buyer_club_id;v_status:='REJECTED';end if;
 end if;return query select v_offer,v_status,v_counter;
end $$;

create function public.respond_transfer_offer(p_user_id uuid,p_offer_id uuid,p_decision text,p_counter numeric default null)
returns public.transfer_offer_status language plpgsql security definer set search_path='' as $$
declare v public.transfer_offers%rowtype;
begin select o.* into v from public.transfer_offers o join public.league_clubs lc on lc.id=o.seller_club_id where o.id=p_offer_id and lc.manager_user_id=p_user_id for update;if not found then raise exception 'OFFER_NOT_OWNED';end if;
 if v.status<>'PENDING' or v.expires_at<=timezone('utc',now())then raise exception 'OFFER_NOT_ACTIVE';end if;
 if p_decision='ACCEPT' then perform public.settle_transfer(v.id);return 'ACCEPTED';
 elsif p_decision='REJECT' then update public.transfer_offers set status='REJECTED',responded_at=timezone('utc',now())where id=v.id;update public.league_clubs set reserved_transfer_budget=greatest(0,reserved_transfer_budget-v.amount)where id=v.buyer_club_id;return 'REJECTED';
 elsif p_decision='COUNTER' and p_counter>v.amount then update public.transfer_offers set status='COUNTERED',counter_amount=p_counter,responded_at=timezone('utc',now())where id=v.id;return 'COUNTERED';end if;raise exception 'INVALID_DECISION';end $$;

insert into public.global_market_listings(club_player_id,seller_club_id,asking_price,demand_multiplier,rarity_multiplier)
select cp.id,cp.league_club_id,round((p.market_value*(1.40+greatest(0,pa.overall-80)*0.03+case when p.age<=23 then 0.10 else 0 end))/100000)*100000,1+(pa.overall-70)/200.0,case when pa.overall>=86 then 1.2 else 1 end
from public.club_players cp join public.league_clubs lc on lc.id=cp.league_club_id join public.players p on p.id=cp.player_id join public.player_attributes pa on pa.player_id=p.id
where lc.manager_type='AI' and pa.overall between 76 and 88 and (select count(*) from public.club_players x where x.league_club_id=lc.id)>20
order by pa.overall desc,p.age asc limit 80;

alter table public.transfer_offers enable row level security;alter table public.global_market_listings enable row level security;
revoke all on table public.transfer_offers,public.global_market_listings from anon,authenticated;
revoke all on function public.settle_transfer(uuid),public.create_transfer_offer(uuid,uuid,uuid,numeric),public.respond_transfer_offer(uuid,uuid,text,numeric),public.accept_counter_offer(uuid,uuid),public.expire_transfer_offers() from public,anon,authenticated;
grant execute on function public.create_transfer_offer(uuid,uuid,uuid,numeric),public.respond_transfer_offer(uuid,uuid,text,numeric),public.accept_counter_offer(uuid,uuid),public.expire_transfer_offers() to service_role;
commit;
