CREATE TABLE IF NOT EXISTS public.licenses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash           text UNIQUE NOT NULL,
  status             text NOT NULL DEFAULT 'unused'
                       CHECK (status IN ('unused', 'active', 'revoked')),
  monthly_ai_credits int  NOT NULL DEFAULT 50,
  credits_used       int  NOT NULL DEFAULT 0,
  credits_reset_at   timestamptz,
  paymob_order_id    text UNIQUE,
  device_fingerprint text,
  device_name        text,
  activated_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_license"
  ON public.licenses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.increment_license_credits_used()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.licenses
  SET credits_used = credits_used + 1
  WHERE user_id = auth.uid()
    AND status = 'active'
    AND credits_used < monthly_ai_credits;
$$;
