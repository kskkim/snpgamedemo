"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type {
  V3Asset,
  V3AssetsPayload,
  V3BenchmarkPoint,
} from "@/lib/market-data/coingecko-v3";

type PortfolioEntry = {
  symbol: string;
  allocation: number;
};

type V3PlayerProfile = {
  id: string;
  email: string;
  walletAddress: string;
};

type V3StockPickerProps = {
  initialData: V3AssetsPayload;
  loadError?: string | null;
};

type V3AssetsApiResponse = V3AssetsPayload & {
  error?: string;
};

type GameStep = "start" | "select" | "play" | "result";

type PlaybackAsset = {
  asset: V3Asset;
  startingPrice: number;
  series: V3BenchmarkPoint[];
  shares: number;
};

type ActiveRun = {
  startedAt: number;
  durationMs: number;
  entries: PortfolioEntry[];
  cash: number;
  assets: PlaybackAsset[];
  benchmarkSeries: V3BenchmarkPoint[];
  benchmarkStart: number;
  benchmarkEnd: number;
  liveIds: string[];
  runId: string | null;
  resultSaved: boolean;
};

const STARTING_BUDGET = 10_000;
const GAME_DURATION_MS = 24 * 60 * 60 * 1000;
const RULES = [
  "Build your portfolio with $10,000 in tokenized stocks.",
  "Compete against the S&P 500 over a 24-hour run.",
  "Outperform the S&P 500 to win.",
];
const RULES_NOTE =
  "Replay anytime. Every win earns 200 Treasures Points. The Pokemon slab is only awarded on your first win.";
const LEGAL = [
  "We reserve the right to determine winners and enforce fair use.",
  "Market data is sourced from CoinGecko, with prices averaged across Ondo and xStocks where applicable. Accuracy is not guaranteed.",
  "Users may not create or use multiple accounts to participate.",
  "Prices outside market hours may differ due to liquidity conditions across venues.",
  "Prizes are issued as a Collector Crypt NFT representing an underlying physical card.",
  "Physical fulfillment is managed by Collector Crypt.",
];
const LINE_COLORS = ["#2563eb", "#ff6b00", "#00a76f", "#e11d48", "#7c3aed", "#0891b2", "#d97706", "#4f46e5"];
const V3_SESSION_KEY = "v3-game-playback-state";
const V3_SESSION_VERSION = 3;
const V3_PLAYER_KEY = "v3-game-player-profile";
const ALLOCATION_STEP = 100;
const MAX_PORTFOLIO_SIZE = 8;
const LIVE_REFRESH_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const SHOW_TIMER_DEBUG = true;

type PersistedV3State = {
  version: number;
  step: GameStep;
  showRules: boolean;
  searchQuery: string;
  portfolio: PortfolioEntry[];
  activeRun: ActiveRun | null;
};

type PlayerResponse = {
  player?: {
    id: string;
    email: string;
    walletAddress: string;
  };
  error?: string;
};

type RunStartResponse = {
  run?: { id: string };
  error?: string;
};

type PersistedAllocation = {
  symbol: string;
  allocation: number;
  startingPrice?: number | null;
  shares?: number | null;
};

type ActiveRunResponse = {
  run?: {
    id: string;
    selected_symbols: string[];
    allocations: PersistedAllocation[] | null;
    duration_seconds: number;
    benchmark_symbol: string;
    benchmark_start_price: number | null;
    started_at: string;
    ends_at: string;
    status: string;
  } | null;
  snapshots?: Array<{
    captured_at: string;
    portfolio_value: number;
    benchmark_value: number;
    holdings_value: Array<{ symbol?: string; value?: number }> | null;
  }>;
  error?: string;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatChartCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatUtcClock(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function formatUpdatedAt(isoString: string | null | undefined): string {
  if (!isoString) {
    return "Update time unavailable";
  }

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return "Update time unavailable";
  }

  return `Updated ${formatUtcClock(date.getTime())} UTC`;
}

function formatMarketCap(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `${formatCompactNumber(value / 1_000_000_000_000)}T`;
  }

  if (value >= 1_000_000_000) {
    return `${formatCompactNumber(value / 1_000_000_000)}B`;
  }

  if (value >= 1_000_000) {
    return `${formatCompactNumber(value / 1_000_000)}M`;
  }

  return formatCurrency(value);
}

function formatStockSymbol(symbol: string): string {
  return symbol.endsWith("ON") ? symbol.slice(0, -2) : symbol;
}

function formatShortWalletAddress(value: string): string {
  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatProfileName(profile: V3PlayerProfile | null): string {
  if (!profile) {
    return "Guest";
  }

  const emailName = profile.email.split("@")[0]?.trim();

  if (emailName) {
    return emailName;
  }

  return formatShortWalletAddress(profile.walletAddress);
}

function ProfileMenu({
  profile,
}: {
  profile: V3PlayerProfile | null;
}) {
  if (!profile) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 rounded-full border border-white/16 bg-white/10 px-4 py-2.5 text-left text-white shadow-[0_10px_24px_rgba(0,0,0,0.16)]">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(20,66,92,0.94)] text-sm font-semibold uppercase">
        {formatProfileName(profile).slice(0, 1)}
      </span>
      <span className="min-w-0">
        <span className="block max-w-[140px] truncate text-sm font-semibold">
          {formatProfileName(profile)}
        </span>
        <span className="block max-w-[140px] truncate text-xs text-white/68">
          {formatShortWalletAddress(profile.walletAddress)}
        </span>
      </span>
    </div>
  );
}

function EmptyPortfolioSlot() {
  return (
    <div className="relative flex aspect-[1/0.72] items-center justify-center overflow-hidden rounded-[0.9rem] border border-white/12 bg-[rgba(8,26,38,0.14)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <svg
        aria-hidden="true"
        viewBox="0 0 120 120"
        className="pointer-events-none absolute inset-0 m-auto h-10 w-10 text-white/[0.08]"
      >
        <circle cx="60" cy="60" r="28" fill="none" stroke="currentColor" strokeWidth="4" />
        <circle cx="60" cy="60" r="6" fill="currentColor" />
        <path
          d="M60 18v18M60 84v18M18 60h18M84 60h18"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M33 33l10 10M77 77l10 10M87 33 77 43M43 77 33 87"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-[0.75rem] border-[2px] border-white/16 bg-white/[0.03] text-3xl font-light leading-none text-white/85">
        +
      </div>
    </div>
  );
}

function formatCompactNumber(value: number): string {
  return value >= 100 ? value.toFixed(0) : value.toFixed(2).replace(/\.00$/, "");
}

