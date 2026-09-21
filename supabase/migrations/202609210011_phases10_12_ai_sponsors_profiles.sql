begin;

create table public.ai_club_strategies(
 league_club_id uuid primary key references public.league_clubs(id) on delete cascade,strategy jsonb not null,
 source text not null default 'RULE_BASED' check(source in('RULE_BASED','OPENAI')),generated_at timestamptz not null default timezone('utc',now()),expires_at timestamptz not null default timezone('utc',now())+interval '24 hours',
 check(jsonb_typeof(strategy)='object')
);
insert into public.ai_club_strategies(league_club_id,strategy)
select id,jsonb_build_object('priority_positions',jsonb_build_array('ST','CB'),'sell_candidates','[]'::jsonb,'preferred_style','balanced','transfer_risk','medium')from public.league_clubs where manager_type='AI';

create table public.sponsors(
 id uuid primary key default gen_random_uuid(),name text not null unique,payment_per_match numeric(16,2) not null check(payment_per_match>=0),
 required_channel_id bigint,required_channel_username text,join_url text,is_active boolean not null default true,created_at timestamptz not null default timezone('utc',now())
);
insert into public.sponsors(name,payment_per_match)values('OFM Starter',500000);
insert into public.sponsors(name,payment_per_match,is_active)values('OFM Pro',1200000,false),('OFM Elite',1800000,false);

create table public.sponsor_contracts(
 league_club_id uuid primary key references public.league_clubs(id) on delete cascade,sponsor_id uuid not null references public.sponsors(id),
 is_eligible boolean not null default false,eligibility_checked_at timestamptz,accepted_at timestamptz not null default timezone('utc',now()),updated_at timestamptz not null default timezone('utc',now())
);
create trigger sponsor_contracts_set_updated_at before update on public.sponsor_contracts for each row execute function public.set_updated_at();

insert into public.manager_profiles(user_id)select id from public.users on conflict do nothing;

create table public.league_group_links(
 league_instance_id uuid primary key references public.league_instances(id) on delete cascade,telegram_chat_id bigint not null unique,telegram_title text,
 linked_by_user_id uuid not null references public.users(id),is_active boolean not null default true,linked_at timestamptz not null default timezone('utc',now())
);

create function public.accept_sponsor(p_user_id uuid,p_league_club_id uuid,p_sponsor_id uuid)returns void language plpgsql security definer set search_path='' as $$
declare v_required bigint;
begin if not exists(select 1 from public.league_clubs where id=p_league_club_id and manager_user_id=p_user_id)then raise exception 'CLUB_NOT_OWNED';end if;
 select required_channel_id into v_required from public.sponsors where id=p_sponsor_id and is_active;if not found then raise exception 'SPONSOR_NOT_AVAILABLE';end if;
 insert into public.sponsor_contracts(league_club_id,sponsor_id,is_eligible,eligibility_checked_at)values(p_league_club_id,p_sponsor_id,v_required is null,case when v_required is null then timezone('utc',now())end)
 on conflict(league_club_id)do update set sponsor_id=excluded.sponsor_id,is_eligible=excluded.is_eligible,eligibility_checked_at=excluded.eligibility_checked_at;end$$;

create function public.update_sponsor_eligibility(p_user_id uuid,p_league_club_id uuid,p_eligible boolean)returns void language plpgsql security definer set search_path='' as $$
begin if not exists(select 1 from public.league_clubs where id=p_league_club_id and manager_user_id=p_user_id)then raise exception 'CLUB_NOT_OWNED';end if;
 update public.sponsor_contracts set is_eligible=p_eligible,eligibility_checked_at=timezone('utc',now())where league_club_id=p_league_club_id;end$$;

