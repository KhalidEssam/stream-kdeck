CREATE TABLE IF NOT EXISTS public.platform_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_platform_config_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_platform_config_updated_at ON public.platform_config;
CREATE TRIGGER set_platform_config_updated_at
  BEFORE UPDATE ON public.platform_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_platform_config_updated_at();

INSERT INTO public.platform_config (key, value)
VALUES
  ('license_amount_cents', '1900'),
  ('ai_pro_monthly_amount_cents', '800'),
  ('ai_pro_yearly_amount_cents', '5900'),
  ('desktop_monthly_ai_credits', '50'),
  ('ai_pro_monthly_credits', '500'),
  ('free_tier_credits', '0')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS plan_id text NOT NULL DEFAULT 'desktop_license';

UPDATE public.licenses
SET plan_id = 'desktop_license'
WHERE plan_id IS NULL OR plan_id = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'licenses_plan_id_check'
      AND conrelid = 'public.licenses'::regclass
  ) THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_plan_id_check
      CHECK (plan_id IN ('desktop_license', 'ai_pro_monthly', 'ai_pro_yearly'));
  END IF;
END;
$$;
