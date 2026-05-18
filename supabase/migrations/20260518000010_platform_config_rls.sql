-- platform_config rows (prices, credit limits) are intentionally public-readable
-- because the same values are shown on the landing page. Only the service-role
-- key (used server-side only) can write rows; anon clients get SELECT only.

ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_config_public_read"
  ON public.platform_config
  FOR SELECT
  USING (true);
