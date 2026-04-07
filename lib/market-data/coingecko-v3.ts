import "server-only";

const COINGECKO_CATEGORY = "ondo-tokenized-assets";
const COINGECKO_PAGE_SIZE = 250;
const CACHE_TTL_MS = 10 * 60 * 1000;
const EXCLUDED_V3_SYMBOLS = new Set(["SPYON", "IVVON", "ITOTON", "IJHON", "SPGION"]);
const BENCHMARK_SYMBOL = "SPYON";

type CoinGeckoMarketCoin = {
  id?: string;
  symbol?: string;
  name?: string;
  image?: string;
  current_price?: number;
  price_change_percentage_24h?: number;
  market_cap?: number;
  market_cap_rank?: number;
  last_updated?: string;
};

type CoinGeckoMarketChart = {
  prices?: Array<[number, number]>;
};

export type V3Asset = {
  id: string;
  symbol: string;
  name: string;
  logo_url: string;
  price_usd: number;
  change_24h: number;
  market_cap_usd: number;
  market_cap_rank: number | null;
  last_updated: string | null;
};

export type V3BenchmarkPoint = {
  timestamp: number;
  price_usd: number;
};

export type V3AssetsPayload = {
  assets: V3Asset[];
  featured: V3Asset[];
  top_gainers: V3Asset[];
  top_losers: V3Asset[];
  search_results: V3Asset[];
  benchmark: V3Asset | null;
  benchmark_chart: V3BenchmarkPoint[];
  category: string;
  cached_at: string;
  source_count: number;
};

type V3Cache = {
  assets: V3Asset[];
  benchmarkChart: V3BenchmarkPoint[];
  cachedAt: number;
};

type LegacyV3Cache = {
  data?: V3Asset[];
  assets?: V3Asset[];
  benchmarkChart?: V3BenchmarkPoint[];
  cachedAt?: number;
};

type V3SeriesCacheEntry = {
  points: V3BenchmarkPoint[];
  cachedAt: number;
};

declare global {
  var __v3CoinGeckoCache__: LegacyV3Cache | undefined;
  var __v3CoinGeckoSeriesCache__: Record<string, V3SeriesCacheEntry> | undefined;
}

function getCache(): V3Cache | undefined {
  const cached = globalThis.__v3CoinGeckoCache__;

  if (!cached || typeof cached.cachedAt !== "number") {
    return undefined;
  }

  const assets = Array.isArray(cached.assets)
    ? cached.assets
    : Array.isArray(cached.data)
      ? cached.data
      : undefined;

  if (!assets) {
    return undefined;
  }

  return {
    assets,
    benchmarkChart: Array.isArray(cached.benchmarkChart) ? cached.benchmarkChart : [],
    cachedAt: cached.cachedAt,
  };
}

function setCache(cache: V3Cache) {
  globalThis.__v3CoinGeckoCache__ = cache;
}

function getSeriesCache(id: string): V3BenchmarkPoint[] | undefined {
  const entry = globalThis.__v3CoinGeckoSeriesCache__?.[id];

  if (!entry || Date.now() - entry.cachedAt >= CACHE_TTL_MS) {
    return undefined;
  }

  return entry.points;
}

function setSeriesCache(id: string, points: V3BenchmarkPoint[]) {
  const cache = globalThis.__v3CoinGeckoSeriesCache__ ?? {};
  cache[id] = {
    points,
    cachedAt: Date.now(),
  };
  globalThis.__v3CoinGeckoSeriesCache__ = cache;
}


function getApiKey(): string {
  const apiKey = process.env.COINGECKO_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing COINGECKO_API_KEY. Add it to .env.local to enable the V3 CoinGecko route."
    );
  }

  return apiKey;
}

function normalizeAsset(coin: CoinGeckoMarketCoin): V3Asset | null {
  if (
    typeof coin.id !== "string" ||
    typeof coin.symbol !== "string" ||
    typeof coin.name !== "string" ||
    typeof coin.image !== "string" ||
    typeof coin.current_price !== "number" ||
    typeof coin.price_change_percentage_24h !== "number" ||
    typeof coin.market_cap !== "number"
  ) {
    return null;
  }

  return {
    id: coin.id,
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    logo_url: coin.image,
    price_usd: coin.current_price,
    change_24h: coin.price_change_percentage_24h,
    market_cap_usd: coin.market_cap,
    market_cap_rank:
      typeof coin.market_cap_rank === "number" ? coin.market_cap_rank : null,
    last_updated:
      typeof coin.last_updated === "string" ? coin.last_updated : null,
  };
}

function normalizeBenchmarkChart(payload: CoinGeckoMarketChart): V3BenchmarkPoint[] {
  if (!Array.isArray(payload.prices)) {
    return [];
  }

  return payload.prices
    .filter(
      (point): point is [number, number] =>
        Array.isArray(point) &&
        point.length === 2 &&
        typeof point[0] === "number" &&
        typeof point[1] === "number"
    )
    .map(([timestamp, price]) => ({
      timestamp,
      price_usd: price,
    }));
}

async function fetchFromCoinGecko(
  url: string,
  options: { revalidate?: number } = {}
): Promise<Response> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
    next: { revalidate: options.revalidate ?? 600 },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const detail = errorText.trim();

    throw new Error(
      detail
        ? `CoinGecko V3 request failed with status ${response.status}: ${detail}`
        : `CoinGecko V3 request failed with status ${response.status}.`
    );
  }

  return response;
}

