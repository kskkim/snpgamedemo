import "server-only";

import type { V3BenchmarkPoint } from "@/lib/market-data/coingecko-v3";
import { getV3AssetChartsByIds, getV3AssetsPayload } from "@/lib/market-data/coingecko-v3";
import {
  completeV3Run,
  createV3RunSnapshot,
  listV3RunSnapshots,
  updateV3Run,
} from "@/lib/db/v3-runs";
import type { Json, V3Run, V3RunSnapshot } from "@/lib/db/types";

const HOUR_MS = 60 * 60 * 1000;

type RunAllocation = {
  symbol: string;
  allocation: number;
  startingPrice: number;
  shares: number;
};

function parseRunAllocations(value: Json): RunAllocation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || Array.isArray(entry) || typeof entry !== "object") {
        return null;
      }

      if (
        typeof entry["symbol"] !== "string" ||
        typeof entry["allocation"] !== "number" ||
        typeof entry["startingPrice"] !== "number" ||
        typeof entry["shares"] !== "number"
      ) {
        return null;
      }

      return {
        symbol: entry["symbol"].trim().toUpperCase(),
        allocation: entry["allocation"],
        startingPrice: entry["startingPrice"],
        shares: entry["shares"],
      } satisfies RunAllocation;
    })
    .filter((entry): entry is RunAllocation => entry !== null);
}

function findNearestPoint(
  points: V3BenchmarkPoint[],
  timestamp: number,
  fallbackPrice: number
): V3BenchmarkPoint {
  if (points.length === 0) {
    return {
      timestamp,
      price_usd: fallbackPrice,
    };
  }

  let nearest = points[0];
  let nearestDistance = Math.abs(points[0].timestamp - timestamp);

  for (const point of points) {
    const distance = Math.abs(point.timestamp - timestamp);

    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export async function syncV3RunHourlyHistory(
  run: V3Run
): Promise<{ run: V3Run; snapshots: V3RunSnapshot[] }> {
  const allocations = parseRunAllocations(run.allocations);
  const existingSnapshots = await listV3RunSnapshots(run.id);
  const startedAtMs = new Date(run.started_at).getTime();
  const endsAtMs = new Date(run.ends_at).getTime();
  const syncThroughMs = Math.min(Date.now(), endsAtMs);
  const completedHours = Math.max(0, Math.floor((syncThroughMs - startedAtMs) / HOUR_MS));

  if (allocations.length === 0 || completedHours === 0) {
    return { run, snapshots: existingSnapshots };
  }

  const payload = await getV3AssetsPayload("");
  const assetsBySymbol = Object.fromEntries(
    [...payload.assets, ...(payload.benchmark ? [payload.benchmark] : [])].map((asset) => [
      asset.symbol,
      asset,
    ])
  );

  const benchmarkAsset = assetsBySymbol[run.benchmark_symbol];

  if (!benchmarkAsset) {
    return { run, snapshots: existingSnapshots };
  }

  const assetIds = Array.from(
    new Set(
      [
        benchmarkAsset.id,
        ...allocations
          .map((entry) => assetsBySymbol[entry.symbol]?.id)
          .filter((id): id is string => Boolean(id)),
      ]
    )
  );
  const chartsById = await getV3AssetChartsByIds(assetIds);
  const benchmarkSeries = chartsById[benchmarkAsset.id] ?? payload.benchmark_chart;
  const existingTimestamps = new Set(
    existingSnapshots.map((snapshot) => new Date(snapshot.captured_at).getTime())
  );
  const cashReserve = Math.max(
    0,
    run.starting_budget - allocations.reduce((sum, entry) => sum + entry.allocation, 0)
  );
  const nextSnapshots: V3RunSnapshot[] = [...existingSnapshots];

  for (let hour = 1; hour <= completedHours; hour += 1) {
    const capturedAtMs = startedAtMs + hour * HOUR_MS;

    if (existingTimestamps.has(capturedAtMs)) {
      continue;
    }

    const holdingsValue = allocations.map((entry) => {
      const asset = assetsBySymbol[entry.symbol];
      const points = asset ? chartsById[asset.id] ?? [] : [];
      const point = findNearestPoint(points, capturedAtMs, entry.startingPrice);

      return {
        symbol: entry.symbol,
        value: entry.shares * point.price_usd,
      };
    });

    const benchmarkPoint = findNearestPoint(
      benchmarkSeries,
      capturedAtMs,
      run.benchmark_start_price ?? benchmarkAsset.price_usd
    );
    const benchmarkStartPrice = run.benchmark_start_price ?? benchmarkPoint.price_usd;
    const benchmarkValue =
      run.starting_budget * (benchmarkPoint.price_usd / Math.max(benchmarkStartPrice, 0.00000001));
    const portfolioValue =
      cashReserve + holdingsValue.reduce((sum, entry) => sum + entry.value, 0);

    const snapshot = await createV3RunSnapshot({
      run_id: run.id,
      portfolio_value: portfolioValue,
      benchmark_value: benchmarkValue,
      holdings_value: holdingsValue,
      captured_at: new Date(capturedAtMs).toISOString(),
    });

    existingTimestamps.add(capturedAtMs);
    nextSnapshots.push(snapshot);
  }

  nextSnapshots.sort(
    (left, right) =>
      new Date(left.captured_at).getTime() - new Date(right.captured_at).getTime()
  );

  let nextRun = run;
  const latestSyncedAt = nextSnapshots.at(-1)?.captured_at ?? run.last_synced_at ?? null;

  if (run.status === "active" && syncThroughMs >= endsAtMs) {
    const finalSnapshot = nextSnapshots.at(-1);

    if (finalSnapshot) {
      const portfolioValue = finalSnapshot.portfolio_value;
      const benchmarkValue = finalSnapshot.benchmark_value;
      const userReturn = ((portfolioValue - run.starting_budget) / run.starting_budget) * 100;
      const benchmarkReturn =
        ((benchmarkValue - run.starting_budget) / run.starting_budget) * 100;

      nextRun = await completeV3Run(run.id, {
        portfolio_value: portfolioValue,
        user_return_pct: userReturn,
        benchmark_return_pct: benchmarkReturn,
        alpha_pct: userReturn - benchmarkReturn,
        completed_at: new Date(endsAtMs).toISOString(),
      });
    }
  } else if (latestSyncedAt && latestSyncedAt !== run.last_synced_at) {
    nextRun = await updateV3Run(run.id, {
      last_synced_at: latestSyncedAt,
    });
  }

  return { run: nextRun, snapshots: nextSnapshots };
}
