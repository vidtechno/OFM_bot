begin;

create temporary table reminder_audit_fixture on commit drop as
select f.id,f.home_club_id,f.away_club_id
from public.fixtures f join public.league_instances li on li.id=f.league_instance_id
where f.status='SCHEDULED' and li.status='ACTIVE'
  and exists(select 1 from public.league_clubs lc where lc.id in(f.home_club_id,f.away_club_id) and lc.manager_type='HUMAN')
order by f.scheduled_at limit 1;

update public.fixtures set scheduled_at=timezone('utc',now())+interval '44 minutes'
where id=(select id from reminder_audit_fixture);

insert into public.match_reminders(user_id,fixture_id,telegram_id,league_club_id,reminder_type)
select lc.manager_user_id,f.id,u.telegram_id,lc.id,'45_MIN'
from reminder_audit_fixture f join public.league_clubs lc on lc.id in(f.home_club_id,f.away_club_id)
join public.users u on u.id=lc.manager_user_id
where lc.manager_type='HUMAN'
on conflict(user_id,fixture_id,reminder_type) do nothing;

insert into public.match_reminders(user_id,fixture_id,telegram_id,league_club_id,reminder_type)
select lc.manager_user_id,f.id,u.telegram_id,lc.id,'45_MIN'
from reminder_audit_fixture f join public.league_clubs lc on lc.id in(f.home_club_id,f.away_club_id)
join public.users u on u.id=lc.manager_user_id
where lc.manager_type='HUMAN'
on conflict(user_id,fixture_id,reminder_type) do nothing;

select count(*) as deduplicated_reminders,
       min(extract(epoch from ((select scheduled_at from public.fixtures where id=(select id from reminder_audit_fixture))-timezone('utc',now())))/60)::int as minutes_until_match
from public.match_reminders where fixture_id=(select id from reminder_audit_fixture);

rollback;
