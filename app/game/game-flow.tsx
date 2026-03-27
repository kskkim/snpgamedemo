"use client";

import { useState, useTransition } from "react";

import {
  type GamePortfolioActionResult,
  resetGameChallenge,
  submitGamePortfolio,
} from "@/app/game/actions";
import type { FixedHistoricalChartPoint } from "@/lib/db/fixed-historical-chart-points";
import type { GameSymbolOption } from "@/lib/db/game-symbols";
import type { TwelveDataRangeSummary } from "@/lib/market-data/twelve-data";

type GameFlowProps = {
  initialSnapshot: TwelveDataRangeSummary[];
  initialBenchmark: TwelveDataRangeSummary;
  chartPoints: FixedHistoricalChartPoint[];
  featuredStocks: GameSymbolOption[];
  searchableStocks: GameSymbolOption[];
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatAxisValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return value >= 1000
    ? value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      })
    : value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

function buildChartPath(values: number[], width: number, height: number): string {
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return "";
  }

  const minValue = Math.min(...finiteValues);
  const maxValue = Math.max(...finiteValues);
  const range = maxValue - minValue || 1;

  return finiteValues
    .map((value, index) => {
      const x =
        finiteValues.length === 1
          ? width / 2
          : (index / (finiteValues.length - 1)) * width;
      const y = height - ((value - minValue) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildIntradaySeries(
  openPrice?: number | null,
  closePrice?: number | null
): number[] {
  if (
    typeof openPrice !== "number" ||
    !Number.isFinite(openPrice) ||
    typeof closePrice !== "number" ||
    !Number.isFinite(closePrice)
  ) {
    return [];
  }

  const drift = closePrice - openPrice;
  const amplitudeBase = Math.max(Math.abs(drift) * 0.65, openPrice * 0.006);
  const offsets = [-0.12, 0.28, 0.51, 0.14, -0.08, -0.26, 0.07, 0.31, 0.19, -0.04, 0.24, 0];

  return offsets.map((offset, index) => {
    if (index === 0) {
      return openPrice;
    }

    if (index === offsets.length - 1) {
      return closePrice;
    }

    const progress = index / (offsets.length - 1);
    const baseline = openPrice + drift * progress;
    return baseline + amplitudeBase * offset;
  });
}

function getNiceStep(range: number): number {
  if (!Number.isFinite(range) || range <= 0) {
    return 1;
  }

  const roughStep = range / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}

function getTimeAxisLabel(pointKey: string): string {
  const cleaned = pointKey.trim().toLowerCase();
  const mapping: Record<string, string> = {
    "09:30": "9:30",
    "9:30": "9:30",
    "10:30": "10:30",
    "11:30": "11:30",
    "12:30": "12:30",
    "13:30": "1:30",
    "1:30": "1:30",
    "14:30": "2:30",
    "2:30": "2:30",
    "15:30": "3:30",
    "3:30": "3:30",
    "16:00": "4:00",
    "4:00": "4:00",
  };

  return mapping[cleaned] ?? pointKey;
}

export function GameFlow({
  initialSnapshot,
  initialBenchmark,
  chartPoints,
  featuredStocks,
  searchableStocks,
}: GameFlowProps) {
  const initialVisibleSymbols = featuredStocks.map((stock) => stock.symbol);
  const [screen, setScreen] = useState<"start" | "build" | "result">("start");
  const [showRules, setShowRules] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, number>>(() =>
    Object.fromEntries(searchableStocks.map((stock) => [stock.symbol, 0]))
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleSymbols, setVisibleSymbols] = useState<string[]>(initialVisibleSymbols);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gameResult, setGameResult] =
    useState<GamePortfolioActionResult["result"]>(null);
  const [isPending, startTransition] = useTransition();

  const snapshotBySymbol = Object.fromEntries(
    initialSnapshot.map((entry) => [entry.symbol, entry])
  ) as Record<string, TwelveDataRangeSummary>;
  const symbolMetaBySymbol = Object.fromEntries(
    searchableStocks.map((entry) => [entry.symbol, entry])
  ) as Record<string, GameSymbolOption>;
  const benchmark = initialBenchmark;
  const benchmarkSeries = buildIntradaySeries(
    benchmark?.buyOpen,
    benchmark?.resultClose
  );
  const benchmarkChartPath = benchmark
    ? buildChartPath(benchmarkSeries, 260, 100)
    : "";
  const totalAllocation = Object.values(allocations).reduce(
    (sum, value) => sum + value,
    0
  );
  const hasWin = (gameResult?.alpha ?? 0) > 0;
  const filteredSearchResults = searchableStocks
    .filter((stock) => !visibleSymbols.includes(stock.symbol))
    .filter((stock) => {
      const query = searchQuery.trim().toLowerCase();

      if (!query) {
        return false;
      }

      return (
        stock.symbol.toLowerCase().includes(query) ||
        stock.companyName.toLowerCase().includes(query)
      );
    })
    .slice(0, 6);
  const topPerformers = initialSnapshot
    .map((snapshot) => ({
      snapshot,
      stock: symbolMetaBySymbol[snapshot.symbol],
    }))
    .filter(
      (
        entry
      ): entry is {
        snapshot: TwelveDataRangeSummary;
        stock: GameSymbolOption;
      } => Boolean(entry.stock)
    )
    .sort(
      (left, right) =>
        (right.snapshot.preBuyReturnPct ?? Number.NEGATIVE_INFINITY) -
        (left.snapshot.preBuyReturnPct ?? Number.NEGATIVE_INFINITY)
    )
    .slice(0, 5);
  const chartPointKeys = Array.from(
    new Set(chartPoints.map((point) => point.pointKey))
  ).sort((left, right) => left.localeCompare(right));

  function setAllocation(symbol: string, nextValue: number) {
    const normalizedValue = Math.max(0, Math.min(100, nextValue));

    setAllocations((current) => ({
      ...current,
      [symbol]: normalizedValue,
    }));
    setStatusMessage(null);
    setErrorMessage(null);
  }

function setAllAllocation(symbol: string) {
    setAllocations(
      Object.fromEntries(
        searchableStocks.map((stock) => [stock.symbol, stock.symbol === symbol ? 100 : 0])
      )
    );
    setStatusMessage(null);
    setErrorMessage(null);
  }

  function addVisibleSymbol(symbol: string) {
    setVisibleSymbols((current) =>
      current.includes(symbol) ? current : [symbol, ...current]
    );
    setSearchQuery("");
    setStatusMessage(null);
    setErrorMessage(null);
  }

  function removeVisibleSymbol(symbol: string) {
    setVisibleSymbols((current) => current.filter((entry) => entry !== symbol));
    setStatusMessage(null);
    setErrorMessage(null);
  }

  function handleSearchSubmit() {
    const trimmedQuery = searchQuery.trim().toLowerCase();

    if (!trimmedQuery) {
      return;
    }

    const exactMatch = searchableStocks.find(
      (stock) =>
        stock.symbol.toLowerCase() === trimmedQuery ||
        stock.companyName.toLowerCase() === trimmedQuery
    );
    const candidate = exactMatch ?? filteredSearchResults[0];

    if (!candidate) {
      setErrorMessage("No matching game stock was found for that search.");
      return;
    }

    addVisibleSymbol(candidate.symbol);
  }

  function formatOptionalCurrency(value?: number | null): string {
    return typeof value === "number" && Number.isFinite(value)
      ? formatCurrency(value)
      : "--";
  }

  function getSeriesColor(symbol: string): string {
    const palette: Record<string, string> = {
      AAPL: "#4b7bec",
      AMZN: "#ff8a3d",
      META: "#0f9d58",
      MSFT: "#2563eb",
      NVDA: "#2e7d32",
      TSLA: "#ef4444",
      PORTFOLIO: "#111827",
      SPY: "#7c3aed",
    };

    return palette[symbol] ?? "#6b7280";
  }

  const resultChartSeries = (() => {
    if (!gameResult || chartPointKeys.length === 0) {
      return [];
    }

    const selectedSymbols = Object.keys(gameResult.allocations);
    const visibleSelected = selectedSymbols.filter((symbol) =>
      chartPoints.some((point) => point.symbol === symbol)
    );
    const missingSelected = selectedSymbols.filter(
      (symbol) => !visibleSelected.includes(symbol)
    );

    const selectedSeries = visibleSelected.map((symbol) => ({
      id: symbol,
      label: symbol,
      color: getSeriesColor(symbol),
      emphasis: false,
      values: chartPointKeys.map((pointKey) => {
        const point = chartPoints.find(
          (entry) => entry.symbol === symbol && entry.pointKey === pointKey
        );
        return point?.price ?? Number.NaN;
      }),
    }));

    const benchmarkSeriesForChart = {
      id: "SPY",
      label: "SPY",
      color: getSeriesColor("SPY"),
      emphasis: true,
      values: chartPointKeys.map((pointKey) => {
        const point = chartPoints.find(
          (entry) => entry.symbol === "SPY" && entry.pointKey === pointKey
        );
        return point?.price ?? Number.NaN;
      }),
    };

    return {
      series: [...selectedSeries, benchmarkSeriesForChart],
      missingSelected,
    };
  })();

  function handleConfirm() {
    startTransition(async () => {
      const outcome = await submitGamePortfolio({ allocations });
      const { message, error, result } = outcome;

      setStatusMessage(message);
      setErrorMessage(error);
      setGameResult(result);

      if (!error && result) {
        setScreen("result");
      }
    });
  }

  function handleRestart() {
    startTransition(async () => {
      const result = await resetGameChallenge();

      setAllocations(
        Object.fromEntries(searchableStocks.map((stock) => [stock.symbol, 0]))
      );
      setSearchQuery("");
      setVisibleSymbols(initialVisibleSymbols);
      setGameResult(null);
      setStatusMessage(result.message);
      setErrorMessage(result.error);
      setScreen("start");
    });
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10 sm:px-10">
      {screen === "start" ? (
        <section className="flex min-h-[70vh] flex-col items-center justify-center text-center">
          <p className="text-sm font-semibold tracking-[0.2em] text-muted uppercase">
            Fixed Historical Mode
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            Beat the S&amp;P 500 Challenge
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
            This mode uses the March 19 open as the pre-buy reference, the
            March 20 open as the buy price, and the March 20 close as the final
            result.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setStatusMessage(null);
                setErrorMessage(null);
                setScreen("build");
              }}
              className="rounded-full bg-foreground px-8 py-3 text-sm font-semibold text-background transition-colors hover:bg-[#20302b]"
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => setShowRules(true)}
              className="rounded-full border border-panel-border bg-white px-8 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-[#f5f4ef]"
            >
              Rules
            </button>
          </div>

          {showRules ? (
            <div className="mt-8 w-full max-w-md rounded-[2rem] border border-panel-border bg-white p-6 text-left shadow-[0_20px_60px_rgba(22,33,29,0.08)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Rules</h2>
            <div className="mt-4 space-y-2 text-sm text-muted">
                    <p>Start with $10,000</p>
                    <p>Choose from the featured stocks or search for another one</p>
                    <p>Build your portfolio</p>
                    <p>Compare your performance against the S&amp;P 500</p>
                    <p>Beat the benchmark to win</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRules(false)}
                  className="rounded-full border border-panel-border px-3 py-1 text-xs font-semibold text-foreground"
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {screen === "build" ? (
        <section className="rounded-[2rem] border border-panel-border bg-panel p-8 shadow-[0_20px_70px_rgba(22,33,29,0.08)]">
          <p className="text-sm font-semibold tracking-[0.18em] text-muted uppercase">
            Beat the S&amp;P 500
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-foreground">
            Budget: $10,000
          </h1>
          <p className="mt-2 text-sm text-muted">
            Buy prices use the March 20, 2026 open. Results use the March 20,
            2026 close.
          </p>

          {statusMessage ? (
            <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {statusMessage}
            </p>
          ) : null}

          {errorMessage ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-6 rounded-2xl border border-panel-border bg-white/80 p-4 shadow-sm">
            <label className="text-sm font-semibold text-foreground">
              Search stocks
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSearchSubmit();
                }
              }}
              placeholder="Search by company name or ticker"
              className="mt-3 w-full rounded-xl border border-panel-border bg-[#f6f7f3] px-4 py-3 text-sm text-foreground outline-none"
            />
            {filteredSearchResults.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {filteredSearchResults.map((stock) => (
                  <button
                    key={stock.symbol}
                    type="button"
                    onClick={() => addVisibleSymbol(stock.symbol)}
                    className="rounded-full border border-panel-border bg-white px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-[#f5f4ef]"
                  >
                    {stock.symbol} · {stock.companyName}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_360px]">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleSymbols.map((symbol) => {
                const stock = symbolMetaBySymbol[symbol];
                const summary = snapshotBySymbol[symbol];

                if (!stock || !summary) {
                  return null;
                }

                const allocation = allocations[stock.symbol] ?? 0;
                const buyPrice = summary?.buyOpen ?? 0;
                const estimatedSpend = (allocation / 100) * 10_000;
                const estimatedShares =
                  buyPrice > 0 ? Math.floor(estimatedSpend / buyPrice) : 0;

                return (
                  <article
                    key={stock.symbol}
                    className="rounded-2xl border border-panel-border bg-white/85 p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        {stock.symbol}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeVisibleSymbol(stock.symbol)}
                        className="rounded-full border border-panel-border px-2 py-1 text-[11px] font-semibold text-muted transition-colors hover:bg-[#f5f4ef]"
                        aria-label={`Remove ${stock.symbol}`}
                      >
                        Remove
                      </button>
                    </div>
                    <p className="mt-1 text-sm text-muted">{stock.companyName}</p>
                    <p className="mt-4 text-2xl font-semibold text-foreground">
                      {buyPrice ? formatCurrency(buyPrice) : "--"}
                    </p>
                    <p className="mt-1 text-xs text-muted">Mar 20 open buy price</p>
                    <div className="mt-3 rounded-xl bg-[#f6f7f3] px-3 py-3 text-xs text-muted">
                      <div className="flex items-center justify-between gap-3">
                        <span>24h move</span>
                        <span
                          className={
                            summary?.preBuyReturnPct && summary.preBuyReturnPct < 0
                              ? "text-red-500"
                              : summary?.preBuyReturnPct &&
                                  summary.preBuyReturnPct > 0
                                ? "text-emerald-600"
                                : "text-muted"
                          }
                        >
                          {summary
                            ? formatPercent(summary.preBuyReturnPct)
                            : "--"}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span>Mar 19 open</span>
                        <span>
                          {summary
                            ? formatOptionalCurrency(summary.referenceOpen)
                            : "--"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      <div className="flex items-center justify-between text-sm text-muted">
                        <span>Allocation</span>
                        <span>{allocation}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={allocation}
                        onChange={(event) =>
                          setAllocation(
                            stock.symbol,
                            Number.parseInt(event.target.value, 10)
                          )
                        }
                        className="w-full"
                      />
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>{formatCurrency(estimatedSpend)}</span>
                        <span>{estimatedShares} shares</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAllAllocation(stock.symbol)}
                        className="rounded-full border border-panel-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-[#f5f4ef]"
                      >
                        All
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>

            <aside className="rounded-2xl border border-panel-border bg-white/85 p-6 shadow-sm">
              <p className="text-sm font-semibold tracking-[0.18em] text-muted uppercase">
                Benchmark
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-foreground">SPY</h2>
              <p className="mt-3 text-3xl font-semibold text-foreground">
                {benchmark ? formatOptionalCurrency(benchmark.buyOpen) : "--"}
              </p>
              <p className="mt-1 text-xs text-muted">Mar 20 open</p>
              <p
                className={`mt-2 text-sm font-medium ${
                  benchmark?.preBuyReturnPct && benchmark.preBuyReturnPct < 0
                    ? "text-red-500"
                    : benchmark?.preBuyReturnPct && benchmark.preBuyReturnPct > 0
                      ? "text-emerald-600"
                      : "text-muted"
                }`}
              >
                {benchmark
                  ? `${formatPercent(benchmark.preBuyReturnPct)} vs Mar 19 open`
                  : "--"}
              </p>

              <div className="mt-6 rounded-2xl bg-[#f6f7f3] p-4">
                <svg
                  viewBox="0 0 260 100"
                  className="h-32 w-full"
                  role="img"
                  aria-label="SPY benchmark chart"
                >
                  <defs>
                    <linearGradient
                      id="spy-chart-fill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {benchmarkChartPath ? (
                    <path
                      d={`${benchmarkChartPath} L 260 100 L 0 100 Z`}
                      fill="url(#spy-chart-fill)"
                      className="text-foreground"
                    />
                  ) : null}
                  <path
                    d={benchmarkChartPath}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-foreground"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <div className="mt-6 rounded-2xl bg-[#f6f7f3] px-4 py-3 text-sm text-muted">
                <div className="flex items-center justify-between">
                  <span>Total allocated</span>
                  <span>{totalAllocation}%</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>Budget used</span>
                  <span>{formatCurrency((totalAllocation / 100) * 10_000)}</span>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-panel-border bg-[#fcfcf8] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">
                    Top 5 performers
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
                    24h
                  </p>
                </div>
                <div className="mt-3 space-y-2">
                  {topPerformers.map(({ snapshot, stock }) => (
                    <div
                      key={stock.symbol}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground">
                          {stock.symbol}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {stock.companyName}
                        </p>
                      </div>
                      <p
                        className={`text-xs font-semibold ${
                          (snapshot.preBuyReturnPct ?? 0) < 0
                            ? "text-red-500"
                            : (snapshot.preBuyReturnPct ?? 0) > 0
                              ? "text-emerald-600"
                              : "text-muted"
                        }`}
                      >
                        {formatPercent(snapshot.preBuyReturnPct)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="rounded-full bg-foreground px-8 py-3 text-sm font-semibold text-background transition-colors hover:bg-[#20302b] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isPending ? "Calculating..." : "Confirm"}
            </button>
          </div>
        </section>
      ) : null}

      {screen === "result" ? (
        <section className="mx-auto max-w-3xl rounded-[2rem] border border-panel-border bg-panel p-8 text-center shadow-[0_20px_70px_rgba(22,33,29,0.08)]">
          <p className="text-sm font-semibold tracking-[0.18em] text-muted uppercase">
            Result
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground">
            {hasWin
              ? `You outperform the S&P 500 by ${formatPercent(
                  gameResult?.alpha ?? 0
                )}`
              : `You underperform the S&P 500 by ${Math.abs(
                  gameResult?.alpha ?? 0
                ).toFixed(2)}%`}
          </h1>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-panel-border bg-white/80 p-5 text-left shadow-sm">
              <p className="text-sm text-muted">Starting budget</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {formatCurrency(gameResult?.startingBudget ?? 10_000)}
              </p>
            </article>
            <article className="rounded-2xl border border-panel-border bg-white/80 p-5 text-left shadow-sm">
              <p className="text-sm text-muted">Portfolio value</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {formatCurrency(gameResult?.portfolioValue ?? 10_000)}
              </p>
            </article>
            <article className="rounded-2xl border border-panel-border bg-white/80 p-5 text-left shadow-sm">
              <p className="text-sm text-muted">Your return</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {formatPercent(gameResult?.userReturn ?? 0)}
              </p>
            </article>
            <article className="rounded-2xl border border-panel-border bg-white/80 p-5 text-left shadow-sm">
              <p className="text-sm text-muted">S&amp;P 500 return</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {formatPercent(gameResult?.benchmarkReturn ?? 0)}
              </p>
            </article>
          </div>

          {resultChartSeries && "series" in resultChartSeries ? (
            <div className="mt-8 rounded-2xl border border-panel-border bg-white/80 p-5 text-left shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    March 20 intraday
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Selected stocks, SPY benchmark, and portfolio value
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2 text-[11px]">
                  {resultChartSeries.series.map((series) => (
                    <span
                      key={series.id}
                      className="rounded-full px-2 py-1 font-semibold"
                      style={{
                        backgroundColor: `${series.color}14`,
                        color: series.color,
                      }}
                    >
                      {series.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-[#f6f7f3] p-4">
                {(() => {
                  const chartWidth = 420;
                  const chartHeight = 190;
                  const axisLeft = 56;
                  const axisRight = 14;
                  const axisTop = 12;
                  const axisBottom = 30;
                  const plotWidth = chartWidth - axisLeft - axisRight;
                  const plotHeight = chartHeight - axisTop - axisBottom;
                  const flattened = resultChartSeries.series.flatMap((series) =>
                    series.values.filter((value) => Number.isFinite(value))
                  );

                  if (flattened.length === 0) {
                    return (
                      <p className="text-xs text-muted">
                        Intraday chart data is unavailable for this result.
                      </p>
                    );
                  }

                  const minValue = Math.min(...flattened);
                  const maxValue = Math.max(...flattened);
                  const paddedRange = maxValue - minValue || Math.max(minValue * 0.02, 1);
                  const step = getNiceStep(paddedRange);
                  const axisMin = Math.floor(minValue / step) * step;
                  const axisMax = Math.ceil(maxValue / step) * step;
                  const axisRange = axisMax - axisMin || step;
                  const tickValues = Array.from({ length: 5 }, (_, index) => axisMin + step * index)
                    .filter((value) => value <= axisMax + step * 0.01);

                  return (
                    <svg
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      className="h-56 w-full"
                      role="img"
                      aria-label="Result intraday chart"
                    >
                      {tickValues.map((tick) => {
                        const y =
                          axisTop + plotHeight - ((tick - axisMin) / axisRange) * plotHeight;

                        return (
                          <g key={tick}>
                            <line
                              x1={axisLeft}
                              x2={chartWidth - axisRight}
                              y1={y}
                              y2={y}
                              stroke="#d7dbd1"
                              strokeWidth="1"
                            />
                            <text
                              x={axisLeft - 8}
                              y={y + 4}
                              textAnchor="end"
                              className="fill-[#66736d] text-[10px]"
                            >
                              {formatAxisValue(tick)}
                            </text>
                          </g>
                        );
                      })}

                      <line
                        x1={axisLeft}
                        x2={axisLeft}
                        y1={axisTop}
                        y2={axisTop + plotHeight}
                        stroke="#aeb7af"
                        strokeWidth="1.25"
                      />
                      <line
                        x1={axisLeft}
                        x2={chartWidth - axisRight}
                        y1={axisTop + plotHeight}
                        y2={axisTop + plotHeight}
                        stroke="#aeb7af"
                        strokeWidth="1.25"
                      />

                      {resultChartSeries.series.map((series) => {
                        const path = series.values
                          .map((value, index) => {
                            if (!Number.isFinite(value)) {
                              return null;
                            }

                            const x =
                              axisLeft +
                              (chartPointKeys.length === 1
                                ? plotWidth / 2
                                : (index / (chartPointKeys.length - 1)) * plotWidth);
                            const y =
                              axisTop +
                              plotHeight -
                              (((value as number) - axisMin) / axisRange) * plotHeight;
                            return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
                          })
                          .filter(Boolean)
                          .join(" ");

                        if (!path) {
                          return null;
                        }

                        return (
                          <path
                            key={series.id}
                            d={path}
                            fill="none"
                            stroke={series.color}
                            strokeWidth={series.emphasis ? 3.5 : 2}
                            strokeOpacity={series.emphasis ? 1 : 0.45}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      })}

                      {chartPointKeys.map((pointKey, index) => {
                        const x =
                          axisLeft +
                          (chartPointKeys.length === 1
                            ? plotWidth / 2
                            : (index / (chartPointKeys.length - 1)) * plotWidth);

                        return (
                          <text
                            key={pointKey}
                            x={x}
                            y={chartHeight - 8}
                            textAnchor="middle"
                            className="fill-[#66736d] text-[10px]"
                          >
                            {getTimeAxisLabel(pointKey)}
                          </text>
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>

              {resultChartSeries.missingSelected.length > 0 ? (
                <p className="mt-3 text-xs text-muted">
                  Missing chart points for: {resultChartSeries.missingSelected.join(", ")}.
                </p>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleRestart}
            disabled={isPending}
            className="mt-8 rounded-full bg-foreground px-8 py-3 text-sm font-semibold text-background transition-colors hover:bg-[#20302b] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? "Working..." : hasWin ? "Claim Rewards" : "Try Again"}
          </button>
        </section>
      ) : null}
    </main>
  );
}
