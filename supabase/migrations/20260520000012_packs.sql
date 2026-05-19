CREATE TABLE IF NOT EXISTS public.packs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  icon        text NOT NULL,
  color       text,
  "order"     int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.pack_tools (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id     uuid NOT NULL REFERENCES public.packs(id) ON DELETE CASCADE,
  label       text NOT NULL,
  prompt      text NOT NULL,
  output_mode text NOT NULL CHECK (output_mode IN ('clipboard','autopaste','viewer')),
  source      text NOT NULL DEFAULT 'clipboard'
                CHECK (source IN ('clipboard','active_window','shell')),
  icon        text,
  color       text,
  "order"     int NOT NULL DEFAULT 0,
  phase       int NOT NULL DEFAULT 1,
  builtin_id  text
);

-- Public read for catalog (anon key is safe — these are not user data)
ALTER TABLE public.packs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_tools ENABLE ROW LEVEL SECURITY;

-- RLS: SELECT is open to anon/authenticated via the policies below.
-- INSERT/UPDATE/DELETE are intentionally left without policies; only the
-- service-role key (used server-side) can write to these tables.
DO $$ BEGIN
  CREATE POLICY "packs_public_read"
    ON public.packs
    FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "pack_tools_public_read"
    ON public.pack_tools
    FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS pack_tools_pack_id_idx ON public.pack_tools(pack_id);
