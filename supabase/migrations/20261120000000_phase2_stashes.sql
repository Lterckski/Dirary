-- Phase 2, part 3: stashes. Money set aside inside one of your accounts (an emergency fund, tuition)
-- so it stops counting as spendable. Run after the plan file. Safe to run more than once.
-- Amounts are whole centavos. The money never moves: a stash only marks part of an account's balance.

create table if not exists public.stashes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  account_id uuid not null references public.accounts (id) on delete cascade,
  amount_centavos bigint not null default 0 check (amount_centavos >= 0),          -- set aside right now
  goal_centavos bigint check (goal_centavos is null or goal_centavos > 0),          -- optional target
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists stashes_user_updated_idx on public.stashes (user_id, updated_at);

alter table public.stashes enable row level security;

-- A stash must be yours and sit in one of your own accounts.
drop policy if exists "stashes: own rows only" on public.stashes;
create policy "stashes: own rows only" on public.stashes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
  );

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stashes') then
    alter publication supabase_realtime add table public.stashes;
  end if;
end $$;
