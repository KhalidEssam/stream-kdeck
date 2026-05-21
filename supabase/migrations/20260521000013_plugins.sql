-- Plugin catalog (public read, written by service-role only)
CREATE TABLE IF NOT EXISTS public.integration_plugins (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   text UNIQUE NOT NULL,
  name                   text NOT NULL,
  description            text,
  category               text NOT NULL,
  icon                   text NOT NULL,
  color                  text,
  publisher              text NOT NULL DEFAULT 'KDeck',
  version                text NOT NULL DEFAULT '1.0.0',
  status                 text CHECK (status IN ('draft','internal','beta','published','deprecated','disabled')),
  min_agent_capability   int NOT NULL DEFAULT 1,
  min_mobile_capability  int NOT NULL DEFAULT 1,
  supported_platforms    text[] NOT NULL DEFAULT ARRAY['win32','darwin'],
  requires_connector     boolean NOT NULL DEFAULT false,
  connector_type         text CHECK (connector_type IN ('oauth2','api-key','local-websocket','local-http','mdns-discovery','none')),
  sort_order             int NOT NULL DEFAULT 0,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

-- Tools per plugin (public read, written by service-role only)
CREATE TABLE IF NOT EXISTS public.integration_tools (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id             uuid NOT NULL REFERENCES public.integration_plugins(id) ON DELETE CASCADE,
  slug                  text NOT NULL,
  name                  text NOT NULL,
  description           text,
  icon                  text,
  color                 text,
  action_id             text NOT NULL,
  execution_mode        text NOT NULL CHECK (execution_mode IN ('agent','mobile','cloud')),
  params_schema         jsonb NOT NULL DEFAULT '{}',
  result_schema         jsonb NOT NULL DEFAULT '{}',
  supports_workflows    boolean NOT NULL DEFAULT true,
  supports_state        boolean NOT NULL DEFAULT false,
  requires_confirmation boolean NOT NULL DEFAULT false,
  min_agent_capability  int NOT NULL DEFAULT 1,
  sort_order            int NOT NULL DEFAULT 0,
  status                text NOT NULL CHECK (status IN ('draft','internal','beta','published','deprecated','disabled')),
  UNIQUE (plugin_id, slug)
);

-- User install state with soft-delete (owner-only)
CREATE TABLE IF NOT EXISTS public.user_plugin_installs (
  user_id      uuid NOT NULL REFERENCES auth.users(id),
  plugin_id    uuid NOT NULL REFERENCES public.integration_plugins(id),
  status       text NOT NULL CHECK (status IN ('installed','disabled','uninstalled')),
  installed_at timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  deleted_at   timestamptz,
  PRIMARY KEY (user_id, plugin_id)
);

-- OAuth / API-key connections (account-wide, owner-only)
CREATE TABLE IF NOT EXISTS public.user_cloud_connections (
  user_id      uuid NOT NULL REFERENCES auth.users(id),
  plugin_id    uuid NOT NULL REFERENCES public.integration_plugins(id),
  status       text NOT NULL CHECK (status IN ('not_configured','connected','error','expired')),
  display_name text,
  metadata     jsonb NOT NULL DEFAULT '{}',
  updated_at   timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, plugin_id)
);

-- Local connections per-device (e.g. OBS WebSocket), owner-only
CREATE TABLE IF NOT EXISTS public.user_device_connections (
  user_id      uuid NOT NULL REFERENCES auth.users(id),
  device_id    text NOT NULL,
  plugin_id    uuid NOT NULL REFERENCES public.integration_plugins(id),
  status       text NOT NULL CHECK (status IN ('not_configured','connected','error','expired')),
  display_name text,
  metadata     jsonb NOT NULL DEFAULT '{}',
  updated_at   timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, device_id, plugin_id)
);

-- Enable RLS on all five tables
ALTER TABLE public.integration_plugins      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_tools        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_plugin_installs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cloud_connections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_device_connections  ENABLE ROW LEVEL SECURITY;

-- Public catalog read (anon key is safe — these are not user data)
-- INSERT/UPDATE/DELETE require the service-role key (server-side only).
DO $$ BEGIN
  CREATE POLICY "integration_plugins_public_read"
    ON public.integration_plugins
    FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "integration_tools_public_read"
    ON public.integration_tools
    FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Owner-only policies for user tables
DO $$ BEGIN
  CREATE POLICY "user_plugin_installs_owner"
    ON public.user_plugin_installs
    FOR ALL
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "user_cloud_connections_owner"
    ON public.user_cloud_connections
    FOR ALL
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "user_device_connections_owner"
    ON public.user_device_connections
    FOR ALL
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS integration_tools_plugin_id_idx
  ON public.integration_tools(plugin_id);

CREATE INDEX IF NOT EXISTS user_plugin_installs_user_id_active_idx
  ON public.user_plugin_installs(user_id)
  WHERE deleted_at IS NULL;
