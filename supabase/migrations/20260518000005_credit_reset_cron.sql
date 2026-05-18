-- Run at midnight UTC on the 1st of every month

SELECT cron.schedule(
  'monthly-license-credit-reset',
  '0 0 1 * *',
  $$
    UPDATE public.licenses
    SET
      credits_used     = 0,
      credits_reset_at = date_trunc('month', now()) + interval '1 month'
    WHERE status = 'active'
      AND (credits_reset_at IS NULL OR credits_reset_at <= now());
  $$
);

SELECT cron.schedule(
  'monthly-subscription-credit-reset',
  '0 0 1 * *',
  $$
    UPDATE public.subscriptions
    SET
      credits_remaining = 500,
      credits_reset_at  = date_trunc('month', now()) + interval '1 month'
    WHERE status = 'active'
      AND (credits_reset_at IS NULL OR credits_reset_at <= now());
  $$
);
