CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paymob_subscription_id  text UNIQUE,
  paymob_order_id         text UNIQUE,
  plan                    text NOT NULL DEFAULT 'ai_pro'
                            CHECK (plan IN ('ai_pro')),
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'cancelled', 'past_due')),
  credits_remaining       int  NOT NULL DEFAULT 500,
  credits_reset_at        timestamptz,
  current_period_end      timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.decrement_subscription_credits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.subscriptions
  SET credits_remaining = GREATEST(0, credits_remaining - 1)
  WHERE user_id = auth.uid()
    AND status = 'active';
$$;
