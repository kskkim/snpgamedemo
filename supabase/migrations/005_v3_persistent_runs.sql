alter table public.v3_players
  add column if not exists auth_user_id uuid unique;

alter table public.v3_runs
  add column if not exists allocations jsonb not null default '[]'::jsonb,
  add column if not exists benchmark_symbol text,
  add column if not exists benchmark_start_price numeric(18, 8),
  add column if not exists ends_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.v3_runs
set ends_at = coalesce(
    ends_at,
    started_at + make_interval(secs => duration_seconds)
  ),
  benchmark_symbol = coalesce(benchmark_symbol, 'SPYON')
where ends_at is null
   or benchmark_symbol is null;

alter table public.v3_runs
  alter column benchmark_symbol set not null,
  alter column ends_at set not null;

alter table public.v3_runs
  drop constraint if exists v3_runs_status_check;

alter table public.v3_runs
  add constraint v3_runs_status_check
  check (status in ('active', 'completed', 'cancelled', 'expired'));

create table if not exists public.v3_run_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.v3_runs(id) on delete cascade,
  captured_at timestamptz not null default timezone('utc', now()),
  portfolio_value numeric(12, 2) not null check (portfolio_value >= 0),
  benchmark_value numeric(12, 2) not null check (benchmark_value >= 0),
  holdings_value jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists v3_run_snapshots_run_id_idx
  on public.v3_run_snapshots (run_id, captured_at asc);

create index if not exists v3_runs_active_idx
  on public.v3_runs (player_id, status, ends_at desc);

drop trigger if exists set_v3_runs_updated_at on public.v3_runs;

create trigger set_v3_runs_updated_at
before update on public.v3_runs
for each row
execute function public.set_updated_at();
