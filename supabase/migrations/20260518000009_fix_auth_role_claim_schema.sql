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
  v_staff_role    text;
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
    v_credits  := GREATEST(0, v_license.monthly_ai_credits - v_license.credits_used);
  END IF;

  SELECT credits_remaining
  INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = v_user_id AND status = 'active'
  LIMIT 1;

  IF v_subscription IS NOT NULL THEN
    v_ai_pro  := true;
    v_credits := GREATEST(0, v_subscription.credits_remaining);
  END IF;

  SELECT raw_app_meta_data ->> 'role'
  INTO v_staff_role
  FROM auth.users
  WHERE id = v_user_id;

  IF v_staff_role NOT IN ('admin', 'owner') THEN
    v_staff_role := NULL;
  END IF;

  claims := jsonb_set(claims, '{licensed}',         to_jsonb(v_licensed), true);
  claims := jsonb_set(claims, '{ai_pro}',            to_jsonb(v_ai_pro), true);
  claims := jsonb_set(claims, '{credits_remaining}', to_jsonb(v_credits), true);
  claims := jsonb_set(
    claims,
    '{app_metadata}',
    COALESCE(claims -> 'app_metadata', '{}'::jsonb),
    true
  );

  -- Supabase requires the root "role" claim, normally "authenticated".
  -- Store Control Surface staff authorization separately.
  IF v_staff_role IS NULL THEN
    claims := claims - 'staff_role';
    claims := jsonb_set(claims, '{app_metadata}', (claims -> 'app_metadata') - 'role', true);
  ELSE
    claims := jsonb_set(claims, '{staff_role}', to_jsonb(v_staff_role), true);
    claims := jsonb_set(claims, '{app_metadata,role}', to_jsonb(v_staff_role), true);
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'Adds license, quota, and staff authorization claims while preserving Supabase required root role claim. To create staff manually: update auth.users set raw_app_meta_data = raw_app_meta_data || ''{"role":"owner"}''::jsonb where email = ''owner@example.com'';';
