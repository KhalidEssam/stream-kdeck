-- Re-schedule monthly credit resets after platform_config exists. This preserves
-- per-license credit limits while letting AI Pro credits follow owner config.

DO $cron_setup$
BEGIN
  BEGIN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
  EXCEPTION
    WHEN insufficient_privilege OR undefined_file THEN
      RAISE NOTICE 'pg_cron extension is unavailable; skipping credit reset scheduling.';
  END;

  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE 'cron schema is unavailable; skipping credit reset scheduling.';
    RETURN;
  END IF;

  EXECUTE $sql$
    SELECT cron.unschedule('monthly-license-credit-reset')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-license-credit-reset')
  $sql$;

  EXECUTE $sql$
    SELECT cron.unschedule('monthly-subscription-credit-reset')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-subscription-credit-reset')
  $sql$;

  EXECUTE $sql$
    SELECT cron.schedule(
      'monthly-license-credit-reset',
      '0 0 1 * *',
      $job$
        UPDATE public.licenses
        SET
          credits_used     = 0,
          credits_reset_at = date_trunc('month', now()) + interval '1 month'
        WHERE status = 'active'
          AND (credits_reset_at IS NULL OR credits_reset_at <= now());
      $job$
    )
  $sql$;

  EXECUTE $sql$
    SELECT cron.schedule(
      'monthly-subscription-credit-reset',
      '0 0 1 * *',
      $job$
        UPDATE public.subscriptions
        SET
          credits_remaining = COALESCE(
            (
              SELECT NULLIF(value, '')::int
              FROM public.platform_config
              WHERE key = 'ai_pro_monthly_credits'
            ),
            500
          ),
          credits_reset_at  = date_trunc('month', now()) + interval '1 month'
        WHERE status = 'active'
          AND (credits_reset_at IS NULL OR credits_reset_at <= now());
      $job$
    )
  $sql$;
END;
$cron_setup$;
