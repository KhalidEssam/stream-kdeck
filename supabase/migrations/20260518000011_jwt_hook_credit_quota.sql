CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid;
  v_license        record;
  v_subscription   record;
  v_licensed       boolean := false;
  v_ai_pro         boolean := false;
  v_credits        int     := 0;
  v_credit_quota   int     := 0;
  v_desktop_quota  int;
  v_ai_pro_quota   int;
  claims           jsonb;
BEGIN
  v_user_id := (event ->> 'user_id')::uuid;
  claims    := event -> 'claims';

  -- Read configured quotas from platform_config (fall back to coded defaults)
  SELECT COALESCE(
    (SELECT value::int FROM public.platform_config WHERE key = 'desktop_monthly_ai_credits'),
    50
  ) INTO v_desktop_quota;

  SELECT COALESCE(
    (SELECT value::int FROM public.platform_config WHERE key = 'ai_pro_monthly_credits'),
    500
  ) INTO v_ai_pro_quota;

  SELECT monthly_ai_credits, credits_used
  INTO v_license
  FROM public.licenses
  WHERE user_id = v_user_id AND status = 'active'
  LIMIT 1;

  IF v_license IS NOT NULL THEN
    v_licensed      := true;
    v_credits       := v_desktop_quota - v_license.credits_used;
    v_credit_quota  := v_desktop_quota;
  END IF;

  SELECT credits_remaining
  INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = v_user_id AND status = 'active'
  LIMIT 1;

  IF v_subscription IS NOT NULL THEN
    v_ai_pro        := true;
    v_credits       := v_subscription.credits_remaining;
    v_credit_quota  := v_ai_pro_quota;
  END IF;

  claims := jsonb_set(claims, '{licensed}',         to_jsonb(v_licensed));
  claims := jsonb_set(claims, '{ai_pro}',            to_jsonb(v_ai_pro));
  claims := jsonb_set(claims, '{credits_remaining}', to_jsonb(GREATEST(v_credits, 0)));
  claims := jsonb_set(claims, '{credit_quota}',      to_jsonb(v_credit_quota));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
