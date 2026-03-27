insert into public.fixed_historical_snapshots (
  symbol,
  start_date,
  end_date,
  reference_open,
  buy_open,
  result_close,
  pre_buy_return_pct,
  start_close,
  end_close,
  return_pct
)
values
  ('MSFT', '2026-03-19', '2026-03-20', 100, 101, 102, 1, 101, 102, 0.990099),
  ('NVDA', '2026-03-19', '2026-03-20', 100, 101, 102, 1, 101, 102, 0.990099),
  ('AMZN', '2026-03-19', '2026-03-20', 100, 101, 102, 1, 101, 102, 0.990099),
  ('TSLA', '2026-03-19', '2026-03-20', 100, 101, 102, 1, 101, 102, 0.990099),
  ('META', '2026-03-19', '2026-03-20', 100, 101, 102, 1, 101, 102, 0.990099),
  ('AAPL', '2026-03-19', '2026-03-20', 100, 101, 102, 1, 101, 102, 0.990099),
  ('SPY',  '2026-03-19', '2026-03-20', 100, 101, 102, 1, 101, 102, 0.990099)
on conflict (symbol, start_date, end_date)
do update set
  reference_open = excluded.reference_open,
  buy_open = excluded.buy_open,
  result_close = excluded.result_close,
  pre_buy_return_pct = excluded.pre_buy_return_pct,
  start_close = excluded.start_close,
  end_close = excluded.end_close,
  return_pct = excluded.return_pct;