create function public.on_match_career_and_sponsor()returns trigger language plpgsql security definer set search_path='' as $$
declare h_user uuid;a_user uuid;h_rating int;a_rating int;h_expected numeric;h_score numeric;a_score numeric;v_payment numeric;v_balance numeric;v_sponsor uuid;v_club uuid;
begin
 select manager_user_id into h_user from public.league_clubs where id=new.home_club_id;select manager_user_id into a_user from public.league_clubs where id=new.away_club_id;
 if h_user is not null then insert into public.manager_profiles(user_id)values(h_user)on conflict do nothing;end if;if a_user is not null then insert into public.manager_profiles(user_id)values(a_user)on conflict do nothing;end if;
 if h_user is not null and a_user is not null then select manager_rating into h_rating from public.manager_profiles where user_id=h_user for update;select manager_rating into a_rating from public.manager_profiles where user_id=a_user for update;
  h_expected:=1/(1+power(10,(a_rating-h_rating)/400.0));h_score:=case when new.home_goals>new.away_goals then 1 when new.home_goals=new.away_goals then .5 else 0 end;a_score:=1-h_score;
  update public.manager_profiles set manager_rating=round(h_rating+32*(h_score-h_expected)),matches=matches+1,wins=wins+(h_score=1)::int,draws=draws+(h_score=.5)::int,losses=losses+(h_score=0)::int,updated_at=timezone('utc',now())where user_id=h_user;
  update public.manager_profiles set manager_rating=round(a_rating+32*(a_score-(1-h_expected))),matches=matches+1,wins=wins+(a_score=1)::int,draws=draws+(a_score=.5)::int,losses=losses+(a_score=0)::int,updated_at=timezone('utc',now())where user_id=a_user;
 elsif h_user is not null then update public.manager_profiles set matches=matches+1,wins=wins+(new.home_goals>new.away_goals)::int,draws=draws+(new.home_goals=new.away_goals)::int,losses=losses+(new.home_goals<new.away_goals)::int where user_id=h_user;
 elsif a_user is not null then update public.manager_profiles set matches=matches+1,wins=wins+(new.away_goals>new.home_goals)::int,draws=draws+(new.home_goals=new.away_goals)::int,losses=losses+(new.away_goals<new.home_goals)::int where user_id=a_user;end if;
 for v_club,v_sponsor,v_payment in select sc.league_club_id,sc.sponsor_id,s.payment_per_match from public.sponsor_contracts sc join public.sponsors s on s.id=sc.sponsor_id where sc.league_club_id in(new.home_club_id,new.away_club_id)and sc.is_eligible and s.is_active loop
  update public.league_clubs set cash_balance=cash_balance+v_payment where id=v_club returning cash_balance into v_balance;
  insert into public.finance_transactions(league_club_id,match_id,kind,amount,balance_after,description)values(v_club,new.id,'SPONSOR',v_payment,v_balance,'Sponsor payment');
 end loop;return new;end$$;
create trigger matches_career_sponsor after insert on public.matches for each row execute function public.on_match_career_and_sponsor();

create function public.on_transfer_profile()returns trigger language plpgsql security definer set search_path='' as $$declare v_user uuid;begin if new.kind<>'TRANSFER'then return new;end if;select manager_user_id into v_user from public.league_clubs where id=new.league_club_id;if v_user is null then return new;end if;
 insert into public.manager_profiles(user_id)values(v_user)on conflict do nothing;update public.manager_profiles set total_transfer_spend=total_transfer_spend+case when new.amount<0 then -new.amount else 0 end,total_transfer_income=total_transfer_income+case when new.amount>0 then new.amount else 0 end,biggest_transfer=greatest(biggest_transfer,abs(new.amount)),updated_at=timezone('utc',now())where user_id=v_user;return new;end$$;
create trigger finance_transfer_profile after insert on public.finance_transactions for each row execute function public.on_transfer_profile();

alter table public.ai_club_strategies enable row level security;alter table public.sponsors enable row level security;alter table public.sponsor_contracts enable row level security;alter table public.manager_profiles enable row level security;alter table public.league_group_links enable row level security;
revoke all on table public.ai_club_strategies,public.sponsors,public.sponsor_contracts,public.manager_profiles,public.league_group_links from anon,authenticated;
revoke all on function public.accept_sponsor(uuid,uuid,uuid),public.update_sponsor_eligibility(uuid,uuid,boolean)from public,anon,authenticated;
grant execute on function public.accept_sponsor(uuid,uuid,uuid),public.update_sponsor_eligibility(uuid,uuid,boolean)to service_role;
commit;