function formatTimer(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildActiveRunFromPersistedData(
  run: NonNullable<ActiveRunResponse["run"]>,
  snapshots: NonNullable<ActiveRunResponse["snapshots"]>,
  assetMap: Record<string, V3Asset>,
  benchmarkAsset: V3Asset | null
): ActiveRun {
  const startedAt = new Date(run.started_at).getTime();
  const durationMs = run.duration_seconds * 1000;
  const allocations = Array.isArray(run.allocations) ? run.allocations : [];
  const entries = allocations.map((entry) => ({
    symbol: entry.symbol,
    allocation: entry.allocation,
  }));

  const assets = allocations
    .map((entry) => {
      const asset = assetMap[entry.symbol];

      if (!asset || typeof entry.startingPrice !== "number" || typeof entry.shares !== "number") {
        return null;
      }

      const series: V3BenchmarkPoint[] = [
        {
          timestamp: startedAt,
          price_usd: entry.startingPrice,
        },
      ];

      for (const snapshot of snapshots) {
        const capturedAt = new Date(snapshot.captured_at).getTime();
        const holdings = Array.isArray(snapshot.holdings_value) ? snapshot.holdings_value : [];
        const holding = holdings.find((item) => item?.symbol === entry.symbol);

        if (!holding || typeof holding.value !== "number" || entry.shares <= 0) {
          continue;
        }

        series.push({
          timestamp: capturedAt,
          price_usd: holding.value / entry.shares,
        });
      }

      return {
        asset,
        startingPrice: entry.startingPrice,
        shares: entry.shares,
        series,
      } satisfies PlaybackAsset;
    })
    .filter((entry): entry is PlaybackAsset => entry !== null);

  const benchmarkStart = run.benchmark_start_price ?? benchmarkAsset?.price_usd ?? 100;
  const benchmarkSeries: V3BenchmarkPoint[] = [
    {
      timestamp: startedAt,
      price_usd: benchmarkStart,
    },
  ];

  for (const snapshot of snapshots) {
    const capturedAt = new Date(snapshot.captured_at).getTime();
    benchmarkSeries.push({
      timestamp: capturedAt,
      price_usd: benchmarkStart * (snapshot.benchmark_value / STARTING_BUDGET),
    });
  }

  const selectedIds = entries
    .map((entry) => assetMap[entry.symbol]?.id)
    .filter((id): id is string => Boolean(id));

  return {
    startedAt,
    durationMs,
    entries,
    cash: Math.max(0, STARTING_BUDGET - entries.reduce((sum, entry) => sum + entry.allocation, 0)),
    assets,
    benchmarkSeries,
    benchmarkStart,
    benchmarkEnd: benchmarkSeries.at(-1)?.price_usd ?? benchmarkStart,
    liveIds: Array.from(
      new Set([
        ...selectedIds,
        ...(benchmarkAsset ? [benchmarkAsset.id] : []),
      ])
    ),
    runId: run.id,
    resultSaved: run.status === "completed",
  };
}

function getChartCoordinate(
  point: number,
  index: number,
  pointCount: number,
  width: number,
  height: number,
  min: number,
  range: number,
  visibleSlots?: number
) {
  const slotCount = Math.max(pointCount, visibleSlots ?? pointCount, 2);
  const x = slotCount <= 1 ? 0 : (index / (slotCount - 1)) * width;
  const y = height - ((point - min) / range) * (height - 16) - 8;

  return {
    x,
    y,
  };
}

function buildChartPath(points: number[], width: number, height: number, visibleSlots?: number): string {
  if (points.length === 0) {
    return "";
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  return points
    .map((point, index) => {
      const coordinate = getChartCoordinate(point, index, points.length, width, height, min, range, visibleSlots);
      return `${coordinate.x.toFixed(1)},${coordinate.y.toFixed(1)}`;
    })
    .join(" ");
}

function getVisibleSeries(series: V3BenchmarkPoint[], progress: number): V3BenchmarkPoint[] {
  if (series.length <= 2) {
    return series;
  }

  const visibleCount = Math.max(2, Math.min(series.length, Math.ceil(progress * (series.length - 1)) + 1));
  return series.slice(0, visibleCount);
}

function getChartSeries(series: V3BenchmarkPoint[], startedAt: number, elapsedMs: number): V3BenchmarkPoint[] {
  if (series.length === 0) {
    return [];
  }

  const completedSteps = Math.min(
    Math.floor(GAME_DURATION_MS / HOUR_MS),
    Math.max(0, Math.floor(elapsedMs / HOUR_MS))
  );

  const points: V3BenchmarkPoint[] = [series[0]];

  for (let step = 1; step <= completedSteps; step += 1) {
    const cutoff = startedAt + step * HOUR_MS;
    const point = [...series].reverse().find((entry) => entry.timestamp <= cutoff) ?? points[points.length - 1];
    points.push(point);
  }

  if (points.length === 1) {
    return [points[0], points[0]];
  }

  return points;
}

function AssetAvatar({ asset, size = "lg" }: { asset: V3Asset; size?: "lg" | "sm" }) {
  const classes = size === "sm" ? "size-8 rounded-xl text-xs" : "size-10 rounded-2xl text-sm";

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden bg-[#eff4f2] font-semibold text-foreground ${classes}`}
    >
      {asset.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.logo_url}
          alt={`${asset.name} logo`}
          className="size-full object-cover"
        />
      ) : (
        asset.symbol.slice(0, 1)
      )}
    </span>
  );
}

