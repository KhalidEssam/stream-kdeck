-- Partial unique index on builtin_id to enable idempotent seed upserts.
-- Seeding with ON CONFLICT (builtin_id) WHERE builtin_id IS NOT NULL
-- preserves existing UUIDs so deck tiles remain valid after a seed re-run.
CREATE UNIQUE INDEX IF NOT EXISTS pack_tools_builtin_id_unique
  ON public.pack_tools (builtin_id)
  WHERE builtin_id IS NOT NULL;
