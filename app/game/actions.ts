"use server";

import "server-only";

import { createChallenge, deleteChallenge, getChallengeById, updateChallenge } from "@/lib/db/challenges";
import { upsertPosition } from "@/lib/db/positions";
import { createTrade } from "@/lib/db/trades";
import { PERSISTED_GAME_CHALLENGE_ID } from "@/lib/challenge-engine";
import {
  calculateFixedWindowGameResult,
  getBenchmarkSummaryForRange,
  FIXED_CHALLENGE_BENCHMARK_SYMBOL,
  FIXED_CHALLENGE_END_DATE,
  FIXED_CHALLENGE_START_DATE,
  type FixedWindowGameResult,
} from "@/lib/market-data/challenge-window";

export type GamePortfolioActionResult = {
  message: string | null;
  error: string | null;
  result: FixedWindowGameResult | null;
};

type GameActionResponse = {
  message: string | null;
  error: string | null;
};

export async function submitGamePortfolio(input: {
  allocations: Record<string, number>;
}): Promise<GamePortfolioActionResult> {
  try {
    const result = await calculateFixedWindowGameResult(input.allocations);

    const existingChallenge = await getChallengeById(PERSISTED_GAME_CHALLENGE_ID);

    if (existingChallenge) {
      await deleteChallenge(PERSISTED_GAME_CHALLENGE_ID);
    }

    await createChallenge({
      id: PERSISTED_GAME_CHALLENGE_ID,
      starting_cash: result.startingBudget,
      cash: result.startingBudget,
      max_trades: 10,
      benchmark_symbol: FIXED_CHALLENGE_BENCHMARK_SYMBOL,
      benchmark_start_price: result.benchmark.buyOpen,
      trade_count: 0,
      status: "active",
    });

    let cash = result.startingBudget;
    let tradeNumber = 0;

    for (const [symbol, allocation] of Object.entries(result.allocations)) {
      const summary = result.stocks.find((stock) => stock.symbol === symbol);

      if (!summary) {
        continue;
      }

      const budgetSlice = result.startingBudget * (allocation / 100);
      const qty = Math.floor(budgetSlice / summary.buyOpen);

      if (qty <= 0) {
        continue;
      }

      const cost = qty * summary.buyOpen;
      cash -= cost;
      tradeNumber += 1;

      await Promise.all([
        upsertPosition({
          challenge_id: PERSISTED_GAME_CHALLENGE_ID,
          ticker: symbol,
          qty,
          avg_cost: summary.buyOpen,
        }),
        createTrade({
          challenge_id: PERSISTED_GAME_CHALLENGE_ID,
          ticker: symbol,
          side: "buy",
          qty,
          executed_price: summary.buyOpen,
          trade_number: tradeNumber,
          executed_at: `${FIXED_CHALLENGE_END_DATE}T13:30:00.000Z`,
        }),
      ]);
    }

    await updateChallenge(PERSISTED_GAME_CHALLENGE_ID, {
      cash,
      trade_count: tradeNumber,
      benchmark_end_price: result.benchmark.resultClose,
      completed_at: `${FIXED_CHALLENGE_END_DATE}T16:00:00.000Z`,
      status: "completed",
    });

    return {
      message: "Portfolio locked in using the March 20 open.",
      error: null,
      result,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to calculate game result.";

    return {
      message: null,
      error:
        message.includes("429")
          ? "Fixed historical game data is temporarily unavailable because the Twelve Data rate limit was reached."
          : message,
      result: null,
    };
  }
}

export async function resetGameChallenge(): Promise<GameActionResponse> {
  try {
    const existingChallenge = await getChallengeById(PERSISTED_GAME_CHALLENGE_ID);

    if (existingChallenge) {
      await deleteChallenge(PERSISTED_GAME_CHALLENGE_ID);
    }

    const benchmark = await getBenchmarkSummaryForRange(
      FIXED_CHALLENGE_START_DATE,
      FIXED_CHALLENGE_END_DATE
    );

    await createChallenge({
      id: PERSISTED_GAME_CHALLENGE_ID,
      starting_cash: 10_000,
      cash: 10_000,
      max_trades: 10,
      benchmark_symbol: FIXED_CHALLENGE_BENCHMARK_SYMBOL,
      benchmark_start_price: benchmark.buyOpen,
      trade_count: 0,
      status: "active",
    });

    return {
      message: "Game reset. You can build a new fixed-window portfolio.",
      error: null,
    };
  } catch (error) {
    return {
      message: null,
      error: error instanceof Error ? error.message : "Failed to reset the game.",
    };
  }
}
