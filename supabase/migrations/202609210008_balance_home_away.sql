begin;

create or replace function public.generate_league_fixtures(p_league_instance_id uuid,p_start_date date default null)
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_clubs uuid[]; v_count integer; v_round integer; v_pair integer;
  v_home uuid; v_away uuid; v_left uuid; v_right uuid; v_inserted integer:=0;
  v_tz text; v_first time; v_second time; v_date date; v_time time; v_return_index integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_league_instance_id::text));
  select array_agg(lc.id order by c.name),count(*) into v_clubs,v_count
  from public.league_clubs lc join public.clubs c on c.id=lc.club_id
  where lc.league_instance_id=p_league_instance_id;
  if v_count<2 or mod(v_count,2)<>0 then raise exception 'INVALID_LEAGUE_CLUB_COUNT'; end if;
  select timezone,first_match_time,second_match_time into v_tz,v_first,v_second from public.game_schedule_config where id=true;
  if p_start_date is null then p_start_date=(timezone(v_tz,now()))::date+1; end if;
  for v_round in 0..v_count-2 loop
    v_date:=p_start_date+(v_round/2); v_time:=case when mod(v_round,2)=0 then v_first else v_second end;
    for v_pair in 0..(v_count/2)-1 loop
      if v_pair=0 then v_left:=v_clubs[v_count];v_right:=v_clubs[mod(v_round,v_count-1)+1];
      else v_left:=v_clubs[mod(v_round+v_pair,v_count-1)+1];v_right:=v_clubs[mod(v_round-v_pair+(v_count-1)*2,v_count-1)+1];end if;
      if mod(v_round,2)=1 then v_home:=v_right;v_away:=v_left;else v_home:=v_left;v_away:=v_right;end if;
      insert into public.fixtures(league_instance_id,round_number,home_club_id,away_club_id,scheduled_at)
      values(p_league_instance_id,v_round+1,v_home,v_away,make_timestamptz(extract(year from v_date)::int,extract(month from v_date)::int,extract(day from v_date)::int,extract(hour from v_time)::int,extract(minute from v_time)::int,0,v_tz));
      v_inserted:=v_inserted+1; v_return_index:=v_round+v_count-1;
      insert into public.fixtures(league_instance_id,round_number,home_club_id,away_club_id,scheduled_at)
      values(p_league_instance_id,v_round+v_count,v_away,v_home,make_timestamptz(
        extract(year from (p_start_date+(v_return_index/2)))::int,extract(month from (p_start_date+(v_return_index/2)))::int,
        extract(day from (p_start_date+(v_return_index/2)))::int,extract(hour from (case when mod(v_return_index,2)=0 then v_first else v_second end))::int,
        extract(minute from (case when mod(v_return_index,2)=0 then v_first else v_second end))::int,0,v_tz));
      v_inserted:=v_inserted+1;
    end loop;
  end loop;
  return v_inserted;
end $$;

delete from public.fixtures where status='SCHEDULED';
select public.generate_league_fixtures(id,null) from public.league_instances where status='ACTIVE';
commit;
