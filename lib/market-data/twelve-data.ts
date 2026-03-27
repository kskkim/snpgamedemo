import "server-only";

import {
  listFixedHistoricalSnapshotsForSymbolsAndRange,
  upsertFixedHistoricalSnapshots,
} from "@/lib/db/fixed-historical-snapshots";
import {
  listFixedHistoricalChartPointsForSymbolsAndRange,
  type FixedHistoricalChartPoint,
} from "@/lib/db/fixed-historical-chart-points";
import { listGameSymbols, type GameSymbolOption } from "@/lib/db/game-symbols";

export type TwelveDataRangePoint = {
  symbol: string;
  datetime: string;
  close: number;
};

export type TwelveDataRangeSummary = {
  symbol: string;
  referenceOpen: number;
  buyOpen: number;
  resultClose: number;
  preBuyReturnPct: number;
  startClose: number;
  endClose: number;
  returnPct: number;
};

const HISTORICAL_CACHE_TTL_MS = 12 * 60 * 60_000;
const FIXED_WINDOW_START_DATE = "2026-03-19";
const FIXED_WINDOW_END_DATE = "2026-03-20";
const FIXED_WINDOW_BENCHMARK_SYMBOL = "SPY";

declare global {
  var __twelveDataHistoricalCache__:
    | Map<string, { data: TwelveDataRangePoint[]; cachedAt: number }>
    | undefined;
}

function getApiKey(): string {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing TWELVE_DATA_API_KEY. Add it to .env.local to enable fixed historical game mode."
    );
  }

  return apiKey;
}

function getHistoricalCache(): Map<
  string,
  { data: TwelveDataRangePoint[]; cachedAt: number }
> {
  globalThis.__twelveDataHistoricalCache__ ??= new Map();
  return globalThis.__twelveDataHistoricalCache__;
}

function getCacheKey(symbol: string, startDate: string, endDate: string): string {
  return `${symbol}:${startDate}:${endDate}`;
}

function toSummaryFromStoredRow(row: {
  symbol: string;
  reference_open?: number | null;
  buy_open?: number | null;
  result_close?: number | null;
  pre_buy_return_pct?: number | null;
  start_close?: number | null;
  end_close?: number | null;
  return_pct?: number | null;
}): TwelveDataRangeSummary {
  const referenceOpen = row.reference_open ?? row.start_close ?? 0;
  const buyOpen = row.buy_open ?? row.start_close ?? 0;
  const resultClose = row.result_close ?? row.end_close ?? 0;
  const preBuyReturnPct =
    row.pre_buy_return_pct ??
    (referenceOpen > 0 ? ((buyOpen - referenceOpen) / referenceOpen) * 100 : 0);
  const returnPct =
    row.return_pct ??
    (buyOpen > 0 ? ((resultClose - buyOpen) / buyOpen) * 100 : 0);

  return {
    symbol: row.symbol,
    referenceOpen,
    buyOpen,
    resultClose,
    preBuyReturnPct,
    startClose: row.start_close ?? buyOpen,
    endClose: row.end_close ?? resultClose,
    returnPct,
  };
}

function sortFixedWindowSummaries(
  summaries: TwelveDataRangeSummary[],
  symbols: string[]
): TwelveDataRangeSummary[] {
  return symbols.map((symbol) => {
    const summary = summaries.find((entry) => entry.symbol === symbol);

    if (!summary) {
      throw new Error(`Stored fixed snapshot missing ${symbol}.`);
    }

    return summary;
  });
}

export type GameUniverseSnapshot = {
  featuredSymbols: GameSymbolOption[];
  searchableSymbols: GameSymbolOption[];
  benchmark: TwelveDataRangeSummary;
  snapshots: TwelveDataRangeSummary[];
  chartPoints: FixedHistoricalChartPoint[];
};

export async function getHistoricalRange(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<TwelveDataRangePoint[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const cacheKey = getCacheKey(normalizedSymbol, startDate, endDate);
  const cached = getHistoricalCache().get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < HISTORICAL_CACHE_TTL_MS) {
    return cached.data;
  }

  const apiKey = getApiKey();
  const response = await fetch(
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      normalizedSymbol
    )}&interval=1day&start_date=${startDate}&end_date=${endDate}&order=ASC&timezone=America/New_York&apikey=${apiKey}`,
    {
      method: "GET",
      next: { revalidate: 12 * 60 * 60 },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Twelve Data historical request failed for ${normalizedSymbol} with status ${response.status}.`
    );
  }

  const payload = (await response.json()) as {
    status?: string;
    message?: string;
    values?: Array<{
      datetime?: string;
      close?: string;
    }>;
  };

  if (payload.status === "error") {
    throw new Error(
      payload.message ||
        `Twelve Data historical request failed for ${normalizedSymbol}.`
    );
  }

  const data = (payload.values ?? [])
    .filter(
      (entry) =>
        typeof entry.datetime === "string" && typeof entry.close === "string"
    )
    .map((entry) => ({
      symbol: normalizedSymbol,
      datetime: entry.datetime!,
      close: Number.parseFloat(entry.close!),
    }))
    .filter(
      (entry) =>
        Number.isFinite(entry.close) &&
        entry.datetime.slice(0, 10) >= startDate &&
        entry.datetime.slice(0, 10) <= endDate
    )
    .sort((a, b) => a.datetime.localeCompare(b.datetime));

  getHistoricalCache().set(cacheKey, {
    data,
    cachedAt: Date.now(),
  });

  return data;
}