async function fetchCategoryPage(page: number): Promise<V3Asset[]> {
  const apiKey = getApiKey();
  const searchParams = new URLSearchParams({
    vs_currency: "usd",
    category: COINGECKO_CATEGORY,
    order: "market_cap_desc",
    per_page: String(COINGECKO_PAGE_SIZE),
    page: String(page),
    sparkline: "false",
    price_change_percentage: "24h",
    x_cg_pro_api_key: apiKey,
  });

  const response = await fetchFromCoinGecko(
    `https://pro-api.coingecko.com/api/v3/coins/markets?${searchParams.toString()}`
  );
  const payload = (await response.json()) as CoinGeckoMarketCoin[];

  return payload
    .map(normalizeAsset)
    .filter((asset): asset is V3Asset => asset !== null);
}

async function fetchBenchmarkChart(benchmarkId: string): Promise<V3BenchmarkPoint[]> {
  const apiKey = getApiKey();
  const searchParams = new URLSearchParams({
    vs_currency: "usd",
    days: "1",
    x_cg_pro_api_key: apiKey,
  });

  const response = await fetchFromCoinGecko(
    `https://pro-api.coingecko.com/api/v3/coins/${benchmarkId}/market_chart?${searchParams.toString()}`
  );
  const payload = (await response.json()) as CoinGeckoMarketChart;

  return normalizeBenchmarkChart(payload);
}

async function fetchAssetChartSeries(assetId: string): Promise<V3BenchmarkPoint[]> {
  const cached = getSeriesCache(assetId);

  if (cached) {
    return cached;
  }

  const apiKey = getApiKey();
  const searchParams = new URLSearchParams({
    vs_currency: "usd",
    days: "1",
    x_cg_pro_api_key: apiKey,
  });

  const response = await fetchFromCoinGecko(
    `https://pro-api.coingecko.com/api/v3/coins/${assetId}/market_chart?${searchParams.toString()}`
  );
  const payload = (await response.json()) as CoinGeckoMarketChart;
  const points = normalizeBenchmarkChart(payload);

  setSeriesCache(assetId, points);
  return points;
}

export async function getV3AssetChartsByIds(
  ids: string[]
): Promise<Record<string, V3BenchmarkPoint[]>> {
  const normalizedIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));

  if (normalizedIds.length === 0) {
    return {};
  }

  const chartEntries = await Promise.all(
    normalizedIds.map(async (id) => [id, await fetchAssetChartSeries(id)] as const)
  );

  return Object.fromEntries(chartEntries);
}

export async function getV3LiveAssetsByIds(ids: string[]): Promise<V3Asset[]> {
  const normalizedIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));

  if (normalizedIds.length === 0) {
    return [];
  }

  const apiKey = getApiKey();
  const searchParams = new URLSearchParams({
    vs_currency: "usd",
    ids: normalizedIds.join(","),
    order: "market_cap_desc",
    sparkline: "false",
    price_change_percentage: "24h",
    x_cg_pro_api_key: apiKey,
  });

  const response = await fetchFromCoinGecko(
    `https://pro-api.coingecko.com/api/v3/coins/markets?${searchParams.toString()}`,
    { revalidate: 20 }
  );
  const payload = (await response.json()) as CoinGeckoMarketCoin[];

  return payload
    .map(normalizeAsset)
    .filter((asset): asset is V3Asset => asset !== null);
}

type V3DatasetOptions = {
  force?: boolean;
};

export async function getV3AssetsDataset(options: V3DatasetOptions = {}): Promise<V3Cache> {
  const cached = getCache();

  if (!options.force && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  // The current Ondo tokenized assets category fits within two paginated
  // CoinGecko markets requests at per_page=250, so we batch pages 1 and 2.
  const [pageOne, pageTwo] = await Promise.all([
    fetchCategoryPage(1),
    fetchCategoryPage(2),
  ]);

  const mergedAssets = [...pageOne, ...pageTwo];
  const benchmark = mergedAssets.find((asset) => asset.symbol === BENCHMARK_SYMBOL) ?? null;
  const benchmarkChart =
    options.force && cached?.benchmarkChart?.length
      ? cached.benchmarkChart
      : benchmark
        ? await fetchBenchmarkChart(benchmark.id)
        : [];

  const cache: V3Cache = {
    assets: mergedAssets,
    benchmarkChart,
    cachedAt: Date.now(),
  };

  setCache(cache);
  return cache;
}

type V3PayloadOptions = {
  force?: boolean;
};

export async function getV3AssetsPayload(query: string, options: V3PayloadOptions = {}): Promise<V3AssetsPayload> {
  const dataset = await getV3AssetsDataset({ force: options.force });
  const mergedAssets = dataset.assets;
  const benchmark = mergedAssets.find((asset) => asset.symbol === BENCHMARK_SYMBOL) ?? null;
  const assets = mergedAssets.filter((asset) => !EXCLUDED_V3_SYMBOLS.has(asset.symbol));
  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = normalizedQuery
    ? assets.filter(
        (asset) =>
          asset.symbol.toLowerCase().includes(normalizedQuery) ||
          asset.name.toLowerCase().includes(normalizedQuery)
      )
    : [];

  return {
    assets,
    featured: [],
    top_gainers: [...assets]
      .sort((left, right) => right.change_24h - left.change_24h)
      .slice(0, 5),
    top_losers: [...assets]
      .sort((left, right) => left.change_24h - right.change_24h)
      .slice(0, 5),
    search_results: searchResults,
    benchmark,
    benchmark_chart: dataset.benchmarkChart,
    category: COINGECKO_CATEGORY,
    cached_at: new Date(dataset.cachedAt).toISOString(),
    source_count: assets.length,
  };
}
