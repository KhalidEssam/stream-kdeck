CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_at    timestamptz NOT NULL DEFAULT now(),
  tokens_in  int,
  tokens_out int,
  provider   text
);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_usage"
  ON public.ai_usage_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_usage"
  ON public.ai_usage_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX ai_usage_log_user_used_at ON public.ai_usage_log(user_id, used_at DESC);
