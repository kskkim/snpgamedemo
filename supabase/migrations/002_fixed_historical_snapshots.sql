create table if not exists public.fixed_historical_snapshots (
  symbol text not null,
  start_date date not null,
  end_date date not null,
  start_close numeric(12, 4) not null check (start_close > 0),
  end_close numeric(12, 4) not null check (end_close > 0),
  return_pct numeric(12, 6) not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (symbol, start_date, end_date)
);

create index if not exists fixed_historical_snapshots_range_idx
  on public.fixed_historical_snapshots (start_date, end_date, symbol);
