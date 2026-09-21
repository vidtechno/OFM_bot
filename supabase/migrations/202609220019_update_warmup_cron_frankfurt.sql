-- 202609220019_update_warmup_cron_frankfurt.sql
-- Update telegram_webhook_warmup cron job to point to Frankfurt project (fcwonehtpuyzdyuxcvre) and eu-central-1 region.

-- Unschedule previous job if exists to remain idempotent
do $$
begin
  if exists (select 1 from cron.job where jobname = 'telegram_webhook_warmup') then
    perform cron.unschedule('telegram_webhook_warmup');
  end if;
end $$;

-- Re-schedule with new Frankfurt URL
select cron.schedule(
  'telegram_webhook_warmup',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := 'https://fcwonehtpuyzdyuxcvre.supabase.co/functions/v1/telegram-webhook?warmup=1&forceFunctionRegion=eu-central-1',
    headers := jsonb_build_object('User-Agent', 'Supabase-Warmup-Cron/1.0')
  );
  $$
);
