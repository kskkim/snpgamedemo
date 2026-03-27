"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";

import {
  submitBuyOrder,
  submitResetChallenge,
  submitSellOrder,
} from "@/app/challenge/trade-actions";
import type {
  ChallengePosition,
  ChallengeTrade,
  ChallengeViewState,
} from "@/lib/challenge-engine";
import { BENCHMARK_SYMBOL, MAX_TRADES } from "@/lib/mock-market";

type ChallengeDashboardProps = {
  initialState: ChallengeViewState;
};

type SearchResult = {
  symbol: string;
  name: string;
  exchange: string | null;
};

type QuoteSnapshot = {
  price: number;
  changePercent24h: number | null;
};

type ChartPoint = {
  timestamp: string;
  price: number;
};

const POPULAR_PICKS: SearchResult[] = [
  { symbol: "AAPL", name: "Apple", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ" },
  { symbol: "NVDA", name: "NVIDIA", exchange: "NASDAQ" },
  { symbol: "AMZN", name: "Amazon", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla", exchange: "NASDAQ" },
  { symbol: "META", name: "Meta", exchange: "NASDAQ" },
];

const DEFAULT_SEARCH_RESULTS: SearchResult[] = POPULAR_PICKS;
const SEARCHABLE_EXCHANGES = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA"]);

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function getChangeColor(changePercent24h: number | null): string {
  if (changePercent24h === null) {
    return "text-muted";
  }

  if (changePercent24h > 0) {
    return "text-emerald-600";
  }

  if (changePercent24h < 0) {
    return "text-red-500";
  }

  return "text-muted";
}

function formatUpdatedAt(value: string | null): string {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatUpdatedAtEt(value: string | null): string {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function getMarketStatus(value: string | null): {
  label: string;
  tone: string;
} {
  if (!value) {
    return {
      label: "Market status unavailable",
      tone: "bg-[#f2efe7] text-muted",
    };
  }

  const etFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });

  const parts = etFormatter.formatToParts(new Date(value));
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0"
  );
  const minutesSinceMidnight = hour * 60 + minute;
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const isOpen =
    isWeekday &&
    minutesSinceMidnight >= 9 * 60 + 30 &&
    minutesSinceMidnight < 16 * 60;

  if (isOpen) {
    return {
      label: "Market open",
      tone: "bg-emerald-100 text-emerald-700",
    };
  }

  return {
    label: "Market closed",
    tone: "bg-[#f2efe7] text-muted",
  };
}

function buildChartPath(points: ChartPoint[], width: number, height: number): string {
  if (points.length === 0) {
    return "";
  }

  const prices = points.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  return points
    .map((point, index) => {
      const x =
        points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = height - ((point.price - minPrice) / priceRange) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function subscribeToHydration() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

function useHydrated() {
  return useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot
  );
}

export function ChallengeDashboard({
  initialState,
}: ChallengeDashboardProps) {
  const hasMounted = useHydrated();
  const [challengeState, setChallengeState] = useState(initialState);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicker, setSelectedTicker] = useState("AAPL");
  const [buyQty, setBuyQty] = useState("1");
  const [sellTicker, setSellTicker] = useState("");
  const [sellQty, setSellQty] = useState("1");
  const [searchResults, setSearchResults] =
    useState<SearchResult[]>(DEFAULT_SEARCH_RESULTS);
  const [popularPrices, setPopularPrices] = useState<Record<string, QuoteSnapshot>>({});
  const [searchError, setSearchError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [benchmarkHistory, setBenchmarkHistory] = useState<ChartPoint[]>([
    {
      timestamp: "initial",
      price:
        initialState.latestPrices[initialState.benchmarkSymbol] ??
        initialState.benchmarkStartPrice,
    },
  ]);
  const [feedback, setFeedback] = useState<{
    message: string | null;
    error: string | null;
  }>({ message: null, error: null });
  const [isPending, startTransition] = useTransition();

  const selectedPrice =
    popularPrices[selectedTicker]?.price ??
    challengeState.latestPrices[selectedTicker] ??
    null;
  const selectedPosition = challengeState.positions.find(
    (position) => position.ticker === sellTicker
  );
  const isComplete = challengeState.status === "completed";

  useEffect(() => {
    const query = searchQuery.trim();

    if (!query) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/market/search?query=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        const payload = (await response.json()) as {
          results?: SearchResult[];
          error?: string;
        };

        if (!response.ok) {
          setSearchResults([]);
          setSearchError(payload.error ?? "Search failed.");
          return;
        }

        const filteredResults = (payload.results ?? [])
          .filter(
            (result) =>
              result.symbol !== BENCHMARK_SYMBOL &&
              (result.exchange === null ||
                SEARCHABLE_EXCHANGES.has(result.exchange.toUpperCase()))
          )
          .slice(0, 4);

        setSearchResults(filteredResults);
        setSearchError(null);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setSearchResults([]);
        setSearchError(
          error instanceof Error ? error.message : "Search failed."
        );
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [searchQuery]);

  useEffect(() => {
    let isCancelled = false;

    const refreshDashboard = async () => {
      try {
        const response = await fetch(
          `/api/challenges/${challengeState.id}/refresh?selectedTicker=${encodeURIComponent(selectedTicker)}`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as {
          state?: ChallengeViewState;
          popularPrices?: Record<string, QuoteSnapshot>;
          refreshedAt?: string;
          error?: string;
        };

        if (!response.ok) {
          if (!isCancelled) {
            setRefreshError(payload.error ?? "Live refresh failed.");
          }
          return;
        }

        if (!isCancelled) {
          if (payload.state) {
            const benchmarkPrice =
              payload.state.latestPrices[payload.state.benchmarkSymbol];

            setChallengeState({
              ...payload.state,
              latestPrices: {
                ...payload.state.latestPrices,
                ...Object.fromEntries(
                  Object.entries(payload.popularPrices ?? {}).map(
                    ([symbol, quote]) => [symbol, quote.price]
                  )
                ),
              },
            });
            if (benchmarkPrice) {
              const refreshedAt = payload.refreshedAt ?? new Date().toISOString();
              setBenchmarkHistory((current) => {
                const previousPoint = current[current.length - 1];

                if (
                  previousPoint &&
                  previousPoint.price === benchmarkPrice &&
                  previousPoint.timestamp === refreshedAt
                ) {
                  return current;
                }

                return [
                  ...current,
                  { timestamp: refreshedAt, price: benchmarkPrice },
                ].slice(-30);
              });
            }
          }
          if (payload.popularPrices) {
            setPopularPrices(payload.popularPrices);
          }
          setLastUpdated(payload.refreshedAt ?? new Date().toISOString());
          setRefreshError(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setRefreshError(
            error instanceof Error ? error.message : "Live refresh failed."
          );
        }
      }
    };

    void refreshDashboard();
    const intervalId = window.setInterval(refreshDashboard, 5_000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [challengeState.id, selectedTicker]);

  const visibleSearchResults = searchQuery.trim()
    ? searchResults
    : [];
  const benchmarkChartPath = buildChartPath(benchmarkHistory, 260, 84);
  const latestBenchmarkPoint = benchmarkHistory[benchmarkHistory.length - 1];
  const marketStatus = getMarketStatus(lastUpdated);

  function handleSelectTicker(ticker: string) {
    setSelectedTicker(ticker);
    setSearchQuery(ticker);
    setFeedback({ message: null, error: null });
  }

  function applyResult(result: {
    state: ChallengeViewState;
    message: string | null;
    error: string | null;
  }) {
    setChallengeState(result.state);
    setFeedback({ message: result.message, error: result.error });
  }

  function handleBuy() {
    const qty = Number.parseInt(buyQty, 10);

    startTransition(async () => {
      const result = await submitBuyOrder({
        challengeId: challengeState.id,
        ticker: selectedTicker,
        qty,
      });

      applyResult(result);
    });
  }

  function handleSell() {
    const qty = Number.parseInt(sellQty, 10);

    startTransition(async () => {
      const result = await submitSellOrder({
        challengeId: challengeState.id,
        ticker: sellTicker || "",
        qty,
      });

      applyResult(result);
    });
  }

  function handleReset() {
    startTransition(async () => {
      const result = await submitResetChallenge({
        challengeId: challengeState.id,
      });

      setSearchQuery("");
      setSelectedTicker("AAPL");
      setBuyQty("1");
      setSellTicker("");
      setSellQty("1");
      setSearchResults(DEFAULT_SEARCH_RESULTS);
      setSearchError(null);
      setBenchmarkHistory([
        {
          timestamp: new Date().toISOString(),
          price:
            result.state.latestPrices[result.state.benchmarkSymbol] ??
            result.state.benchmarkStartPrice,
        },
      ]);
      applyResult(result);
    });
  }

  const summaryCards = [
    { label: "Cash", value: formatCurrency(challengeState.cash) },
    {
      label: "Total Asset Value",
      value: formatCurrency(challengeState.portfolioValue),
    },
    { label: "User Return", value: formatPercent(challengeState.userReturn) },
    {
      label: "Alpha vs Benchmark",
      value: formatPercent(challengeState.alpha),
    },
    {
      label: `Trades Used / ${MAX_TRADES}`,
      value: `${challengeState.tradeCount} / ${challengeState.maxTrades}`,
    },
  ];

  return (
    <section className="rounded-[2rem] border border-panel-border bg-panel p-8 shadow-[0_20px_70px_rgba(22,33,29,0.08)] backdrop-blur-sm sm:p-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold tracking-[0.18em] text-muted uppercase">
            Milestone 8
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Server-Side Paper Trading
          </h1>
          <p className="mt-4 text-lg leading-8 text-muted">
            Search real market symbols, then let the server fetch live quotes,
            validate each trade, and return the updated challenge state.
          </p>
        </div>

        <div className="rounded-2xl border border-panel-border bg-white/80 px-5 py-4 text-sm shadow-sm">
          <p className="text-muted">Benchmark</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {BENCHMARK_SYMBOL}
          </p>
          <div className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-3">
            <span>Start {formatCurrency(challengeState.benchmarkStartPrice)}</span>
            <span>
              Now{" "}
              {challengeState.latestPrices[challengeState.benchmarkSymbol]
                ? formatCurrency(
                    challengeState.latestPrices[challengeState.benchmarkSymbol]!
                  )
                : "--"}
            </span>
            <span>Return {formatPercent(challengeState.benchmarkReturn)}</span>
          </div>
          {hasMounted ? (
            <>
              <div className="mt-4 rounded-2xl bg-[#f6f7f3] px-3 py-3">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>SPY live trend</span>
                  <span>
                    {latestBenchmarkPoint
                      ? formatCurrency(latestBenchmarkPoint.price)
                      : "--"}
                  </span>
                </div>
                <svg
                  viewBox="0 0 260 84"
                  className="mt-3 h-24 w-full"
                  role="img"
                  aria-label="SPY benchmark line chart"
                >
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
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${marketStatus.tone}`}
                >
                  {marketStatus.label}
                </span>
                <span className="text-xs text-muted">
                  As of {formatUpdatedAtEt(lastUpdated)}
                </span>
              </div>
            </>
          ) : null}
          <p className="mt-3 text-xs text-muted">
            Last updated {formatUpdatedAt(lastUpdated)}
          </p>
          <button
            type="button"
            onClick={handleReset}
            disabled={isPending}
            className="mt-4 inline-flex items-center justify-center rounded-full border border-panel-border bg-white px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-[#f5f4ef] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? "Processing..." : "Reset Challenge"}
          </button>
        </div>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <article
            key={card.label}
            className="rounded-2xl border border-panel-border bg-white/80 p-5 shadow-sm"
          >
            <p className="text-sm text-muted">{card.label}</p>
            <p className="mt-3 text-2xl font-semibold text-foreground">
              {card.value}
            </p>
          </article>
        ))}
      </section>

      {feedback.message ? (
        <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {feedback.message}
        </p>
      ) : null}

      {feedback.error ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {feedback.error}
        </p>
      ) : null}

      {refreshError ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Live price refresh paused: {refreshError}
        </p>
      ) : null}

      {isComplete ? (
        <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <p className="text-sm font-semibold tracking-[0.18em] text-emerald-700 uppercase">
            Challenge Complete
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-foreground">
            Final result
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/80 p-4">
              <p className="text-sm text-muted">Portfolio Value</p>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {formatCurrency(challengeState.portfolioValue)}
              </p>
            </div>
            <div className="rounded-xl bg-white/80 p-4">
              <p className="text-sm text-muted">User Return</p>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {formatPercent(challengeState.userReturn)}
              </p>
            </div>
            <div className="rounded-xl bg-white/80 p-4">
              <p className="text-sm text-muted">Alpha vs {BENCHMARK_SYMBOL}</p>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {formatPercent(challengeState.alpha)}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-panel-border bg-white/80 p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Ticker Search
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Search by company name or ticker, or pick a popular stock to
                  get started. SPY stays benchmark-only.
                </p>
              </div>
              <span className="rounded-full bg-[#eef6f4] px-3 py-1 text-xs font-medium text-muted">
                Live symbol search
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Popular picks
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {POPULAR_PICKS.map((pick) => (
                    (() => {
                      const quote = popularPrices[pick.symbol];
                      const changePercent24h = quote?.changePercent24h ?? null;

                      return (
                        <button
                          key={pick.symbol}
                          type="button"
                          onClick={() => handleSelectTicker(pick.symbol)}
                          className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                            selectedTicker === pick.symbol
                              ? "border-transparent bg-foreground text-background"
                              : "border-panel-border bg-[#fbfaf7] text-foreground hover:bg-[#f5f4ef]"
                          }`}
                        >
                          <div className="text-sm font-semibold">{pick.symbol}</div>
                          <div
                            className={`mt-1 text-xs ${
                              selectedTicker === pick.symbol
                                ? "text-background/80"
                                : "text-muted"
                            }`}
                          >
                            {pick.name}
                          </div>
                          <div
                            className={`mt-3 text-sm font-medium ${
                              selectedTicker === pick.symbol
                                ? "text-background"
                                : "text-foreground"
                            }`}
                          >
                            {quote?.price
                              ? formatCurrency(quote.price)
                              : challengeState.latestPrices[pick.symbol]
                                ? formatCurrency(challengeState.latestPrices[pick.symbol]!)
                                : "Loading price..."}
                          </div>
                          <div
                            className={`mt-1 text-xs font-medium ${
                              selectedTicker === pick.symbol
                                ? "text-background/80"
                                : getChangeColor(changePercent24h)
                            }`}
                          >
                            {changePercent24h === null
                              ? "24h change unavailable"
                              : `${formatPercent(changePercent24h)} 24h`}
                          </div>
                        </button>
                      );
                    })()
                  ))}
                </div>
              </div>

              <input
                type="text"
                value={searchQuery}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  setSearchQuery(nextQuery);

                  if (!nextQuery.trim()) {
                    setSearchResults(DEFAULT_SEARCH_RESULTS);
                    setSearchError(null);
                  }
                }}
                placeholder="Search ticker, e.g. AAPL"
                className="w-full rounded-xl border border-panel-border bg-[#fcfcfa] px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-[#89b6ad]"
              />

              <div className="space-y-2">
                {visibleSearchResults.map((result) => (
                  <button
                    key={`${result.symbol}-${result.exchange ?? "unknown"}`}
                    type="button"
                    onClick={() => handleSelectTicker(result.symbol)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                      selectedTicker === result.symbol
                        ? "border-transparent bg-foreground text-background"
                        : "border-panel-border bg-white text-foreground hover:bg-[#f5f4ef]"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {result.symbol}
                      </div>
                      <div
                        className={`mt-1 text-xs ${
                          selectedTicker === result.symbol
                            ? "text-background/80"
                            : "text-muted"
                        }`}
                      >
                        {result.name}
                      </div>
                    </div>
                    {result.exchange ? (
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          selectedTicker === result.symbol
                            ? "bg-white/15 text-background"
                            : "bg-[#f2efe7] text-muted"
                        }`}
                      >
                        {result.exchange}
                      </span>
                    ) : null}
                  </button>
                ))}
                {searchQuery.trim() && visibleSearchResults.length === 0 ? (
                  <p className="text-sm text-muted">
                    No matching stock suggestions found.
                  </p>
                ) : null}
              </div>
              {searchError ? (
                <p className="text-sm text-red-700">{searchError}</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-panel-border bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">Buy Panel</h2>
            <p className="mt-1 text-sm text-muted">
              Buy whole shares only. Each order is validated and executed on the
              server.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-muted">
                <span>Ticker</span>
                <input
                  type="text"
                  value={selectedTicker}
                  readOnly
                  className="w-full rounded-xl border border-panel-border bg-[#f7f7f3] px-4 py-3 text-foreground"
                />
              </label>
              <label className="space-y-2 text-sm text-muted">
                <span>Latest Server Price</span>
                <input
                  type="text"
                  value={
                    selectedPrice === null
                      ? "Fetched on buy"
                      : formatCurrency(selectedPrice)
                  }
                  readOnly
                  className="w-full rounded-xl border border-panel-border bg-[#f7f7f3] px-4 py-3 text-foreground"
                />
              </label>
              <label className="space-y-2 text-sm text-muted">
                <span>Quantity</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={buyQty}
                  onChange={(event) => setBuyQty(event.target.value)}
                  className="w-full rounded-xl border border-panel-border bg-[#fcfcfa] px-4 py-3 text-foreground"
                />
              </label>
              <div className="space-y-2 text-sm text-muted">
                <span>Action</span>
                <button
                  type="button"
                  onClick={handleBuy}
                  disabled={isPending || isComplete}
                  className="w-full rounded-xl bg-foreground px-4 py-3 font-semibold text-background transition-colors hover:bg-[#20302b] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isPending ? "Processing..." : "Buy Shares"}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-panel-border bg-white/80 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Positions
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Current holdings returned from the server after each trade.
                </p>
              </div>
              <span className="rounded-full bg-[#f2efe7] px-3 py-1 text-xs font-medium text-muted">
                {challengeState.positions.length} open
              </span>
            </div>

            {challengeState.positions.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-panel-border bg-[#fbfaf7] px-5 py-8 text-center text-sm text-muted">
                No positions yet. Buy your first stock to populate this section.
              </div>
            ) : (
              <PositionsList
                positions={challengeState.positions}
                latestPrices={challengeState.latestPrices}
              />
            )}
          </section>

          <section className="rounded-2xl border border-panel-border bg-white/80 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Trade History
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Every fill is created on the server and returned to the UI.
                </p>
              </div>
              <span className="rounded-full bg-[#f2efe7] px-3 py-1 text-xs font-medium text-muted">
                {challengeState.tradeCount} total
              </span>
            </div>

            {challengeState.trades.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-panel-border bg-[#fbfaf7] px-5 py-8 text-center text-sm text-muted">
                No trades yet. Your first buy or sell will appear here.
              </div>
            ) : (
              <TradeHistory trades={challengeState.trades} />
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-panel-border bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">Sell Action</h2>
            <p className="mt-1 text-sm text-muted">
              Sell only shares you already own. The server validates ownership
              and quantity before applying the trade.
            </p>

            <div className="mt-5 space-y-4">
              <label className="space-y-2 text-sm text-muted">
                <span>Position</span>
                <select
                  value={sellTicker}
                  onChange={(event) => setSellTicker(event.target.value)}
                  className="w-full rounded-xl border border-panel-border bg-[#fcfcfa] px-4 py-3 text-foreground"
                >
                  <option value="">Select a position</option>
                  {challengeState.positions.map((position) => (
                    <option key={position.ticker} value={position.ticker}>
                      {position.ticker} ({position.qty} shares)
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-muted">
                <span>Quantity to Sell</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={sellQty}
                  onChange={(event) => setSellQty(event.target.value)}
                  className="w-full rounded-xl border border-panel-border bg-[#fcfcfa] px-4 py-3 text-foreground"
                />
              </label>
              <div className="rounded-xl bg-[#fbfaf7] px-4 py-3 text-sm text-muted">
                Current price:{" "}
                <span className="font-semibold text-foreground">
                  {sellTicker && challengeState.latestPrices[sellTicker]
                    ? formatCurrency(challengeState.latestPrices[sellTicker]!)
                    : "--"}
                </span>
              </div>
              {selectedPosition ? (
                <div className="rounded-xl bg-[#fbfaf7] px-4 py-3 text-sm text-muted">
                  Shares owned:{" "}
                  <span className="font-semibold text-foreground">
                    {selectedPosition.qty}
                  </span>
                </div>
              ) : null}
              <button
                type="button"
                onClick={handleSell}
                disabled={isPending || isComplete}
                className="w-full rounded-xl border border-panel-border bg-white px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-[#f5f4ef] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPending ? "Processing..." : "Sell Shares"}
              </button>
            </div>
          </section>
        </aside>
      </section>
    </section>
  );
}

function PositionsList({
  positions,
  latestPrices,
}: {
  positions: ChallengePosition[];
  latestPrices: Record<string, number>;
}) {
  return (
    <div className="mt-5 space-y-3">
      {positions.map((position) => {
        const latestPrice = latestPrices[position.ticker] ?? position.avgCost;
        const marketValue = position.qty * latestPrice;

        return (
          <div
            key={position.ticker}
            className="grid gap-3 rounded-2xl border border-panel-border bg-[#fbfaf7] p-4 sm:grid-cols-5"
          >
            <div>
              <p className="text-sm text-muted">Ticker</p>
              <p className="mt-1 font-semibold text-foreground">
                {position.ticker}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Qty</p>
              <p className="mt-1 font-semibold text-foreground">
                {position.qty}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Avg Cost</p>
              <p className="mt-1 font-semibold text-foreground">
                {formatCurrency(position.avgCost)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Latest Price</p>
              <p className="mt-1 font-semibold text-foreground">
                {formatCurrency(latestPrice)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Market Value</p>
              <p className="mt-1 font-semibold text-foreground">
                {formatCurrency(marketValue)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TradeHistory({ trades }: { trades: ChallengeTrade[] }) {
  return (
    <div className="mt-5 space-y-3">
      {trades.map((trade) => (
        <div
          key={trade.id}
          className="grid gap-3 rounded-2xl border border-panel-border bg-[#fbfaf7] p-4 sm:grid-cols-5"
        >
          <div>
            <p className="text-sm text-muted">Trade #</p>
            <p className="mt-1 font-semibold text-foreground">
              {trade.tradeNumber}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted">Side</p>
            <p className="mt-1 font-semibold capitalize text-foreground">
              {trade.side}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted">Ticker</p>
            <p className="mt-1 font-semibold text-foreground">
              {trade.ticker}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted">Qty</p>
            <p className="mt-1 font-semibold text-foreground">
              {trade.qty}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted">Price</p>
            <p className="mt-1 font-semibold text-foreground">
              {formatCurrency(trade.executedPrice)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
