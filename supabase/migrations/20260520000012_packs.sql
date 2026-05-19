create table public.packs (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  icon        text not null,
  color       text,
  "order"     int not null default 0
);

create table public.pack_tools (
  id          uuid primary key default gen_random_uuid(),
  pack_id     uuid not null references public.packs(id) on delete cascade,
  label       text not null,
  prompt      text not null,
  output_mode text not null check (output_mode in ('clipboard','autopaste','viewer')),
  source      text not null default 'clipboard'
                check (source in ('clipboard','active_window','shell')),
  icon        text,
  color       text,
  "order"     int not null default 0,
  phase       int not null default 1,
  builtin_id  text
);

-- Public read for catalog (anon key is safe — these are not user data)
alter table public.packs    enable row level security;
alter table public.pack_tools enable row level security;

create policy "packs_public_read"      on public.packs      for select using (true);
create policy "pack_tools_public_read" on public.pack_tools  for select using (true);
