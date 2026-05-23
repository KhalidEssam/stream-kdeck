ALTER TABLE public.pack_tools
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'ai';

ALTER TABLE public.pack_tools
  ADD COLUMN IF NOT EXISTS command text;

UPDATE public.pack_tools
SET kind = 'ai'
WHERE kind IS NULL;

ALTER TABLE public.pack_tools
  ALTER COLUMN kind SET DEFAULT 'ai';

ALTER TABLE public.pack_tools
  ALTER COLUMN kind SET NOT NULL;

ALTER TABLE public.pack_tools
  DROP CONSTRAINT IF EXISTS pack_tools_kind_check;

ALTER TABLE public.pack_tools
  ADD CONSTRAINT pack_tools_kind_check
  CHECK (kind IN ('ai', 'command'));

ALTER TABLE public.pack_tools
  DROP CONSTRAINT IF EXISTS pack_tools_output_mode_check;

ALTER TABLE public.pack_tools
  ADD CONSTRAINT pack_tools_output_mode_check
  CHECK (output_mode IN ('clipboard', 'autopaste', 'viewer', 'silent'));

ALTER TABLE public.pack_tools
  DROP CONSTRAINT IF EXISTS pack_tools_kind_output_mode_check;

ALTER TABLE public.pack_tools
  ADD CONSTRAINT pack_tools_kind_output_mode_check
  CHECK (
    (kind = 'ai' AND output_mode IN ('clipboard', 'autopaste', 'viewer'))
    OR
    (kind = 'command' AND output_mode IN ('viewer', 'silent'))
  );

ALTER TABLE public.pack_tools
  DROP CONSTRAINT IF EXISTS pack_tools_command_required_check;

ALTER TABLE public.pack_tools
  ADD CONSTRAINT pack_tools_command_required_check
  CHECK (kind <> 'command' OR nullif(btrim(command), '') IS NOT NULL);

ALTER TABLE public.pack_tools
  DROP CONSTRAINT IF EXISTS pack_tools_ai_prompt_required_check;

ALTER TABLE public.pack_tools
  ADD CONSTRAINT pack_tools_ai_prompt_required_check
  CHECK (kind <> 'ai' OR nullif(btrim(prompt), '') IS NOT NULL);
