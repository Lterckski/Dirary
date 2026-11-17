-- Phase 2, part 2: fixed monthly expenses and the monthly budget. Run after the Phase 2 money file. Safe to run more than once.
-- Amounts are whole centavos (integers), never decimals.

create table if not exists public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  amount_centavos bigint not null check (amount_centavos > 0),
  due_day integer not null default 1 check (due_day between 1 and 31),  -- day of the month; 31 means the last day in shorter months
  category_id uuid references public.categories (id) on delete set null,
  account_id uuid references public.accounts (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- One row per person: how much you allow yourself to spend in a month, fixed expenses included.
create table if not exists public.money_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  monthly_budget_centavos bigint check (monthly_budget_centavos is null or monthly_budget_centavos > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Set on the payment of a fixed expense, so it shows as paid for that month.
alter table public.transactions add column if not exists fixed_expense_id uuid references public.fixed_expenses (id) on delete set null;

create index if not exists fixed_expenses_user_updated_idx on public.fixed_expenses (user_id, updated_at);
create index if not exists money_plans_user_updated_idx on public.money_plans (user_id, updated_at);

alter table public.fixed_expenses enable row level security;
alter table public.money_plans enable row level security;

-- A fixed expense must be yours, and may only point at your own account and category.
drop policy if exists "fixed_expenses: own rows only" on public.fixed_expenses;
create policy "fixed_expenses: own rows only" on public.fixed_expenses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
    and (category_id is null or exists (select 1 from public.categories c where c.id = category_id and c.user_id = (select auth.uid())))
  );

drop policy if exists "money_plans: own rows only" on public.money_plans;
create policy "money_plans: own rows only" on public.money_plans
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Replaces the Phase 2 policy: a transaction may also only point at your own fixed expense.
drop policy if exists "transactions: own rows only" on public.transactions;
create policy "transactions: own rows only" on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
    and (category_id is null or exists (select 1 from public.categories c where c.id = category_id and c.user_id = (select auth.uid())))
    and (fixed_expense_id is null or exists (select 1 from public.fixed_expenses f where f.id = fixed_expense_id and f.user_id = (select auth.uid())))
  );

do $$
declare t text;
begin
  foreach t in array array['fixed_expenses', 'money_plans'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
