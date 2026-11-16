-- Phase 1: to-do lists and tasks. Safe to run more than once.
-- Same pattern as every Dirary table: user_id, updated_at, deleted_at, row-level security on user_id.
-- updated_at is set by the app on every write; sync uses it for last-write-wins.

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default 'inkBlue' check (color in ('inkBlue', 'tongue', 'amber', 'red', 'muted')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id uuid references public.lists (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  due_date date,                 -- the day it's due, in your local time
  due_time time,                 -- optional time on that day
  remind_at timestamptz,         -- used from milestone 3
  priority smallint not null default 0 check (priority between 0 and 3),  -- 0 none, 1 low, 2 medium, 3 high
  status text not null default 'todo' check (status in ('todo', 'done')),
  recurrence_rule text,          -- used from milestone 3
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (due_time is null or due_date is not null)
);

create index if not exists lists_user_updated_idx on public.lists (user_id, updated_at);
create index if not exists tasks_user_updated_idx on public.tasks (user_id, updated_at);
create index if not exists tasks_user_due_idx on public.tasks (user_id, due_date) where deleted_at is null;

alter table public.lists enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "lists: own rows only" on public.lists;
create policy "lists: own rows only" on public.lists
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A task must be yours, and may only point at one of your own lists.
drop policy if exists "tasks: own rows only" on public.tasks;
create policy "tasks: own rows only" on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (list_id is null or exists (select 1 from public.lists l where l.id = list_id and l.user_id = (select auth.uid())))
  );

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lists') then
    alter publication supabase_realtime add table public.lists;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;
