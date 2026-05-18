CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid;
  v_license       record;
  v_subscription  record;
  v_licensed      boolean := false;
  v_ai_pro        boolean := false;
  v_credits       int     := 0;
  claims          jsonb;
BEGIN
  v_user_id := (event ->> 'user_id')::uuid;
  claims    := event -> 'claims';

  SELECT monthly_ai_credits, credits_used
  INTO v_license
  FROM public.licenses
  WHERE user_id = v_user_id AND status = 'active'
  LIMIT 1;

  IF v_license IS NOT NULL THEN
    v_licensed := true;
    v_credits  := v_license.monthly_ai_credits - v_license.credits_used;
  END IF;

  SELECT credits_remaining
  INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = v_user_id AND status = 'active'
  LIMIT 1;

  IF v_subscription IS NOT NULL THEN
    v_ai_pro  := true;
    v_credits := v_subscription.credits_remaining;
  END IF;

  claims := jsonb_set(claims, '{licensed}',         to_jsonb(v_licensed));
  claims := jsonb_set(claims, '{ai_pro}',            to_jsonb(v_ai_pro));
  claims := jsonb_set(claims, '{credits_remaining}', to_jsonb(v_credits));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