export async function getHistoricalRangeSummary(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<TwelveDataRangeSummary> {
  const data = await getHistoricalRange(symbol, startDate, endDate);
  const startPoint = data.find((point) => point.datetime.slice(0, 10) === startDate);
  const endPoint = data.find((point) => point.datetime.slice(0, 10) === endDate);

  if (!startPoint || !endPoint) {
    throw new Error(
      `Missing Twelve Data row for ${symbol} on ${!startPoint ? startDate : endDate}.`
    );
  }

  return {
    symbol: symbol.trim().toUpperCase(),
    referenceOpen: startPoint.close,
    buyOpen: startPoint.close,
    resultClose: endPoint.close,
    preBuyReturnPct: 0,
    startClose: startPoint.close,
    endClose: endPoint.close,
    returnPct: ((endPoint.close - startPoint.close) / startPoint.close) * 100,
  };
}

export async function getFixedWindowSnapshot(): Promise<TwelveDataRangeSummary[]> {
  const gameSymbols = await listGameSymbols();
  const tradableSymbols = gameSymbols
    .map((symbol) => symbol.symbol)
    .filter((symbol) => symbol !== FIXED_WINDOW_BENCHMARK_SYMBOL);
  const requiredSymbols = [...tradableSymbols, FIXED_WINDOW_BENCHMARK_SYMBOL];
  const storedSnapshots = await listFixedHistoricalSnapshotsForSymbolsAndRange(
    requiredSymbols,
    FIXED_WINDOW_START_DATE,
    FIXED_WINDOW_END_DATE
  );

  const normalizedStored = storedSnapshots.map(toSummaryFromStoredRow);

  const missingSymbols = requiredSymbols.filter(
    (symbol) => !normalizedStored.some((snapshot) => snapshot.symbol === symbol)
  );

  if (missingSymbols.length > 0) {
    throw new Error(
      `Missing fixed historical snapshot rows for: ${missingSymbols.join(", ")}. Seed Supabase before using /game.`
    );
  }

  return sortFixedWindowSummaries(normalizedStored, requiredSymbols);
}

export async function getGameUniverseSnapshot(): Promise<GameUniverseSnapshot> {
  const gameSymbols = await listGameSymbols();
  const snapshots = await getFixedWindowSnapshot();
  const chartPoints = await listFixedHistoricalChartPointsForSymbolsAndRange(
    snapshots.map((snapshot) => snapshot.symbol),
    FIXED_WINDOW_START_DATE,
    FIXED_WINDOW_END_DATE
  );
  const benchmark = snapshots.find(
    (snapshot) => snapshot.symbol === FIXED_WINDOW_BENCHMARK_SYMBOL
  );

  if (!benchmark) {
    throw new Error("Missing SPY benchmark snapshot for /game.");
  }

  const tradableSnapshots = snapshots.filter(
    (snapshot) => snapshot.symbol !== FIXED_WINDOW_BENCHMARK_SYMBOL
  );
  const searchableSymbols = gameSymbols.filter(
    (symbol) =>
      symbol.symbol !== FIXED_WINDOW_BENCHMARK_SYMBOL &&
      tradableSnapshots.some((snapshot) => snapshot.symbol === symbol.symbol)
  );

  return {
    featuredSymbols: searchableSymbols.filter((symbol) => symbol.isFeatured),
    searchableSymbols,
    benchmark,
    snapshots: tradableSnapshots,
    chartPoints,
  };
}

export async function seedFixedWindowSnapshot(): Promise<TwelveDataRangeSummary[]> {
  const gameSymbols = await listGameSymbols();
  const symbols = [
    ...gameSymbols
      .map((symbol) => symbol.symbol)
      .filter((symbol) => symbol !== FIXED_WINDOW_BENCHMARK_SYMBOL),
    FIXED_WINDOW_BENCHMARK_SYMBOL,
  ];
  const fetchedSnapshots = await Promise.all(
    symbols.map((symbol) =>
      getHistoricalRangeSummary(
        symbol,
        FIXED_WINDOW_START_DATE,
        FIXED_WINDOW_END_DATE
      )
    )
  );

  await upsertFixedHistoricalSnapshots(
    fetchedSnapshots.map((snapshot) => ({
      symbol: snapshot.symbol,
      start_date: FIXED_WINDOW_START_DATE,
      end_date: FIXED_WINDOW_END_DATE,
      reference_open: snapshot.startClose,
      buy_open: snapshot.startClose,
      result_close: snapshot.endClose,
      pre_buy_return_pct: 0,
      start_close: snapshot.startClose,
      end_close: snapshot.endClose,
      return_pct: snapshot.returnPct,
    }))
  );

  return sortFixedWindowSummaries(fetchedSnapshots, symbols);
}
