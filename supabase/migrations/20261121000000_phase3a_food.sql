-- Phase 3a: food log. Your own foods, what you ate (by grams), daily targets and water.
-- Run after the Phase 2 files. Safe to run more than once.
--
-- foods       Foods you have logged or saved. Calories and protein are per 100 g; servings are shortcuts like
--             "1 cup = 158 g", kept as a JSON array of {label, grams}.
-- food_logs   What you ate. Each keeps its own name, calories and protein, so editing a food later never
--             changes what you already logged.
-- health_goals  One row: daily calorie and protein targets and glasses of water.
-- water_logs  One row per glass, so two devices adding a glass at once never overwrite each other.

create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  source text not null default 'own' check (source in ('own', 'philfct', 'usda', 'off')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 80),       -- USDA FDC id, starter key or barcode
  kcal_per_100g numeric(6, 1) not null check (kcal_per_100g between 0 and 900),
  protein_per_100g numeric(5, 1) not null check (protein_per_100g between 0 and 100),
  servings text not null default '[]' check (jsonb_typeof(servings::jsonb) = 'array' and char_length(servings) <= 2000),
  barcode text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  food_id uuid references public.foods (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  grams numeric(7, 1) not null check (grams > 0 and grams <= 5000),
  kcal numeric(7, 1) not null check (kcal >= 0),
  protein_g numeric(6, 1) not null check (protein_g >= 0),
  eaten_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.health_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kcal_target integer check (kcal_target is null or kcal_target between 500 and 10000),
  protein_target_g integer check (protein_target_g is null or protein_target_g between 10 and 500),
  water_glasses integer not null default 8 check (water_glasses between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  drunk_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists foods_user_updated_idx on public.foods (user_id, updated_at);
create index if not exists food_logs_user_updated_idx on public.food_logs (user_id, updated_at);
create index if not exists food_logs_user_day_idx on public.food_logs (user_id, eaten_on);
create index if not exists health_goals_user_updated_idx on public.health_goals (user_id, updated_at);
create index if not exists water_logs_user_updated_idx on public.water_logs (user_id, updated_at);

alter table public.foods enable row level security;
alter table public.food_logs enable row level security;
alter table public.health_goals enable row level security;
alter table public.water_logs enable row level security;

drop policy if exists "foods: own rows only" on public.foods;
create policy "foods: own rows only" on public.foods
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A log may point only at one of your own foods.
drop policy if exists "food_logs: own rows only" on public.food_logs;
create policy "food_logs: own rows only" on public.food_logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (food_id is null or exists (select 1 from public.foods f where f.id = food_id and f.user_id = (select auth.uid())))
  );

drop policy if exists "health_goals: own rows only" on public.health_goals;
create policy "health_goals: own rows only" on public.health_goals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "water_logs: own rows only" on public.water_logs;
create policy "water_logs: own rows only" on public.water_logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['foods', 'food_logs', 'health_goals', 'water_logs'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
