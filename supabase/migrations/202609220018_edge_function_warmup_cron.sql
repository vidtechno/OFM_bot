-- 202609220018_edge_function_warmup_cron.sql
-- Edge Function warmup ping schedule via pg_cron and pg_net.
--
-- IMPORTANT NOTICE ON SERVERLESS WARMUP:
-- A periodic warmup ping (GET /?warmup=1) significantly mitigates cold start latency
-- by ensuring that at least one Deno isolate is initialized and cached in memory.
-- However, this is NOT a 100% guarantee of zero cold starts:
-- 1. Serverless runtimes (like Deno Deploy on Supabase Edge Functions) scale dynamically
--    and may spin up fresh isolates for concurrent requests.
-- 2. Cloud providers may recycle idle isolates during maintenance or region balancing.
-- 3. New code deployments immediately discard existing warm isolates.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Unschedule previous job if exists to remain idempotent
do $$
begin
  if exists (select 1 from cron.job where jobname = 'telegram_webhook_warmup') then
    perform cron.unschedule('telegram_webhook_warmup');
  end if;
end $$;

-- Run every 10 minutes: 6 pings/hour * 24h * 30d = 4,320 invocations/month
-- Well below Supabase free tier allowance of 500,000 Edge Function invocations.
select cron.schedule(
  'telegram_webhook_warmup',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := 'https://ogwosvgwtxzemrhaiyfj.supabase.co/functions/v1/telegram-webhook?warmup=1&forceFunctionRegion=ap-southeast-2',
    headers := jsonb_build_object('User-Agent', 'Supabase-Warmup-Cron/1.0')
  );
  $$
);
