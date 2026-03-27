import "server-only";

import { getLatestPrice, upsertLatestPrice } from "@/lib/db/latest-prices";

type QuoteCacheEntry = {
  price: number;
  changePercent24h: number | null;
  updatedAt: number;
};

export type LatestQuote = {
  symbol: string;
  price: number;
  changePercent24h: number | null;
  source: string;
};

export type SymbolSearchResult = {
  symbol: string;
  name: string;
  exchange: string | null;
};

export type HistoricalPricePoint = {
  symbol: string;
  date: string;
  close: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
};

export type HistoricalRangeSummary = {
  symbol: string;
  startClose: number;
  endClose: number;
  returnPct: number;
};

const CACHE_TTL_MS = 15_000;
const FALLBACK_TTL_MS = 5 * 60_000;
const HISTORICAL_CACHE_TTL_MS = 12 * 60 * 60_000;
const FIXED_WINDOW_SYMBOLS = ["MSFT", "NVDA", "AMZN", "TSLA", "META", "SPY"] as const;
const FIXED_WINDOW_START_DATE = "2026-03-19";
const FIXED_WINDOW_END_DATE = "2026-03-20";

declare global {
  var __fmpQuoteCache__: Map<string, QuoteCacheEntry> | undefined;
  var __fmpHistoricalCache__:
    | Map<string, { data: HistoricalPricePoint[]; cachedAt: number }>
    | undefined;
}

function getQuoteCache(): Map<string, QuoteCacheEntry> {
  globalThis.__fmpQuoteCache__ ??= new Map<string, QuoteCacheEntry>();
  return globalThis.__fmpQuoteCache__;
}

function getHistoricalCache(): Map<
  string,
  { data: HistoricalPricePoint[]; cachedAt: number }
> {
  globalThis.__fmpHistoricalCache__ ??= new Map();
  return globalThis.__fmpHistoricalCache__;
}

function getApiKey(): string {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing FMP_API_KEY. Add it to .env.local to enable live market quotes."
    );
  }

  return apiKey;
}

function getCachedQuote(symbol: string): LatestQuote | null {
  const cached = getQuoteCache().get(symbol);

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.updatedAt > CACHE_TTL_MS) {
    getQuoteCache().delete(symbol);
    return null;
  }

  return {
    symbol,
    price: cached.price,
    changePercent24h: cached.changePercent24h,
    source: "fmp-cache",
  };
}

async function getFallbackQuote(symbol: string): Promise<LatestQuote | null> {
  const persisted = await getLatestPrice(symbol);

  if (!persisted) {
    return null;
  }

  const persistedUpdatedAt = new Date(persisted.updated_at).getTime();

  if (
    !Number.isFinite(persistedUpdatedAt) ||
    Date.now() - persistedUpdatedAt > FALLBACK_TTL_MS
  ) {
    return null;
  }

  return {
    symbol,
    price: persisted.price,
    changePercent24h: null,
    source: `${persisted.source}-fallback`,
  };
}

