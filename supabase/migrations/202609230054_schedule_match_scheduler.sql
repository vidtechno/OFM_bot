begin;

do $$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname='match_scheduler' limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select cron.schedule(
  'match_scheduler',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://fcwonehtpuyzdyuxcvre.supabase.co/functions/v1/match-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name='match_scheduler_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);

commit;
