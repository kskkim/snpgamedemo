create table if not exists public.v3_players (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  username text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.v3_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.v3_players(id) on delete cascade,
  player_email text not null,
  player_username text not null,
  selected_symbols text[] not null default '{}',
  starting_budget numeric(12, 2) not null check (starting_budget >= 0),
  duration_seconds integer not null default 300 check (duration_seconds > 0),
  portfolio_value numeric(12, 2) null check (portfolio_value is null or portfolio_value >= 0),
  user_return_pct numeric(12, 4) null,
  benchmark_return_pct numeric(12, 4) null,
  alpha_pct numeric(12, 4) null,
  status text not null default 'active' check (status in ('active', 'completed')),
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists v3_runs_status_idx
  on public.v3_runs (status, created_at desc);

create index if not exists v3_runs_alpha_idx
  on public.v3_runs (alpha_pct desc nulls last, completed_at desc nulls last);

create index if not exists v3_runs_player_id_idx
  on public.v3_runs (player_id, created_at desc);

drop trigger if exists set_v3_players_updated_at on public.v3_players;

create trigger set_v3_players_updated_at
before update on public.v3_players
for each row
execute function public.set_updated_at();