export async function getLatestQuote(symbol: string): Promise<LatestQuote> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const cached = getCachedQuote(normalizedSymbol);

  if (cached) {
    return cached;
  }

  try {
    const apiKey = getApiKey();
    const response = await fetch(
      `https://financialmodelingprep.com/stable/quote?symbol=${normalizedSymbol}&apikey=${apiKey}`,
      {
        method: "GET",
        next: { revalidate: 15 },
      }
    );

    if (!response.ok) {
      throw new Error(`FMP request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as Array<{
      price?: number;
      changesPercentage?: number;
      changePercentage?: number;
    }>;
    const price = payload[0]?.price;
    const rawChangePercent =
      payload[0]?.changesPercentage ?? payload[0]?.changePercentage ?? null;
    const changePercent24h =
      typeof rawChangePercent === "number" && Number.isFinite(rawChangePercent)
        ? rawChangePercent
        : null;

    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      throw new Error(`No usable quote returned for ${normalizedSymbol}.`);
    }

    getQuoteCache().set(normalizedSymbol, {
      price,
      changePercent24h,
      updatedAt: Date.now(),
    });

    void upsertLatestPrice({
      ticker: normalizedSymbol,
      price,
      source: "fmp",
    });

    return {
      symbol: normalizedSymbol,
      price,
      changePercent24h,
      source: "fmp",
    };
  } catch (error) {
    const fallbackQuote = await getFallbackQuote(normalizedSymbol);

    if (fallbackQuote) {
      return fallbackQuote;
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(`Failed to load a quote for ${normalizedSymbol}.`);
  }
}

export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  const apiKey = getApiKey();
  const response = await fetch(
    `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(
      normalizedQuery
    )}&apikey=${apiKey}`,
    {
      method: "GET",
      next: { revalidate: 15 },
    }
  );

  if (!response.ok) {
    throw new Error(`FMP symbol search failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as Array<{
    symbol?: string;
    name?: string;
    exchangeShortName?: string;
    exchange?: string;
  }>;

  return payload
    .filter((item) => typeof item.symbol === "string" && item.symbol.length > 0)
    .slice(0, 10)
    .map((item) => ({
      symbol: item.symbol!.toUpperCase(),
      name: item.name?.trim() || item.symbol!.toUpperCase(),
      exchange: item.exchangeShortName ?? item.exchange ?? null,
    }));
}

function getHistoricalCacheKey(
  symbol: string,
  startDate: string,
  endDate: string
): string {
  return `${symbol}:${startDate}:${endDate}`;
}

function normalizeHistoricalDate(value: string): string {
  return value.slice(0, 10);
}

export async function getHistoricalRange(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<HistoricalPricePoint[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const normalizedStartDate = normalizeHistoricalDate(startDate);
  const normalizedEndDate = normalizeHistoricalDate(endDate);
  const cacheKey = getHistoricalCacheKey(
    normalizedSymbol,
    normalizedStartDate,
    normalizedEndDate
  );
  const cached = getHistoricalCache().get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < HISTORICAL_CACHE_TTL_MS) {
    return cached.data;
  }

  const apiKey = getApiKey();
  const response = await fetch(
    `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(
      normalizedSymbol
    )}&from=${normalizedStartDate}&to=${normalizedEndDate}&apikey=${apiKey}`,
    {
      method: "GET",
      next: { revalidate: 60 * 60 },
    }
  );

  if (!response.ok) {
    throw new Error(
      `FMP historical request failed for ${normalizedSymbol} with status ${response.status}.`
    );
  }

  const payload = (await response.json()) as Array<{
    date?: string;
    close?: number;
    open?: number;
    high?: number;
    low?: number;
    volume?: number;
  }>;

  const data = payload
    .filter(
      (entry) =>
        typeof entry.date === "string" &&
        typeof entry.close === "number" &&
        Number.isFinite(entry.close)
    )
    .map((entry) => ({
      symbol: normalizedSymbol,
      date: entry.date!.slice(0, 10),
      close: entry.close!,
      open:
        typeof entry.open === "number" && Number.isFinite(entry.open)
          ? entry.open
          : null,
      high:
        typeof entry.high === "number" && Number.isFinite(entry.high)
          ? entry.high
          : null,
      low:
        typeof entry.low === "number" && Number.isFinite(entry.low)
          ? entry.low
          : null,
      volume:
        typeof entry.volume === "number" && Number.isFinite(entry.volume)
          ? entry.volume
          : null,
    }))
    .filter(
      (entry) =>
        entry.date >= normalizedStartDate && entry.date <= normalizedEndDate
    )
    .sort((a, b) => a.date.localeCompare(b.date));

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
): Promise<HistoricalRangeSummary> {
  const data = await getHistoricalRange(symbol, startDate, endDate);
  const startPoint = data[0];
  const endPoint = data[data.length - 1];

  if (!startPoint || !endPoint) {
    throw new Error(
      `Missing historical price data for ${symbol} between ${startDate} and ${endDate}.`
    );
  }

  return {
    symbol: symbol.trim().toUpperCase(),
    startClose: startPoint.close,
    endClose: endPoint.close,
    returnPct: ((endPoint.close - startPoint.close) / startPoint.close) * 100,
  };
}

export async function getFixedWindowChallengeSummaries(): Promise<
  HistoricalRangeSummary[]
> {
  const summaries = await Promise.all(
    FIXED_WINDOW_SYMBOLS.map((symbol) =>
      getHistoricalRangeSummary(
        symbol,
        FIXED_WINDOW_START_DATE,
        FIXED_WINDOW_END_DATE
      )
    )
  );

  return summaries;
}

export async function getBenchmarkHistoricalSummary(): Promise<HistoricalRangeSummary> {
  return getHistoricalRangeSummary(
    "SPY",
    FIXED_WINDOW_START_DATE,
    FIXED_WINDOW_END_DATE
  );
}
