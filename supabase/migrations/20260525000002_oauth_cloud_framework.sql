-- OAuth/cloud plugin framework foundation.
-- Secret tables are intentionally service-role only. User-facing connection
-- state stays in public.user_cloud_connections.

CREATE TABLE IF NOT EXISTS public.integration_oauth_states (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash               text UNIQUE NOT NULL,
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plugin_id                uuid NOT NULL REFERENCES public.integration_plugins(id) ON DELETE CASCADE,
  provider                 text NOT NULL,
  requested_scopes         text[] NOT NULL DEFAULT array[]::text[],
  code_verifier_ciphertext text,
  redirect_uri             text NOT NULL,
  return_url               text,
  device_id                text,
  expires_at               timestamptz NOT NULL,
  consumed_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_oauth_states_expires_idx
  ON public.integration_oauth_states(expires_at);

ALTER TABLE public.integration_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_cloud_connection_tokens (
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plugin_id                uuid NOT NULL REFERENCES public.integration_plugins(id) ON DELETE CASCADE,
  provider                 text NOT NULL,
  provider_account_id      text,
  provider_account_name    text,
  token_type               text,
  scopes                   text[] NOT NULL DEFAULT array[]::text[],
  access_token_ciphertext  text NOT NULL,
  refresh_token_ciphertext text,
  expires_at               timestamptz,
  refresh_token_expires_at timestamptz,
  refresh_lock_until       timestamptz,
  last_refreshed_at        timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plugin_id)
);

CREATE INDEX IF NOT EXISTS user_cloud_connection_tokens_user_plugin_idx
  ON public.user_cloud_connection_tokens(user_id, plugin_id);

ALTER TABLE public.user_cloud_connection_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.integration_action_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plugin_id           uuid NOT NULL REFERENCES public.integration_plugins(id) ON DELETE CASCADE,
  tool_id             uuid REFERENCES public.integration_tools(id) ON DELETE SET NULL,
  action_id           text NOT NULL,
  execution_mode      text NOT NULL DEFAULT 'cloud',
  status              text NOT NULL CHECK (status IN ('success', 'error')),
  provider_request_id text,
  safe_result         jsonb NOT NULL DEFAULT '{}',
  error_code          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_action_runs_user_plugin_idx
  ON public.integration_action_runs(user_id, plugin_id, created_at DESC);

ALTER TABLE public.integration_action_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_integration_oauth_state(p_state_hash text)
RETURNS public.integration_oauth_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.integration_oauth_states;
BEGIN
  UPDATE public.integration_oauth_states
  SET consumed_at = now()
  WHERE state_hash = p_state_hash
    AND expires_at > now()
    AND consumed_at IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'invalid_or_expired_state';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_token_refresh_lock(
  p_user_id uuid,
  p_plugin_id uuid,
  p_lock_seconds int DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.user_cloud_connection_tokens
  SET
    refresh_lock_until = now() + (p_lock_seconds || ' seconds')::interval,
    updated_at = now()
  WHERE user_id = p_user_id
    AND plugin_id = p_plugin_id
    AND (refresh_lock_until IS NULL OR refresh_lock_until < now());

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_integration_oauth_state(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_integration_oauth_state(text) FROM anon;
REVOKE ALL ON FUNCTION public.consume_integration_oauth_state(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_integration_oauth_state(text) TO service_role;

REVOKE ALL ON FUNCTION public.claim_token_refresh_lock(uuid, uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_token_refresh_lock(uuid, uuid, int) FROM anon;
REVOKE ALL ON FUNCTION public.claim_token_refresh_lock(uuid, uuid, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_token_refresh_lock(uuid, uuid, int) TO service_role;