function MoverList({
  title,
  assets,
  onAdd,
  addedSymbols,
  canAddMore,
}: {
  title: string;
  assets: V3Asset[];
  onAdd: (symbol: string) => void;
  addedSymbols: Set<string>;
  canAddMore: boolean;
}) {
  return (
    <section className="rounded-2xl border border-panel-border bg-white/75 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">24h</p>
      </div>
      <div className="mt-3 space-y-2">
        {assets.map((asset) => {
          const isAdded = addedSymbols.has(asset.symbol);

          return (
            <button
              type="button"
              key={asset.id}
              onClick={() => onAdd(asset.symbol)}
              disabled={isAdded || !canAddMore}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl bg-[#f6f7f3] px-3 py-2 text-left transition-colors hover:bg-[#eef2ee] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <AssetAvatar asset={asset} size="sm" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">{formatStockSymbol(asset.symbol)}</p>
                  <p className="truncate text-[11px] text-muted">{asset.name}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-foreground">{formatCurrency(asset.price_usd)}</p>
                <p
                  className={`text-[11px] font-semibold ${
                    asset.change_24h >= 0 ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {formatPercent(asset.change_24h)}
                </p>
              </div>
              <span className="rounded-full border border-panel-border bg-white px-2.5 py-1 text-[10px] font-semibold text-foreground">
                {isAdded ? "Added" : "Add"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BenchmarkCard({
  asset,
  chartPoints,
}: {
  asset: V3Asset | null;
  chartPoints: V3AssetsPayload["benchmark_chart"];
}) {
  if (!asset) {
    return (
      <section className="mt-6 rounded-2xl border border-panel-border bg-white/75 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">S&amp;P 500 Benchmark</h2>
        <p className="mt-2 text-sm text-muted">SPYON benchmark data is unavailable right now.</p>
      </section>
    );
  }

  const path = buildChartPath(
    chartPoints.length > 0 ? chartPoints.map((point) => point.price_usd) : [42, 40, 38, 36, 34, 32, 30],
    210,
    72
  );
  const isUp = asset.change_24h >= 0;

  return (
    <section className="mt-6 rounded-2xl border border-panel-border bg-white/75 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">S&amp;P 500 Benchmark</h2>
          <p className="mt-1 text-sm text-muted">SPYON · Last 24H</p>
          <p className="mt-4 text-3xl font-semibold text-foreground">{formatCurrency(asset.price_usd)}</p>
          <p className={`mt-2 text-sm font-semibold ${isUp ? "text-emerald-600" : "text-red-500"}`}>
            {formatPercent(asset.change_24h)}
          </p>
        </div>
        <div className="w-full max-w-[360px] rounded-2xl bg-[#f6f7f3] px-4 py-3">
          <svg viewBox="0 0 210 72" className="h-28 w-full" aria-label="SPYON benchmark chart">
            <defs>
              <linearGradient id="benchmark-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity="0.16" />
                <stop offset="100%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`M0,64 ${path} 210,64`} fill="url(#benchmark-fill)" />
            <polyline
              fill="none"
              stroke={isUp ? "#10b981" : "#ef4444"}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={path}
            />
          </svg>
        </div>
      </div>
    </section>
  );
}

function StartScreen({
  onStart,
  onToggleRules,
  showRules,
  isRefreshing,
}: {
  onStart: () => void;
  onToggleRules: () => void;
  showRules: boolean;
  isRefreshing: boolean;
}) {
  const [showLegal, setShowLegal] = useState(false);

  return (
    <section
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12 text-center text-white sm:px-10"
      style={{
        backgroundImage:
          "linear-gradient(rgba(11, 29, 34, 0.28), rgba(11, 29, 34, 0.4)), url('/treasures-home-bg.png')",
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_38%),linear-gradient(to_top,rgba(223,150,78,0.34),transparent_24%)]" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center">
        <h1 className="max-w-5xl text-5xl font-semibold tracking-tight drop-shadow-[0_10px_30px_rgba(0,0,0,0.32)] sm:text-6xl lg:text-8xl">
          The Treasures Challenge
        </h1>
        <p className="mt-6 max-w-5xl text-2xl font-semibold leading-tight drop-shadow-[0_6px_18px_rgba(0,0,0,0.28)] sm:text-3xl lg:text-[2.7rem]">
          Beat the S&amp;P 500 over 24 hours to win a Pokemon Slab &amp; Treasures Points
        </p>

        <div className="mt-14 flex w-full max-w-[860px] flex-col items-center gap-6">
          <button
            type="button"
            onClick={onStart}
            disabled={isRefreshing}
            className="flex min-h-[110px] w-full items-center justify-center rounded-[2rem] border border-white/18 bg-[linear-gradient(180deg,rgba(31,103,141,0.95),rgba(20,81,112,0.96))] px-8 text-2xl font-semibold text-white shadow-[0_18px_46px_rgba(0,0,0,0.3)] backdrop-blur-[2px] transition-transform duration-150 hover:-translate-y-1 hover:bg-[linear-gradient(180deg,rgba(36,115,156,0.98),rgba(20,81,112,0.98))] disabled:cursor-not-allowed disabled:opacity-60 sm:text-3xl"
          >
            {isRefreshing ? "Refreshing..." : "Start Challenge"}
          </button>

          <div className="grid w-full max-w-[560px] grid-cols-1 gap-6 sm:grid-cols-2">
            <button
              type="button"
              onClick={onToggleRules}
              className="flex min-h-[126px] items-center justify-center rounded-[1.75rem] border border-white/18 bg-[rgba(18,82,114,0.88)] px-8 text-2xl font-semibold text-white shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-[2px] transition-transform duration-150 hover:-translate-y-1 hover:bg-[rgba(22,92,126,0.94)]"
            >
              Rules
            </button>
            <Link
              href="/v3/leaderboard"
              className="flex min-h-[126px] items-center justify-center rounded-[1.75rem] border border-white/18 bg-[rgba(18,82,114,0.88)] px-8 text-2xl font-semibold text-white shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-[2px] transition-transform duration-150 hover:-translate-y-1 hover:bg-[rgba(22,92,126,0.94)]"
            >
              Leaderboard
            </Link>
          </div>
        </div>
      </div>

      {showRules ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6 py-10">
          <button
            type="button"
            aria-label="Close rules"
            onClick={onToggleRules}
            className="absolute inset-0 bg-[rgba(6,12,18,0.44)] backdrop-blur-lg"
          />
          <div className="relative z-10 flex w-full max-w-5xl flex-col items-center">
            <div className="flex max-h-[78vh] w-full flex-col overflow-hidden rounded-[2.2rem] border border-white/16 bg-[linear-gradient(180deg,rgba(10,24,32,0.95),rgba(14,26,34,0.92))] text-left shadow-[0_30px_80px_rgba(0,0,0,0.42)]">
              <div className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-7 py-6 sm:px-10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.28em] text-[#f8cf86]/78 uppercase">
                      Captain's Briefing
                    </p>
                    <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                      How the challenge works
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62 sm:text-base">
                      Compete agaisnt a shadow portfolio of $10K in the S&amp;P 500 over 24 hours
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleRules}
                    className="rounded-full border border-white/14 bg-white/8 px-4 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/14"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="rules-scroll flex-1 overflow-y-auto px-7 py-6 sm:px-10">
                <div className="space-y-4">
                  {RULES.map((rule, index) => (
                    <div
                      key={rule}
                      className="animate-[fadeInUp_420ms_ease-out_forwards] rounded-[1.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(35,51,62,0.9),rgba(27,42,52,0.92))] px-5 py-4 opacity-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                      style={{ animationDelay: `${index * 140}ms` }}
                    >
                      <p className="text-lg leading-8 text-white/92 sm:text-xl">
                        <span className="mr-3 font-semibold text-[#f8cf86]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {rule}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-6">
                  <div
                    className="animate-[fadeInUp_420ms_ease-out_forwards] rounded-[1.15rem] border border-white/8 bg-[rgba(9,16,22,0.44)] px-4 py-4 text-sm leading-7 text-white/74 opacity-0 sm:text-base"
                    style={{ animationDelay: `${RULES.length * 140}ms` }}
                  >
                    {RULES_NOTE}
                  </div>
                </div>

                <div
                  className="animate-[fadeInUp_420ms_ease-out_forwards] mt-8 opacity-0"
                  style={{ animationDelay: `${RULES.length * 140 + 120}ms` }}
                >
                  <div className="flex flex-col items-center gap-3 text-center">
                    <button
                      type="button"
                      onClick={() => setShowLegal((current) => !current)}
                      className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[11px] font-semibold tracking-[0.16em] text-white/70 uppercase transition-colors hover:bg-white/10 hover:text-white"
                    >
                      {showLegal ? "Show less" : "Read more"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/10 bg-black/12 px-7 py-4 sm:px-10">
                <div className="flex items-center justify-end gap-4">
                  <button
                    type="button"
                    onClick={onToggleRules}
                    className="rounded-full border border-white/12 bg-white/8 px-5 py-2.5 text-sm font-semibold text-white/78 transition-colors hover:bg-white/12 hover:text-white"
                  >
                    Return to Menu
                  </button>
                </div>
              </div>
            </div>

            {showLegal ? (
              <div className="mt-8 max-w-4xl text-center text-sm leading-6 text-white/72">
                <p className="text-lg font-medium text-white/86">Terms and Legal</p>
                <div className="mt-3 space-y-1">
                  {LEGAL.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.6rem] border border-panel-border bg-white/85 p-5 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function PlaybackChart({
  run,
}: {
  run: ActiveRun;
}) {
  const [selectedHourIndex, setSelectedHourIndex] = useState(0);
  const elapsedMs = Math.min(run.durationMs, Math.max(0, Date.now() - run.startedAt));
  const latestTimestamp = Math.min(run.startedAt + elapsedMs, Date.now());
  const totalHourSlots = Math.min(24, Math.max(1, Math.floor(elapsedMs / HOUR_MS) + 1));
  const hourSlots = Array.from({ length: totalHourSlots }, (_, index) => {
    const timestamp =
      index === 0
        ? run.startedAt
        : Math.min(run.startedAt + index * HOUR_MS, latestTimestamp);
    return {
      hour: index + 1,
      timestamp,
      label: formatUtcClock(timestamp),
    };
  });

  useEffect(() => {
    setSelectedHourIndex((current) =>
      Math.min(current, Math.max(hourSlots.length - 1, 0))
    );
  }, [hourSlots.length]);

  useEffect(() => {
    setSelectedHourIndex(hourSlots.length - 1);
  }, [hourSlots.length, latestTimestamp]);

  const visibleSlots = hourSlots.slice(0, Math.max(0, selectedHourIndex + 1));
  const displaySlotCount = Math.max(6, hourSlots.length || 0);
  const displaySlots = Array.from({ length: displaySlotCount }, (_, index) => {
    const visibleSlot = hourSlots[index];

    if (visibleSlot) {
      return visibleSlot;
    }

    const timestamp = run.startedAt + index * HOUR_MS;
    return {
      hour: index + 1,
      timestamp,
      label: formatUtcClock(timestamp),
      empty: true,
    };
  });

  const stackedSeries = run.assets.map((entry, index) => {
    const color = LINE_COLORS[index % LINE_COLORS.length];
    const values = hourSlots.map((slot, slotIndex) => {
      if (slotIndex === 0) {
        return entry.shares * entry.startingPrice;
      }

      const point =
        [...entry.series].reverse().find((seriesPoint) => seriesPoint.timestamp <= slot.timestamp) ??
        entry.series[0];
      const price = point?.price_usd ?? entry.startingPrice;
      return entry.shares * price;
    });

    return {
      label: formatStockSymbol(entry.asset.symbol),
      color,
      values,
    };
  });

  const benchmarkValues = hourSlots.map((slot, slotIndex) => {
    if (slotIndex === 0) {
      return STARTING_BUDGET;
    }

    const point =
      [...run.benchmarkSeries].reverse().find((seriesPoint) => seriesPoint.timestamp <= slot.timestamp) ??
      run.benchmarkSeries[0];
    const price = point?.price_usd ?? run.benchmarkStart;
    return STARTING_BUDGET * (price / run.benchmarkStart);
  });

  const portfolioTotals = hourSlots.map((_, index) =>
    run.cash + stackedSeries.reduce((sum, series) => sum + series.values[index], 0)
  );

  const maxValue = Math.max(
    STARTING_BUDGET,
    ...portfolioTotals,
    ...benchmarkValues.filter((value): value is number => value !== null),
    1
  );
  const chartMax = Math.ceil(maxValue / 2000) * 2000;
  const yTicks = Array.from({ length: Math.floor(chartMax / 2000) + 1 }, (_, index) => chartMax - index * 2000);
  const chartWidth = 860;
  const chartHeight = 320;
  const plotLeft = 78;
  const plotRight = 76;
  const plotTop = 20;
  const plotBottom = 58;
  const plotWidth = chartWidth - plotLeft - plotRight;
  const plotHeight = chartHeight - plotTop - plotBottom;
  const slotSpacing = plotWidth / Math.max(displaySlots.length, 1);
  const barWidth = Math.min(40, Math.max(10, slotSpacing * 0.52));

  function getY(value: number): number {
    return plotTop + plotHeight - (value / chartMax) * plotHeight;
  }

  const benchmarkPoints = benchmarkValues
    .map((value, index) => {
      if (value === null || index > selectedHourIndex) {
        return null;
      }
      const x = plotLeft + slotSpacing * index + slotSpacing / 2;
      const y = getY(value);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter((point): point is string => point !== null)
    .join(" ");

  return (
    <section className="rounded-[1.4rem] border border-[#4e6370]/16 bg-white px-5 py-5 shadow-[0_12px_28px_rgba(0,0,0,0.06)]">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" aria-label="Portfolio timelapse chart">
        {yTicks.map((value) => {
          const y = getY(value);
          return (
            <g key={value}>
              <line x1={plotLeft} x2={chartWidth - plotRight} y1={y} y2={y} stroke="#d9d9d9" strokeWidth="1" />
              <text x={plotLeft - 14} y={y + 6} textAnchor="end" fontSize="14" fill="#3a3a3a">
                {formatChartCurrency(value)}
              </text>
            </g>
          );
        })}

        {displaySlots.map((slot, slotIndex) => {
          const xCenter = plotLeft + slotSpacing * slotIndex + slotSpacing / 2;
          let stackedTop = plotTop + plotHeight;
          const hasData = !("empty" in slot);
          const portfolioTotal = hasData ? portfolioTotals[slotIndex] : null;

          return (
            <g key={slot.timestamp}>
              {hasData && slotIndex <= selectedHourIndex
                ? stackedSeries.map((series) => {
                    const value = series.values[slotIndex];
                    const barHeight = (value / chartMax) * plotHeight;
                    stackedTop -= barHeight;

                    if (value <= 0) {
                      return null;
                    }

                    return (
                      <rect
                        key={`${series.label}-${slot.timestamp}`}
                        x={xCenter - barWidth / 2}
                        y={stackedTop}
                        width={barWidth}
                        height={barHeight}
                        fill={series.color}
                        opacity="0.9"
                      />
                    );
                  })
                : null}
              {hasData && slotIndex <= selectedHourIndex && portfolioTotal !== null ? (
                <text
                  x={xCenter}
                  y={Math.max(getY(portfolioTotal) - 22, plotTop - 2)}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="700"
                  fill="#0f766e"
                >
                  {formatChartCurrency(portfolioTotal)}
                </text>
              ) : null}
              <text x={xCenter} y={chartHeight - 26} textAnchor="middle" fontSize="13" fill="#222">
                {slot.label}
              </text>
            </g>
          );
        })}

        {benchmarkPoints ? (
          <polyline
            fill="none"
            stroke="#17324f"
            strokeWidth="4"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={benchmarkPoints}
          />
        ) : null}
        {benchmarkValues.map((value, index) => {
          if (value === null || index > selectedHourIndex) {
            return null;
          }

          const x = plotLeft + slotSpacing * index + slotSpacing / 2;
          const y = getY(value);

          return (
            <g key={`benchmark-${hourSlots[index]?.timestamp ?? index}`}>
              <circle cx={x} cy={y} r="3.5" fill="#17324f" />
              <text
                x={x + 8}
                y={Math.max(y - 6, plotTop + 10)}
                fontSize="12"
                fontWeight="600"
                fill="#17324f"
              >
                {formatChartCurrency(value)}
              </text>
            </g>
          );
        })}

        <line x1={plotLeft} x2={plotLeft} y1={plotTop} y2={plotTop + plotHeight} stroke="#3a3a3a" strokeWidth="1.5" />
        <line x1={chartWidth - plotRight} x2={chartWidth - plotRight} y1={plotTop} y2={plotTop + plotHeight} stroke="#3a3a3a" strokeWidth="1.5" />
        <line x1={plotLeft} x2={chartWidth - plotRight} y1={plotTop + plotHeight} y2={plotTop + plotHeight} stroke="#3a3a3a" strokeWidth="1.5" />
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm font-medium text-[#222]">
        <span className="flex items-center gap-2">
          <span className="h-[3px] w-10 rounded-full bg-[#17324f]" />
          S&amp;P 500
        </span>
        {stackedSeries.map((series) => (
          <span key={series.label} className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-sm" style={{ backgroundColor: series.color }} />
            {series.label}
          </span>
        ))}
      </div>

      {hourSlots.length > 6 ? (
        <div className="mt-5 px-2">
          <div className="flex items-center justify-between text-xs font-semibold tracking-[0.12em] text-[#5a6670] uppercase">
            <span>Hour 1</span>
            <span>Latest Hour</span>
          </div>
          <input
            type="range"
            min="0"
            max={Math.max(hourSlots.length - 1, 0)}
            step="1"
            value={selectedHourIndex}
            onChange={(event) => setSelectedHourIndex(Number(event.target.value))}
            className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-[#d9e1e7] accent-[#1b6890]"
            aria-label="Timelapse hour slider"
          />
        </div>
      ) : null}
    </section>
  );
}

export function V3StockPicker({ initialData, loadError }: V3StockPickerProps) {
  const [step, setStep] = useState<GameStep>("start");
  const [currentData, setCurrentData] = useState(initialData);
  const [currentLoadError, setCurrentLoadError] = useState<string | null>(loadError ?? null);
  const [isRefreshingStartData, setIsRefreshingStartData] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [portfolio, setPortfolio] = useState<PortfolioEntry[]>([]);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [remainingMs, setRemainingMs] = useState(GAME_DURATION_MS);
  const [tickCount, setTickCount] = useState(0);
  const [lastSnapshotAt, setLastSnapshotAt] = useState<number | null>(null);
  const [hasRestoredState, setHasRestoredState] = useState(false);
  const [playerProfile, setPlayerProfile] = useState<V3PlayerProfile | null>(null);
  const [profileForm, setProfileForm] = useState({ email: "", walletAddress: "" });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [showProfileGate, setShowProfileGate] = useState(false);
  const [showEndChallengeConfirm, setShowEndChallengeConfirm] = useState(false);

  const assetMap = useMemo(
    () => Object.fromEntries(currentData.assets.map((asset) => [asset.symbol, asset])),
    [currentData.assets]
  );
  const portfolioMap = useMemo(
    () => Object.fromEntries(portfolio.map((entry) => [entry.symbol, entry])),
    [portfolio]
  );
  const addedSymbols = useMemo(() => new Set(portfolio.map((entry) => entry.symbol)), [portfolio]);
  const totalCommitted = portfolio.reduce((sum, entry) => sum + entry.allocation, 0);
  const remainingCash =
    STARTING_BUDGET - totalCommitted;
  const canAddToPortfolio = portfolio.length < MAX_PORTFOLIO_SIZE && remainingCash > 0;
  const liveIdsKey = useMemo(
    () => (activeRun?.liveIds?.length ? activeRun.liveIds.join(",") : ""),
    [activeRun?.liveIds]
  );

  useEffect(() => {
    try {
      const rawState = window.localStorage.getItem(V3_SESSION_KEY);
      const rawPlayer = window.localStorage.getItem(V3_PLAYER_KEY);

      if (rawPlayer) {
        const parsedPlayer = JSON.parse(rawPlayer) as V3PlayerProfile;
        if (parsedPlayer?.id && parsedPlayer?.email && parsedPlayer?.walletAddress) {
          setPlayerProfile(parsedPlayer);
          setProfileForm({ email: parsedPlayer.email, walletAddress: parsedPlayer.walletAddress });
        }
      }

      if (rawState) {
        const parsed = JSON.parse(rawState) as PersistedV3State;

        if (parsed.version !== V3_SESSION_VERSION) {
          window.localStorage.removeItem(V3_SESSION_KEY);
        } else {
        if (parsed.step) {
          setStep(parsed.step);
        }

        if (typeof parsed.showRules === "boolean") {
          setShowRules(parsed.showRules);
        }

        if (typeof parsed.searchQuery === "string") {
          setSearchQuery(parsed.searchQuery);
        }

        if (Array.isArray(parsed.portfolio)) {
          setPortfolio(parsed.portfolio);
        }

        if (parsed.activeRun) {
          setActiveRun(parsed.activeRun);
        }
        }
      }
    } catch {
      window.localStorage.removeItem(V3_SESSION_KEY);
      window.localStorage.removeItem(V3_PLAYER_KEY);
    } finally {
      setHasRestoredState(true);
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredState) {
      return;
    }

    const nextState: PersistedV3State = {
      version: V3_SESSION_VERSION,
      step,
      showRules,
      searchQuery,
      portfolio,
      activeRun,
    };

    window.localStorage.setItem(V3_SESSION_KEY, JSON.stringify(nextState));
  }, [activeRun, hasRestoredState, portfolio, searchQuery, showRules, step]);

  useEffect(() => {
    if (!hasRestoredState) {
      return;
    }

    if (playerProfile) {
      window.localStorage.setItem(V3_PLAYER_KEY, JSON.stringify(playerProfile));
      return;
    }

    window.localStorage.removeItem(V3_PLAYER_KEY);
  }, [hasRestoredState, playerProfile]);

  useEffect(() => {
    if (!hasRestoredState || !playerProfile || activeRun || step === "play") {
      return;
    }

    let cancelled = false;

    const restoreActiveRun = async () => {
      try {
        const response = await fetch(
          `/api/v3/runs/active?playerId=${encodeURIComponent(playerProfile.id)}`,
          { cache: "no-store" }
        );
        const payload = (await response.json().catch(() => null)) as ActiveRunResponse | null;

        if (!response.ok || cancelled || !payload?.run) {
          return;
        }

        const nextRun = buildActiveRunFromPersistedData(
          payload.run,
          payload.snapshots ?? [],
          assetMap,
          currentData.benchmark
        );

        setPortfolio(nextRun.entries);
        setActiveRun(nextRun);
        setNow(Date.now());
        setRemainingMs(
          Math.max(0, nextRun.durationMs - (Date.now() - nextRun.startedAt))
        );
        setLastSnapshotAt(nextRun.benchmarkSeries.at(-1)?.timestamp ?? nextRun.startedAt);
        setStep("play");
      } catch {
        // Fall back to local state only if active run lookup fails.
      }
    };

    void restoreActiveRun();

    return () => {
      cancelled = true;
    };
  }, [activeRun, assetMap, currentData.benchmark, hasRestoredState, playerProfile, step]);

  async function restoreActiveRunForPlayer(playerId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `/api/v3/runs/active?playerId=${encodeURIComponent(playerId)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json().catch(() => null)) as ActiveRunResponse | null;

      if (!response.ok || !payload?.run) {
        return false;
      }

      const nextRun = buildActiveRunFromPersistedData(
        payload.run,
        payload.snapshots ?? [],
        assetMap,
        currentData.benchmark
      );

      setPortfolio(nextRun.entries);
      setActiveRun(nextRun);
      setNow(Date.now());
      setRemainingMs(Math.max(0, nextRun.durationMs - (Date.now() - nextRun.startedAt)));
      setLastSnapshotAt(nextRun.benchmarkSeries.at(-1)?.timestamp ?? nextRun.startedAt);
      setShowProfileGate(false);
      setStep("play");
      return true;
    } catch {
      return false;
    }
  }

  const filteredStocks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return currentData.assets;
    }

    return currentData.assets.filter(
      (asset) =>
        asset.symbol.toLowerCase().includes(query) ||
        asset.name.toLowerCase().includes(query)
    );
  }, [currentData.assets, searchQuery]);

  useEffect(() => {
    if (step !== "play" || !activeRun) {
      return;
    }

    const startedAt = activeRun.startedAt;
    const durationMs = activeRun.durationMs;

    const tick = () => {
      const nextNow = Date.now();
      setNow(nextNow);
      setRemainingMs(Math.max(0, durationMs - (nextNow - startedAt)));
      setTickCount((current) => current + 1);
    };

    tick();
    const interval = window.setInterval(tick, 1000);

    return () => window.clearInterval(interval);
  }, [step, activeRun?.startedAt, activeRun?.durationMs]);

  useEffect(() => {
    if (
      step !== "play" ||
      !activeRun ||
      Date.now() - activeRun.startedAt >= activeRun.durationMs ||
      activeRun.liveIds.length === 0
    ) {
      return;
    }

    let cancelled = false;

    const refreshLivePrices = async () => {
      try {
        const response = await fetch(
          `/api/v3/live?ids=${encodeURIComponent(activeRun.liveIds.join(","))}` ,
          { cache: "no-store" }
        );
        const payload = (await response.json().catch(() => null)) as { assets?: V3Asset[] } | null;

        if (!response.ok || cancelled || !payload?.assets?.length) {
          return;
        }

        const nextTimestamp = Date.now();
        const latestById = Object.fromEntries(payload.assets.map((asset) => [asset.id, asset]));

        setActiveRun((current) => {
          if (!current || current.runId !== activeRun.runId) {
            return current;
          }

          const nextAssets = current.assets.map((entry) => {
            const latest = latestById[entry.asset.id];

            if (!latest) {
              return entry;
            }

            const lastPoint = entry.series.at(-1);
            const nextSeries =
              lastPoint && lastPoint.price_usd === latest.price_usd
                ? entry.series
                : [
                    ...entry.series,
                    {
                      timestamp: nextTimestamp,
                      price_usd: latest.price_usd,
                    },
                  ];

            return {
              ...entry,
              asset: latest,
              series: nextSeries,
            };
          });

          const benchmarkAsset = currentData.benchmark
            ? latestById[currentData.benchmark.id]
            : null;
          const lastBenchmarkPoint = current.benchmarkSeries.at(-1);
          const nextBenchmarkSeries =
            benchmarkAsset &&
            (!lastBenchmarkPoint || lastBenchmarkPoint.price_usd !== benchmarkAsset.price_usd)
              ? [
                  ...current.benchmarkSeries,
                  {
                    timestamp: nextTimestamp,
                    price_usd: benchmarkAsset.price_usd,
                  },
                ]
              : current.benchmarkSeries;

          return {
            ...current,
            assets: nextAssets,
            benchmarkSeries: nextBenchmarkSeries,
            benchmarkEnd:
              benchmarkAsset?.price_usd ??
              nextBenchmarkSeries.at(-1)?.price_usd ??
              current.benchmarkEnd,
          };
        });
      } catch {
        // Keep the local playback running even if a live refresh fails.
      }
    };

    void refreshLivePrices();

    const interval = window.setInterval(() => {
      void refreshLivePrices();
    }, LIVE_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    activeRun?.durationMs,
    activeRun?.runId,
    activeRun?.startedAt,
    currentData.benchmark,
    liveIdsKey,
    step,
  ]);

  const progress = useMemo(() => {
    if (!activeRun) {
      return 0;
    }

    return Math.min(1, Math.max(0, (now - activeRun.startedAt) / activeRun.durationMs));
  }, [activeRun, now]);

  const steppedProgress = useMemo(() => {
    if (!activeRun) {
      return 0;
    }

    const totalSteps = Math.max(1, Math.floor(activeRun.durationMs / LIVE_REFRESH_MS));
    const elapsedSteps = Math.min(totalSteps, Math.floor((now - activeRun.startedAt) / LIVE_REFRESH_MS));

    return elapsedSteps / totalSteps;
  }, [activeRun, now]);

  const isFinished = step === "play" && Boolean(activeRun) && progress >= 1;

  const playMetrics = useMemo(() => {
    if (!activeRun) {
      return null;
    }

    const benchmarkVisible = getVisibleSeries(activeRun.benchmarkSeries, steppedProgress);
    const benchmarkCurrent = benchmarkVisible.at(-1)?.price_usd ?? activeRun.benchmarkStart;
    const benchmarkReturn = ((benchmarkCurrent - activeRun.benchmarkStart) / activeRun.benchmarkStart) * 100;

    const assetValue = activeRun.assets.reduce((sum, entry) => {
      const visible = getVisibleSeries(entry.series, steppedProgress);
      const price = visible.at(-1)?.price_usd ?? entry.startingPrice;
      return sum + entry.shares * price;
    }, 0);

    const portfolioValue = activeRun.cash + assetValue;
    const userReturn = ((portfolioValue - STARTING_BUDGET) / STARTING_BUDGET) * 100;
    const alpha = userReturn - benchmarkReturn;

    return {
      portfolioValue,
      userReturn,
      benchmarkReturn,
      alpha,
      remainingMs,
    };
  }, [activeRun, now, remainingMs, steppedProgress]);

  useEffect(() => {
    if (step !== "play" || !activeRun?.runId || !playMetrics) {
      return;
    }

    const latestSeriesTimestamp =
      activeRun.benchmarkSeries.at(-1)?.timestamp ?? activeRun.startedAt;
    const completedHours = Math.floor((latestSeriesTimestamp - activeRun.startedAt) / HOUR_MS);

    if (completedHours <= 0) {
      return;
    }

    const latestTimestamp = activeRun.startedAt + completedHours * HOUR_MS;

    if (lastSnapshotAt === latestTimestamp) {
      return;
    }

    const benchmarkPoint =
      [...activeRun.benchmarkSeries].reverse().find((entry) => entry.timestamp <= latestTimestamp) ??
      activeRun.benchmarkSeries[0];
    const benchmarkValue =
      STARTING_BUDGET * ((benchmarkPoint?.price_usd ?? activeRun.benchmarkStart) / activeRun.benchmarkStart);
    const holdingsValue = activeRun.assets.map((entry) => {
      const assetPoint =
        [...entry.series].reverse().find((seriesPoint) => seriesPoint.timestamp <= latestTimestamp) ??
        entry.series[0];

      return {
        symbol: entry.asset.symbol,
        value: entry.shares * (assetPoint?.price_usd ?? entry.startingPrice),
      };
    });
    const portfolioValue = activeRun.cash + holdingsValue.reduce((sum, entry) => sum + entry.value, 0);

    let cancelled = false;

    const persistSnapshot = async () => {
      try {
        await fetch(`/api/v3/runs/${activeRun.runId}/snapshots`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            portfolioValue,
            benchmarkValue,
            holdingsValue,
            capturedAt: new Date(latestTimestamp).toISOString(),
          }),
        });

        if (!cancelled) {
          setLastSnapshotAt(latestTimestamp);
        }
      } catch {
        // Snapshot persistence is best-effort; keep the local run going regardless.
      }
    };

    void persistSnapshot();

    return () => {
      cancelled = true;
    };
  }, [activeRun, lastSnapshotAt, playMetrics, step]);

  useEffect(() => {
    if (
      step !== "play" ||
      !activeRun ||
      !playMetrics ||
      !isFinished ||
      !activeRun.runId ||
      activeRun.resultSaved
    ) {
      return;
    }

    let cancelled = false;

    const persistRunResult = async () => {
      try {
        const response = await fetch(`/api/v3/runs/${activeRun.runId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            portfolioValue: playMetrics.portfolioValue,
            userReturnPct: playMetrics.userReturn,
            benchmarkReturnPct: playMetrics.benchmarkReturn,
            alphaPct: playMetrics.alpha,
          }),
        });

        if (!response.ok || cancelled) {
          return;
        }

        setActiveRun((current) => {
          if (!current || current.runId !== activeRun.runId) {
            return current;
          }

          return {
            ...current,
            resultSaved: true,
          };
        });
      } catch {
        // Keep the result visible even if leaderboard persistence fails temporarily.
      }
    };

    void persistRunResult();

    return () => {
      cancelled = true;
    };
  }, [activeRun, isFinished, playMetrics, step]);

  function addToPortfolio(symbol: string) {
    if (portfolioMap[symbol] || remainingCash <= 0 || portfolio.length >= MAX_PORTFOLIO_SIZE) {
      return;
    }

    const allocation = Math.min(1000, remainingCash);

    if (allocation <= 0) {
      return;
    }

    setPortfolio((current) => [...current, { symbol, allocation }]);
  }

  function updatePortfolioAllocation(symbol: string, nextRawValue: number) {
    const safeValue = Math.max(0, Math.round(nextRawValue / ALLOCATION_STEP) * ALLOCATION_STEP);
    const otherAllocations = portfolio
      .filter((entry) => entry.symbol !== symbol)
      .reduce((sum, entry) => sum + entry.allocation, 0);
    const nextAllocation = Math.min(safeValue, STARTING_BUDGET - otherAllocations);

    setPortfolio((current) =>
      current.map((entry) =>
        entry.symbol === symbol ? { ...entry, allocation: nextAllocation } : entry
      )
    );
  }

  function removeFromPortfolio(symbol: string) {
    setPortfolio((current) => current.filter((entry) => entry.symbol !== symbol));
  }

  async function savePlayerProfile(): Promise<V3PlayerProfile | null> {
    const email = profileForm.email.trim();
    const walletAddress = profileForm.walletAddress.trim();

    if (!email || !walletAddress) {
      setProfileError("Email and wallet address are required to continue.");
      return null;
    }

    setIsSavingProfile(true);
    setProfileError(null);

    try {
      const response = await fetch("/api/v3/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, walletAddress }),
      });
      const payload = (await response.json().catch(() => null)) as PlayerResponse | null;

      if (!response.ok || !payload?.player) {
        throw new Error(payload?.error ?? "Failed to save your V3 profile.");
      }

      setPlayerProfile(payload.player);
      setProfileForm({ email: payload.player.email, walletAddress: payload.player.walletAddress });
      return payload.player;
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Failed to save your V3 profile.");
      return null;
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function startRunForProfile(profile: V3PlayerProfile) {
    if (portfolio.length === 0) {
      return;
    }

    setProfileError(null);

    const selectedIds = portfolio
      .map((entry) => assetMap[entry.symbol]?.id)
      .filter((id): id is string => Boolean(id));
    const playbackIds = Array.from(
      new Set([
        ...selectedIds,
        ...(currentData.benchmark ? [currentData.benchmark.id] : []),
      ])
    );

    let latestAssetsById: Record<string, V3Asset> = {};

    if (playbackIds.length > 0) {
      try {
        const response = await fetch(
          `/api/v3/live?ids=${encodeURIComponent(playbackIds.join(","))}` ,
          { cache: "no-store" }
        );
        const payload = (await response.json().catch(() => null)) as { assets?: V3Asset[] } | null;

        if (response.ok && payload?.assets?.length) {
          latestAssetsById = Object.fromEntries(payload.assets.map((asset) => [asset.id, asset]));
        }
      } catch {
        latestAssetsById = {};
      }
    }

    const runStartedAt = Date.now();
    const benchmarkAsset = currentData.benchmark
      ? latestAssetsById[currentData.benchmark.id] ?? currentData.benchmark
      : null;
    const benchmarkStart = benchmarkAsset?.price_usd ?? 100;
    const benchmarkSeries = [
      {
        timestamp: runStartedAt,
        price_usd: benchmarkStart,
      },
    ];

    const assets = portfolio
      .map((entry) => {
        const baseAsset = assetMap[entry.symbol];
        if (!baseAsset) {
          return null;
        }

        const latestAsset = latestAssetsById[baseAsset.id] ?? baseAsset;
        const startingPrice = latestAsset.price_usd;
        const shares = startingPrice > 0 ? entry.allocation / startingPrice : 0;

        return {
          asset: latestAsset,
          startingPrice,
          series: [
            {
              timestamp: runStartedAt,
              price_usd: startingPrice,
            },
          ],
          shares,
        } satisfies PlaybackAsset;
      })
      .filter((entry): entry is PlaybackAsset => entry !== null);

    const runResponse = await fetch("/api/v3/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: profile.id,
        playerEmail: profile.email,
        playerUsername: profile.walletAddress,
        selectedSymbols: portfolio.map((entry) => entry.symbol),
        allocations: portfolio.map((entry) => {
          const playbackAsset = assets.find((asset) => asset.asset.symbol === entry.symbol);
          return {
            symbol: entry.symbol,
            allocation: entry.allocation,
            startingPrice: playbackAsset?.startingPrice ?? null,
            shares: playbackAsset?.shares ?? null,
          };
        }),
        startingBudget: STARTING_BUDGET,
        durationSeconds: GAME_DURATION_MS / 1000,
        benchmarkSymbol: currentData.benchmark?.symbol ?? "SPYON",
        benchmarkStartPrice: benchmarkStart,
      }),
    });
    const runPayload = (await runResponse.json().catch(() => null)) as RunStartResponse | null;

    if (!runResponse.ok || !runPayload?.run?.id) {
      setProfileError(runPayload?.error ?? "Failed to record your run. Please try again.");
      setShowProfileGate(true);
      return;
    }

    const allocated = portfolio.reduce((sum, entry) => sum + entry.allocation, 0);
    const benchmarkEnd = benchmarkStart;

    setActiveRun({
      startedAt: runStartedAt,
      durationMs: GAME_DURATION_MS,
      entries: portfolio,
      cash: STARTING_BUDGET - allocated,
      assets,
      benchmarkSeries,
      benchmarkStart,
      benchmarkEnd,
      liveIds: playbackIds,
      runId: runPayload.run.id,
      resultSaved: false,
    });
    setShowProfileGate(false);
    setNow(runStartedAt);
    setRemainingMs(GAME_DURATION_MS);
    setTickCount(0);
    setLastSnapshotAt(null);
    setStep("play");
  }

  async function beginPlayback() {
    if (portfolio.length === 0) {
      return;
    }

    if (totalCommitted !== STARTING_BUDGET) {
      window.alert("Make sure your total committed is $10,000.");
      return;
    }

    if (!playerProfile) {
      setShowProfileGate(true);
      setProfileError(null);
      return;
    }

    await startRunForProfile(playerProfile);
  }

  async function continueWithProfile() {
    const profile = await savePlayerProfile();

    if (!profile) {
      return;
    }

    const restored = await restoreActiveRunForPlayer(profile.id);

    if (restored) {
      return;
    }

    await startRunForProfile(profile);
  }

  function resetGame() {
    setActiveRun(null);
    setPortfolio([]);
    setSearchQuery("");
    setShowProfileGate(false);
    setProfileError(null);
    setNow(Date.now());
    setRemainingMs(GAME_DURATION_MS);
    setLastSnapshotAt(null);
    setStep("start");
  }

  function forceQuitRun() {
    setActiveRun(null);
    setShowProfileGate(false);
    setShowEndChallengeConfirm(false);
    setProfileError(null);
    setNow(Date.now());
    setRemainingMs(GAME_DURATION_MS);
    setLastSnapshotAt(null);
    setStep("start");
  }

  if (!hasRestoredState) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[1400px] px-6 py-10 sm:px-10 lg:px-12">
        <section className="rounded-[2rem] border border-panel-border bg-panel p-10 text-center shadow-[0_20px_70px_rgba(22,33,29,0.08)]">
          <p className="text-sm text-muted">Restoring your V3 session...</p>
        </section>
      </main>
    );
  }

  async function refreshDataAndStart() {
    setIsRefreshingStartData(true);

    try {
      const response = await fetch("/api/v3/assets?force=1", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as V3AssetsApiResponse | null;

      if (response.ok && payload?.assets) {
        setCurrentData(payload);
        setCurrentLoadError(null);
      } else if (payload?.error) {
        setCurrentLoadError(payload.error);
      }
    } catch {
      setCurrentLoadError("Failed to refresh V3 market data. Using the previous snapshot.");
    } finally {
      setIsRefreshingStartData(false);
      setStep("select");
    }
  }

  if (step === "start") {
    return (
      <main className="min-h-screen w-full">
        <StartScreen
          onStart={() => void refreshDataAndStart()}
          onToggleRules={() => setShowRules((current) => !current)}
          showRules={showRules}
          isRefreshing={isRefreshingStartData}
        />
      </main>
    );
  }

  if (step === "play" && activeRun && playMetrics) {
    const finalAlpha = playMetrics.alpha;
    const won = finalAlpha >= 0;

    return (
      <main
        className="relative min-h-screen overflow-hidden px-6 py-6 sm:px-8"
        style={{
          backgroundImage:
            "linear-gradient(rgba(240,229,200,0.76), rgba(240,229,200,0.76)), url('/treasures-home-bg.png')",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.24),transparent_46%)]" />

        <section className="relative mx-auto w-full max-w-[1780px] border-[10px] border-[#9b8867] bg-[rgba(243,229,199,0.56)] px-6 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.16)]">
          <div className="flex justify-end">
            <ProfileMenu profile={playerProfile} />
          </div>
          <div className="text-center">
            <h1 className="text-5xl font-semibold tracking-tight text-black sm:text-6xl">
              Monitor Your Progress
            </h1>
            <p className="mt-2 text-xl font-semibold text-black/88 sm:text-2xl">
              Your run is live. Track your performance against the benchmark over time.
            </p>
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)] xl:items-start">
            <aside className="rounded-[1.8rem] border-[3px] border-[#123343] bg-[rgba(27,104,144,0.95)] px-5 py-6 text-center text-white shadow-[0_18px_46px_rgba(0,0,0,0.16)]">
              <p className="text-2xl font-semibold text-black/90">Run Info</p>
              <div className="mt-6 space-y-7">
                <div>
                  <p className="text-sm font-semibold tracking-[0.16em] text-white/68 uppercase">
                    Started
                  </p>
                  <p className="mt-2 text-xl leading-8 font-medium">
                    {new Intl.DateTimeFormat("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(activeRun.startedAt))}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-[0.16em] text-white/68 uppercase">
                    Elapsed
                  </p>
                  <p className="mt-2 text-3xl font-semibold">
                    {formatTimer(Math.max(0, activeRun.durationMs - remainingMs))}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-[0.16em] text-white/68 uppercase">
                    Remaining
                  </p>
                  <p className="mt-2 text-3xl font-semibold">
                    {formatTimer(playMetrics.remainingMs)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-[0.16em] text-white/68 uppercase">
                    Updated
                  </p>
                  <p className="mt-2 text-base font-medium">
                    {formatUpdatedAt(activeRun.assets[0]?.asset.last_updated ?? currentData.benchmark?.last_updated)}
                  </p>
                </div>
              </div>
            </aside>

            <div className="space-y-5">
              <section className="rounded-[1.6rem] border-[3px] border-[#4e6370]/48 bg-[rgba(255,255,255,0.92)] px-5 py-5 shadow-[0_14px_30px_rgba(0,0,0,0.08)]">
                <div className="text-center">
                  <h2 className="text-3xl font-semibold text-black">Live Progress</h2>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 md:items-start">
                  <div className="text-center">
                    <div className="mx-auto w-full max-w-[300px] rounded-[1rem] border-[3px] border-[#123343]/15 bg-[rgba(27,104,144,0.98)] px-4 py-3 text-center text-xl font-semibold text-white">
                      Your Portfolio
                    </div>
                    <p className="mt-3 text-3xl font-semibold text-black">
                      {formatCurrency(playMetrics.portfolioValue)}
                    </p>
                    <p
                      className={`mt-2 text-3xl font-semibold ${
                        playMetrics.userReturn >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {formatPercent(playMetrics.userReturn)}
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="mx-auto w-full max-w-[300px] rounded-[1rem] border-[3px] border-[#123343]/15 bg-[rgba(27,104,144,0.98)] px-4 py-3 text-center text-xl font-semibold text-white">
                      S&amp;P 500
                    </div>
                    <p className="mt-3 text-3xl font-semibold text-black">
                      {formatCurrency(STARTING_BUDGET * (1 + playMetrics.benchmarkReturn / 100))}
                    </p>
                    <p
                      className={`mt-2 text-3xl font-semibold ${
                        playMetrics.benchmarkReturn >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {formatPercent(playMetrics.benchmarkReturn)}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.6rem] border-[3px] border-[#4e6370]/48 bg-[rgba(255,255,255,0.92)] px-5 py-5 shadow-[0_14px_30px_rgba(0,0,0,0.08)]">
                <div className="text-center">
                  <h3 className="text-3xl font-semibold text-black">Timelapse</h3>
                </div>
                <div className="mt-5">
                  <PlaybackChart run={activeRun} />
                </div>
              </section>
            </div>
          </div>

          <div className="mt-5 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setShowEndChallengeConfirm(true)}
              className="flex min-h-[72px] w-full max-w-5xl items-center justify-center rounded-[1.8rem] border-[3px] border-[#123343] bg-[rgba(27,104,144,0.98)] px-8 text-2xl font-semibold text-white shadow-[0_18px_46px_rgba(0,0,0,0.2)] transition-transform hover:-translate-y-0.5"
            >
              End Challenge
            </button>
            {SHOW_TIMER_DEBUG ? (
              <p className="text-xs font-medium text-black/55">
                Debug: tick {tickCount} · started {formatUtcClock(activeRun.startedAt)} UTC · now {formatUtcClock(now)} UTC
              </p>
            ) : null}
          </div>
        </section>

        {isFinished ? (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-[rgba(13,18,15,0.46)] px-6">
            <div className="w-full max-w-xl rounded-[2rem] border border-panel-border bg-white p-8 text-center shadow-[0_30px_80px_rgba(22,33,29,0.18)]">
              <p className="text-sm font-semibold tracking-[0.24em] text-muted uppercase">Results</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-tight text-foreground">
                {won ? "You outperform the S&P 500 by " : "You underperform the S&P 500 by "}
                <span className={finalAlpha >= 0 ? "text-emerald-600" : "text-red-600"}>
                  {Math.abs(finalAlpha).toFixed(2)}%
                </span>
                {" "}pp
              </h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#f6f7f3] px-4 py-4 text-left">
                  <p className="text-sm text-muted">Portfolio return</p>
                  <p
                    className={`mt-2 text-2xl font-semibold ${
                      playMetrics.userReturn >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {formatPercent(playMetrics.userReturn)}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f6f7f3] px-4 py-4 text-left">
                  <p className="text-sm text-muted">S&P 500 return</p>
                  <p
                    className={`mt-2 text-2xl font-semibold ${
                      playMetrics.benchmarkReturn >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {formatPercent(playMetrics.benchmarkReturn)}
                  </p>
                </div>
              </div>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={resetGame}
                  className="rounded-full bg-[#16211d] px-8 py-3 text-base font-semibold text-white"
                >
                  Play Again
                </button>
                <Link
                  href="/v3/leaderboard"
                  className="rounded-full border border-panel-border bg-white px-8 py-3 text-base font-semibold text-foreground"
                >
                  View leaderboard
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        {showEndChallengeConfirm ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(13,18,15,0.46)] px-6">
            <div className="w-full max-w-md rounded-[2rem] border border-panel-border bg-white p-8 text-center shadow-[0_30px_80px_rgba(22,33,29,0.18)]">
              <h2 className="text-3xl font-semibold text-foreground">End Challenge?</h2>
              <p className="mt-4 text-base leading-7 text-muted">
                Are you sure you want to end this challenge? Your current progress will no longer stay open on this screen.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={forceQuitRun}
                  className="rounded-full bg-[#16211d] px-8 py-3 text-base font-semibold text-white"
                >
                  Yes, End Challenge
                </button>
                <button
                  type="button"
                  onClick={() => setShowEndChallengeConfirm(false)}
                  className="rounded-full border border-panel-border bg-white px-8 py-3 text-base font-semibold text-foreground"
                >
                  Keep Running
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main
      className="relative min-h-screen overflow-hidden px-6 py-8 text-white sm:px-8"
      style={{
        backgroundImage:
          "linear-gradient(rgba(20, 62, 70, 0.24), rgba(20, 62, 70, 0.24)), url('/treasures-home-bg.png')",
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(89,188,186,0.42),rgba(220,186,128,0.46)),radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_42%)]" />

      <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1720px] flex-col justify-center">
        <div className="mb-4 flex justify-end">
          <ProfileMenu profile={playerProfile} />
        </div>
        <div className="text-center">
          <h1 className="text-5xl font-semibold tracking-tight drop-shadow-[0_10px_30px_rgba(0,0,0,0.22)] sm:text-6xl lg:text-7xl">
            Build Your Portfolio
          </h1>
          <p className="mx-auto mt-2 max-w-6xl text-lg font-semibold leading-tight drop-shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:text-xl">
            Put $10,000 to work, build your basket, and take on the S&amp;P 500.
          </p>
        </div>

        {currentLoadError ? (
          <div className="mx-auto mt-6 max-w-4xl rounded-2xl border border-amber-200/80 bg-amber-50/92 px-4 py-3 text-center text-sm text-amber-900">
            {currentLoadError}
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 xl:grid-cols-[320px_64px_minmax(0,1fr)] xl:items-center">
          <section className="rounded-[2rem] border-[3px] border-[#123343] bg-[rgba(27,104,144,0.94)] px-8 py-8 text-center shadow-[0_18px_46px_rgba(0,0,0,0.2)]">
            <p className="text-2xl font-semibold sm:text-3xl">S&amp;P500 Pool</p>
            <div className="mt-14 space-y-8">
              <p className="text-4xl font-semibold">{formatCurrency(STARTING_BUDGET)}</p>
              <p className="text-2xl font-medium">Invested into</p>
              {currentData.benchmark ? (
                <div className="mx-auto flex max-w-[260px] items-center justify-center gap-4 rounded-[1.4rem] border border-white/12 bg-[rgba(8,26,38,0.22)] px-5 py-4">
                  <AssetAvatar asset={currentData.benchmark} />
                  <div className="text-left">
                    <p className="text-xs font-semibold tracking-[0.18em] text-white/56 uppercase">
                      Benchmark
                    </p>
                    <p className="mt-1 text-3xl font-semibold text-white">
                      {formatStockSymbol(currentData.benchmark.symbol)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-4xl font-semibold">SPY</p>
              )}
            </div>
            <div className="mt-12">
              <p
                className={`text-2xl font-semibold ${
                  (currentData.benchmark?.change_24h ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"
                }`}
              >
                1D change: {formatPercent(currentData.benchmark?.change_24h ?? 0)}
              </p>
              <p className="mt-3 text-sm font-medium text-white/72">
                {formatUpdatedAt(currentData.benchmark?.last_updated)}
              </p>
            </div>
          </section>

          <div className="hidden text-center text-5xl font-semibold tracking-[0.14em] text-white/92 xl:block">
            VS
          </div>

          <section className="rounded-[2rem] border-[3px] border-[#123343] bg-[rgba(27,104,144,0.94)] px-6 py-6 shadow-[0_18px_46px_rgba(0,0,0,0.2)] sm:px-8">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.22fr)_360px] xl:items-stretch">
              <div className="flex h-full flex-col">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-center text-3xl font-semibold sm:text-left sm:text-4xl">
                    Stock Universe
                  </h2>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search token or ticker"
                    className="w-full rounded-xl border border-white/18 bg-white/14 px-4 py-3 text-sm text-white outline-none placeholder:text-white/55 sm:max-w-xs"
                  />
                </div>

                <div className="mt-4 flex flex-col overflow-hidden rounded-[1.65rem] bg-[linear-gradient(180deg,rgba(246,250,252,0.92),rgba(226,236,242,0.86))] shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_16px_40px_rgba(0,0,0,0.12)]">
                  <div className="grid grid-cols-[minmax(0,2fr)_112px_112px_118px_88px] items-center gap-4 bg-[rgba(20,66,92,0.94)] px-5 py-4 text-base font-semibold text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]">
                    <span>Stock</span>
                    <span className="justify-self-end whitespace-nowrap text-right">Price</span>
                    <span className="justify-self-end whitespace-nowrap text-right">1D change</span>
                    <span className="justify-self-end whitespace-nowrap text-right">Marketcap</span>
                    <span className="justify-self-center opacity-0">Add</span>
                  </div>
                  <div className="h-[536px] overflow-y-auto p-2">
                    {filteredStocks.map((asset, index) => {
                      const isAdded = Boolean(portfolioMap[asset.symbol]);
                      const rowBg =
                        index % 2 === 0 ? "bg-[rgba(255,255,255,0.9)]" : "bg-[rgba(245,248,251,0.92)]";

                      return (
                        <div
                          key={asset.id}
                          className={`mb-2 grid grid-cols-[minmax(0,2fr)_112px_112px_118px_88px] items-center gap-4 rounded-[1rem] px-4 py-3 text-sm text-[#14222a] shadow-[0_1px_0_rgba(18,50,68,0.05)] ${rowBg}`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <AssetAvatar asset={asset} />
                            <div className="min-w-0">
                              <p className="font-semibold">{formatStockSymbol(asset.symbol)}</p>
                              <p className="truncate text-[#3f4f58]">{asset.name}</p>
                            </div>
                          </div>
                          <span className="text-right font-medium tabular-nums">{formatCurrency(asset.price_usd)}</span>
                          <span className={`text-right font-medium tabular-nums ${asset.change_24h >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                            {formatPercent(asset.change_24h)}
                          </span>
                          <span className="text-right tabular-nums text-[#3f4f58]">{formatMarketCap(asset.market_cap_usd)}</span>
                          <button
                            type="button"
                            onClick={() => addToPortfolio(asset.symbol)}
                            disabled={isAdded || !canAddToPortfolio}
                            className="justify-self-center rounded-full bg-[rgba(20,66,92,0.9)] px-3 py-2 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(20,66,92,0.16)] transition-colors hover:bg-[rgba(17,58,81,0.96)] disabled:cursor-not-allowed disabled:opacity-55"
                          >
                            {isAdded ? "Added" : "Add"}
                          </button>
                        </div>
                      );
                    })}
                    {filteredStocks.length === 0 ? (
                      <div className="rounded-[1rem] bg-[rgba(255,255,255,0.82)] px-4 py-10 text-center text-sm text-[#31424b]">
                        No matching assets found in the shared V3 dataset.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.45rem] border-[3px] border-[#123343] bg-[rgba(27,104,144,0.98)] px-3.5 py-3.5">
                <h2 className="text-center text-3xl font-semibold sm:text-4xl">Your Portfolio</h2>
                <p className="mt-1.5 text-center text-xs font-medium text-white/70">
                  Choose up to 8 stocks
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {Array.from({ length: MAX_PORTFOLIO_SIZE }, (_, index) => {
                    const entry = portfolio[index];

                    if (!entry) {
                      return <EmptyPortfolioSlot key={`empty-slot-${index}`} />;
                    }

                    const asset = assetMap[entry.symbol];

                    if (!asset) {
                      return <EmptyPortfolioSlot key={`missing-slot-${entry.symbol}`} />;
                    }

                    return (
                      <div
                        key={entry.symbol}
                        className="rounded-[0.9rem] border border-white/14 bg-[rgba(8,26,38,0.18)] px-2 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2">
                            <AssetAvatar asset={asset} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">{formatStockSymbol(asset.symbol)}</p>
                              <p className="mt-0.5 truncate text-[11px] text-white/60">{asset.name}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFromPortfolio(entry.symbol)}
                            aria-label="Remove asset"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/16 bg-white/8 text-xs font-semibold text-white/84 transition-colors hover:bg-white/14"
                          >
                            ×
                          </button>
                        </div>
                        <div className="mt-2 rounded-xl bg-white/10 px-2 py-1.5 text-center">
                          <p className="text-[9px] font-semibold tracking-[0.14em] text-white/50 uppercase">Allocation</p>
                          <p className="mt-0.5 text-xs font-semibold text-white">{formatCurrency(entry.allocation)}</p>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max={entry.allocation + remainingCash}
                          step={ALLOCATION_STEP}
                          value={entry.allocation}
                          onChange={(event) => updatePortfolioAllocation(entry.symbol, Number(event.target.value))}
                          className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-white"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 rounded-xl border border-[#123343]/30 bg-[#f3dcc8] px-3 py-2.5 text-center text-[#191716] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                  <p className="text-base font-semibold">
                    Total committed
                  </p>
                  <p className="mt-0.5 text-base font-semibold">
                    {formatCurrency(totalCommitted)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center gap-4">
              <button
                type="button"
                onClick={() => void beginPlayback()}
                disabled={portfolio.length === 0}
                className="flex min-h-[84px] w-full max-w-5xl items-center justify-center rounded-[1.8rem] border-[3px] border-[#123343] bg-[rgba(27,104,144,0.98)] px-8 text-2xl font-semibold text-white shadow-[0_18px_46px_rgba(0,0,0,0.22)] transition-transform hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-50 sm:text-3xl"
              >
                Start Countdown
              </button>
              <div className="flex flex-wrap justify-center gap-3 text-sm font-medium text-white/78">
                <Link href="/v3/leaderboard" className="rounded-full border border-white/16 bg-white/8 px-4 py-2 transition-colors hover:bg-white/14">
                  Leaderboard
                </Link>
                <button
                  type="button"
                  onClick={() => setStep("start")}
                  className="rounded-full border border-white/16 bg-white/8 px-4 py-2 transition-colors hover:bg-white/14"
                >
                  Back
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>

      {showProfileGate ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(13,18,15,0.42)] px-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-panel-border bg-white p-8 shadow-[0_30px_80px_rgba(22,33,29,0.18)]">
            <h3 className="text-2xl font-semibold text-foreground">Sign in to continue</h3>
            <p className="mt-2 text-sm leading-7 text-muted">
              In order to monitor progress and create the receiving wallet for your prize, kindly login to create an account with Treasures
            </p>
            <div className="mt-5 grid gap-3">
              <input
                type="email"
                value={profileForm.email}
                onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email"
                className="rounded-xl border border-panel-border bg-[#f6f7f3] px-4 py-3 text-sm text-foreground outline-none"
              />
              <input
                type="text"
                value={profileForm.walletAddress}
                onChange={(event) => setProfileForm((current) => ({ ...current, walletAddress: event.target.value }))}
                placeholder="Wallet address"
                className="rounded-xl border border-panel-border bg-[#f6f7f3] px-4 py-3 text-sm text-foreground outline-none"
              />
            </div>
            {profileError ? (
              <p className="mt-3 text-sm text-red-600">{profileError}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void continueWithProfile()}
                disabled={isSavingProfile}
                className="rounded-full bg-[#16211d] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isSavingProfile ? "Saving..." : "Start 24-Hour Run"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowProfileGate(false);
                  setProfileError(null);
                }}
                className="rounded-full border border-panel-border bg-white px-6 py-3 text-sm font-semibold text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
