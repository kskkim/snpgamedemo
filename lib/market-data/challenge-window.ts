import "server-only";

import {
  getFixedWindowSnapshot,
  getGameUniverseSnapshot,
  type TwelveDataRangeSummary as HistoricalRangeSummary,
} from "@/lib/market-data/twelve-data";

export const FIXED_CHALLENGE_START_DATE = "2026-03-19";
export const FIXED_CHALLENGE_END_DATE = "2026-03-20";
export const FIXED_CHALLENGE_BENCHMARK_SYMBOL = "SPY";

export type FixedWindowGameResult = {
  allocations: Record<string, number>;
  startingBudget: number;
  portfolioValue: number;
  userReturn: number;
  benchmarkReturn: number;
  alpha: number;
  benchmark: HistoricalRangeSummary;
  stocks: HistoricalRangeSummary[];
};

export async function getChallengeStockSummariesForRange(
  startDate: string,
  endDate: string
): Promise<HistoricalRangeSummary[]> {
  if (
    startDate !== FIXED_CHALLENGE_START_DATE ||
    endDate !== FIXED_CHALLENGE_END_DATE
  ) {
    throw new Error(
      `Only the fixed ${FIXED_CHALLENGE_START_DATE} to ${FIXED_CHALLENGE_END_DATE} window is supported in /game.`
    );
  }

  const snapshots = await getFixedWindowSnapshot();

  return snapshots.filter(
    (summary) => summary.symbol !== FIXED_CHALLENGE_BENCHMARK_SYMBOL
  );
}

export async function getBenchmarkSummaryForRange(
  startDate: string,
  endDate: string
): Promise<HistoricalRangeSummary> {
  if (
    startDate !== FIXED_CHALLENGE_START_DATE ||
    endDate !== FIXED_CHALLENGE_END_DATE
  ) {
    throw new Error(
      `Only the fixed ${FIXED_CHALLENGE_START_DATE} to ${FIXED_CHALLENGE_END_DATE} window is supported in /game.`
    );
  }

  const benchmark = (await getFixedWindowSnapshot()).find(
    (summary) => summary.symbol === FIXED_CHALLENGE_BENCHMARK_SYMBOL
  );

  if (!benchmark) {
    throw new Error("Missing SPY benchmark summary for the fixed challenge window.");
  }

  return benchmark;
}

export async function getFixedChallengeWindowSummaries(): Promise<
  HistoricalRangeSummary[]
> {
  return getFixedWindowSnapshot();
}

export async function calculateFixedWindowGameResult(
  allocations: Record<string, number>,
  startingBudget = 10_000
): Promise<FixedWindowGameResult> {
  const { benchmark, snapshots: stocks } = await getGameUniverseSnapshot();

  const allocationEntries = Object.entries(allocations)
    .map(([symbol, allocation]) => [symbol.toUpperCase(), allocation] as const)
    .filter(([, allocation]) => allocation > 0);

  if (allocationEntries.length === 0) {
    throw new Error("Choose at least one stock before confirming.");
  }

  const totalAllocation = allocationEntries.reduce(
    (sum, [, allocation]) => sum + allocation,
    0
  );

  if (totalAllocation > 100) {
    throw new Error("Total allocation cannot exceed 100% of your budget.");
  }

  let portfolioValue = startingBudget;

  for (const [symbol, allocation] of allocationEntries) {
    const summary = stocks.find((stock) => stock.symbol === symbol);

    if (!summary) {
      throw new Error(`Missing fixed-window data for ${symbol}.`);
    }

    const budgetSlice = startingBudget * (allocation / 100);
    const sliceEndValue = budgetSlice * (1 + summary.returnPct / 100);

    portfolioValue += sliceEndValue - budgetSlice;
  }

  const userReturn = ((portfolioValue - startingBudget) / startingBudget) * 100;
  const benchmarkReturn = benchmark.returnPct;

  return {
    allocations: Object.fromEntries(allocationEntries),
    startingBudget,
    portfolioValue,
    userReturn,
    benchmarkReturn,
    alpha: userReturn - benchmarkReturn,
    benchmark,
    stocks,
  };
}
