begin;

create temporary table launch_audit_target on commit drop as
select id from public.league_instances
where status='ACTIVE' and exists(
  select 1 from public.league_clubs where league_instance_id=league_instances.id and manager_user_id is not null
)
order by created_at limit 1;

update public.league_instances set status='COMPLETED'
where id=(select id from launch_audit_target);

select public.archive_completed_league((select id from launch_audit_target)) as first_archive;
select public.archive_completed_league((select id from launch_audit_target)) as duplicate_archive;

select count(*) as history_rows,
       count(*) filter(where champion) as champions,
       count(*) filter(where runner_up) as runners_up,
       count(*) filter(where third_place) as third_places
from public.manager_season_history
where league_instance_id=(select id from launch_audit_target);

rollback;
