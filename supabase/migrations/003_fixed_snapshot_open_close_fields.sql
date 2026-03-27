alter table public.fixed_historical_snapshots
  add column if not exists reference_open numeric(12, 4),
  add column if not exists buy_open numeric(12, 4),
  add column if not exists result_close numeric(12, 4),
  add column if not exists pre_buy_return_pct numeric(12, 6);

update public.fixed_historical_snapshots
set
  reference_open = coalesce(reference_open, start_close),
  buy_open = coalesce(buy_open, start_close),
  result_close = coalesce(result_close, end_close),
  pre_buy_return_pct = coalesce(
    pre_buy_return_pct,
    case
      when start_close > 0 then ((end_close - start_close) / start_close) * 100
      else 0
    end
  );

alter table public.fixed_historical_snapshots
  alter column reference_open set not null,
  alter column buy_open set not null,
  alter column result_close set not null,
  alter column pre_buy_return_pct set not null;

alter table public.fixed_historical_snapshots
  add constraint fixed_historical_snapshots_reference_open_check
    check (reference_open > 0),
  add constraint fixed_historical_snapshots_buy_open_check
    check (buy_open > 0),
  add constraint fixed_historical_snapshots_result_close_check
    check (result_close > 0);
