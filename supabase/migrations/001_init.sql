create extension if not exists pgcrypto;

do $$
begin
  create type public.challenge_status as enum ('active', 'completed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.trade_side as enum ('buy', 'sell');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  starting_cash numeric(12, 2) not null check (starting_cash >= 0),
  cash numeric(12, 2) not null check (cash >= 0),
  trade_count integer not null default 0 check (trade_count >= 0),
  max_trades integer not null default 10 check (max_trades > 0),
  benchmark_symbol text not null,
  benchmark_start_price numeric(12, 4) not null check (benchmark_start_price > 0),
  benchmark_end_price numeric(12, 4) null check (
    benchmark_end_price is null or benchmark_end_price > 0
  ),
  status public.challenge_status not null default 'active',
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint challenges_trade_count_within_limit check (trade_count <= max_trades),
  constraint challenges_completed_requires_timestamp check (
    status <> 'completed' or completed_at is not null
  ),
  constraint challenges_active_disallows_completed_timestamp check (
    status = 'completed' or completed_at is null
  )
);

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  ticker text not null,
  qty numeric(18, 6) not null check (qty >= 0),
  avg_cost numeric(12, 4) not null check (avg_cost >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint positions_challenge_id_ticker_key unique (challenge_id, ticker)
);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  ticker text not null,
  side public.trade_side not null,
  qty numeric(18, 6) not null check (qty > 0),
  executed_price numeric(12, 4) not null check (executed_price > 0),
  trade_number integer not null check (trade_number > 0),
  executed_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.latest_prices (
  ticker text primary key,
  price numeric(12, 4) not null check (price > 0),
  source text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists challenges_status_idx
  on public.challenges (status, created_at desc);

create index if not exists positions_challenge_id_idx
  on public.positions (challenge_id);

create index if not exists positions_ticker_idx
  on public.positions (ticker);

create unique index if not exists trades_challenge_id_trade_number_key
  on public.trades (challenge_id, trade_number);

create index if not exists trades_challenge_id_executed_at_idx
  on public.trades (challenge_id, executed_at desc);

create index if not exists trades_ticker_idx
  on public.trades (ticker);

drop trigger if exists set_positions_updated_at on public.positions;

create trigger set_positions_updated_at
before update on public.positions
for each row
execute function public.set_updated_at();

drop trigger if exists set_latest_prices_updated_at on public.latest_prices;

create trigger set_latest_prices_updated_at
before update on public.latest_prices
for each row
execute function public.set_updated_at();

-- Auth, RLS, and live market ingestion are intentionally deferred to later milestones.
