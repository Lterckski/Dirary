-- Phase 3b: workouts. Exercises, routines with planned weekdays, workouts (sessions), the sets you did, and
-- body weight. Run after the Phase 3a file. Safe to run more than once.
--
-- exercises         Your exercises. Starter ones are copied in the first time you use them (starter_key).
-- routines          A named list of exercises with target sets and reps (plan, JSON text) and the weekdays
--                   it's planned for ("135" = Mon, Wed, Fri; 0 = Sunday).
-- workout_sessions  One workout. A planned one comes from a routine (planned_for is the day it was planned,
--                   planned_date the day it's on now, if you moved it). done_at marks it done.
-- workout_sets      One row per set you ticked off.
-- body_metrics      Body weight by day.
--
-- Planned workouts also show up as tasks in a Workouts list. The task's id comes from the workout's id, so
-- the tasks table needs no new column.

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  muscle_group text check (muscle_group is null or char_length(muscle_group) <= 30),
  starter_key text check (starter_key is null or char_length(starter_key) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  plan text not null default '[]' check (jsonb_typeof(plan::jsonb) = 'array' and char_length(plan) <= 4000),
  weekdays text not null default '' check (weekdays ~ '^[0-6]{0,7}$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid references public.routines (id) on delete set null,
  name text not null check (char_length(name) between 1 and 40),
  planned_for date,
  planned_date date not null,
  started_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  set_index smallint not null check (set_index between 0 and 50),
  weight_kg numeric(6, 2) not null default 0 check (weight_kg between 0 and 1000),
  reps smallint not null check (reps between 0 and 1000),
  performed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  weight_kg numeric(5, 1) not null check (weight_kg between 20 and 400),
  measured_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists exercises_user_updated_idx on public.exercises (user_id, updated_at);
create index if not exists routines_user_updated_idx on public.routines (user_id, updated_at);
create index if not exists workout_sessions_user_updated_idx on public.workout_sessions (user_id, updated_at);
create index if not exists workout_sets_user_updated_idx on public.workout_sets (user_id, updated_at);
create index if not exists workout_sets_session_idx on public.workout_sets (session_id);
create index if not exists body_metrics_user_updated_idx on public.body_metrics (user_id, updated_at);

alter table public.exercises enable row level security;
alter table public.routines enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.body_metrics enable row level security;

drop policy if exists "exercises: own rows only" on public.exercises;
create policy "exercises: own rows only" on public.exercises
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "routines: own rows only" on public.routines;
create policy "routines: own rows only" on public.routines
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A workout may come only from one of your own routines.
drop policy if exists "workout_sessions: own rows only" on public.workout_sessions;
create policy "workout_sessions: own rows only" on public.workout_sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (routine_id is null or exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())))
  );

-- A set may belong only to your own workout and exercise.
drop policy if exists "workout_sets: own rows only" on public.workout_sets;
create policy "workout_sets: own rows only" on public.workout_sets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid()))
    and exists (select 1 from public.exercises e where e.id = exercise_id and e.user_id = (select auth.uid()))
  );

drop policy if exists "body_metrics: own rows only" on public.body_metrics;
create policy "body_metrics: own rows only" on public.body_metrics
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['exercises', 'routines', 'workout_sessions', 'workout_sets', 'body_metrics'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
