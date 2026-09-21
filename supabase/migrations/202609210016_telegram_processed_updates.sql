-- ============================================================================
-- Phase 14: Telegram Updates Idempotency & Webhook Deduplication
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.telegram_processed_updates (
  update_id BIGINT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_telegram_processed_updates_received_at 
  ON public.telegram_processed_updates (received_at DESC);

-- Enable RLS
ALTER TABLE public.telegram_processed_updates ENABLE ROW LEVEL SECURITY;

-- Only service_role can access telegram_processed_updates
DROP POLICY IF EXISTS "Service role manages telegram updates" ON public.telegram_processed_updates;
CREATE POLICY "Service role manages telegram updates" 
  ON public.telegram_processed_updates 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Maintenance function to delete old processed updates (e.g., older than 7 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_telegram_updates(days_to_keep INTEGER DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.telegram_processed_updates
  WHERE received_at < (now() - (days_to_keep || ' days')::INTERVAL);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
