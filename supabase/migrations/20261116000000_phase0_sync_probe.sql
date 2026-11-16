-- Phase 0: one small table that proves auth, row-level security and two-way sync.
-- Every later table follows the same pattern: user_id, updated_at, deleted_at, RLS on user_id.

create table if not exists public.sync_probe (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note text not null check (char_length(note) between 1 and 200),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists sync_probe_user_updated_idx on public.sync_probe (user_id, updated_at);

alter table public.sync_probe enable row level security;

drop policy if exists "sync_probe: own rows only" on public.sync_probe;
create policy "sync_probe: own rows only" on public.sync_probe
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Realtime: add the table only if it isn't registered yet, so this file is safe to run again.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sync_probe'
  ) then
    alter publication supabase_realtime add table public.sync_probe;
  end if;
end $$;
