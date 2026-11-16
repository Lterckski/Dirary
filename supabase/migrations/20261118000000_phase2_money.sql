-- Phase 2: money. Accounts, categories (with an optional monthly budget) and transactions. Safe to run more than once.
-- Amounts are whole centavos (integers), never decimals. Raw bank notifications never reach this database;
-- only the parsed fields do.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  institution text not null default 'other' check (institution in ('securitybank', 'gotyme', 'gcash', 'cash', 'other')),
  opening_balance_centavos bigint not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  color text not null default 'inkBlue' check (color in ('inkBlue', 'tongue', 'amber', 'red', 'muted')),
  monthly_limit_centavos bigint check (monthly_limit_centavos is null or monthly_limit_centavos > 0),  -- the budget, applied every month
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  amount_centavos bigint not null check (amount_centavos > 0),
  direction text not null check (direction in ('in', 'out')),
  merchant text check (merchant is null or char_length(merchant) <= 120),
  note text check (note is null or char_length(note) <= 500),
  occurred_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'notification', 'email', 'import')),
  status text not null default 'confirmed' check (status in ('needs_review', 'confirmed')),
  fingerprint text,              -- identifies an auto-logged transaction so it is never logged twice
  transfer_group_id uuid,        -- set on both halves of a move between your own accounts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists accounts_user_updated_idx on public.accounts (user_id, updated_at);
create index if not exists categories_user_updated_idx on public.categories (user_id, updated_at);
create index if not exists transactions_user_updated_idx on public.transactions (user_id, updated_at);
create index if not exists transactions_user_occurred_idx on public.transactions (user_id, occurred_at desc) where deleted_at is null;
create index if not exists transactions_fingerprint_idx on public.transactions (user_id, fingerprint) where fingerprint is not null;

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "accounts: own rows only" on public.accounts;
create policy "accounts: own rows only" on public.accounts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "categories: own rows only" on public.categories;
create policy "categories: own rows only" on public.categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A transaction must be yours, and may only point at your own account and category.
drop policy if exists "transactions: own rows only" on public.transactions;
create policy "transactions: own rows only" on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
    and (category_id is null or exists (select 1 from public.categories c where c.id = category_id and c.user_id = (select auth.uid())))
  );

do $$
declare t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
