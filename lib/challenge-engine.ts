import "server-only";

import {
  BENCHMARK_SYMBOL,
  MAX_TRADES,
  STARTING_CASH,
} from "@/lib/mock-market";
import {
  createChallenge,
  deleteChallenge,
  getChallengeById,
  updateChallenge,
} from "@/lib/db/challenges";
import { deletePosition, listPositionsForChallenge, upsertPosition } from "@/lib/db/positions";
import { createTrade, listTradesForChallenge } from "@/lib/db/trades";
import { getLatestQuote } from "@/lib/market-data/fmp";

export type ChallengeStatus = "active" | "completed";

export type ChallengePosition = {
  ticker: string;
  qty: number;
  avgCost: number;
};

export type ChallengeTrade = {
  id: number;
  ticker: string;
  side: "buy" | "sell";
  qty: number;
  executedPrice: number;
  tradeNumber: number;
};

type StoredChallengeState = {
  id: string;
  startingCash: number;
  cash: number;
  tradeCount: number;
  maxTrades: number;
  benchmarkSymbol: string;
  benchmarkStartPrice: number;
  status: ChallengeStatus;
  positions: ChallengePosition[];
  trades: ChallengeTrade[];
};

export type ChallengeViewState = StoredChallengeState & {
  latestPrices: Record<string, number>;
  holdingsValue: number;
  portfolioValue: number;
  userReturn: number;
  benchmarkReturn: number;
  alpha: number;
};

export type ChallengeActionResult = {
  state: ChallengeViewState;
  message: string | null;
  error: string | null;
};

export const PERSISTED_CHALLENGE_ID = "00000000-0000-4000-8000-000000000001";
export const PERSISTED_GAME_CHALLENGE_ID =
  "00000000-0000-4000-8000-000000000002";

function createInitialChallengeSeed(id: string): StoredChallengeState {
  return {
    id,
    startingCash: STARTING_CASH,
    cash: STARTING_CASH,
    tradeCount: 0,
    maxTrades: MAX_TRADES,
    benchmarkSymbol: BENCHMARK_SYMBOL,
    benchmarkStartPrice: STARTING_CASH / 20,
    status: "active",
    positions: [],
    trades: [],
  };
}

function completeIfNeeded(state: StoredChallengeState): StoredChallengeState {
  if (state.tradeCount >= state.maxTrades) {
    return {
      ...state,
      status: "completed",
    };
  }

  return state;
}

export function calculateChallengeViewState(
  state: StoredChallengeState,
  latestPrices: Record<string, number>
): ChallengeViewState {
  const holdingsValue = state.positions.reduce(
    (total, position) =>
      total + position.qty * (latestPrices[position.ticker] ?? position.avgCost),
    0
  );
  const portfolioValue = state.cash + holdingsValue;
  const userReturn =
    ((portfolioValue - state.startingCash) / state.startingCash) * 100;
  const benchmarkCurrentPrice =
    latestPrices[state.benchmarkSymbol] ?? state.benchmarkStartPrice;
  const benchmarkReturn =
    ((benchmarkCurrentPrice - state.benchmarkStartPrice) /
      state.benchmarkStartPrice) *
    100;

  return {
    ...state,
    latestPrices,
    holdingsValue,
    portfolioValue,
    userReturn,
    benchmarkReturn,
    alpha: userReturn - benchmarkReturn,
  };
}

async function getLatestPricesForState(
  state: StoredChallengeState
): Promise<Record<string, number>> {
  const symbols = Array.from(
    new Set<string>([
      state.benchmarkSymbol,
      ...state.positions.map((position) => position.ticker),
    ])
  );

  const quotes = await Promise.all(
    symbols.map(async (symbol) => {
      const quote = await getLatestQuote(symbol);
      return [symbol, quote.price] as const;
    })
  );

  return Object.fromEntries(quotes) as Record<string, number>;
}

async function hydrateChallengeState(id: string): Promise<StoredChallengeState> {
  const [challenge, positions, trades] = await Promise.all([
    getChallengeById(id),
    listPositionsForChallenge(id),
    listTradesForChallenge(id),
  ]);

  if (!challenge) {
    throw new Error(`Challenge ${id} was not found.`);
  }

  return {
    id: challenge.id,
    startingCash: challenge.starting_cash,
    cash: challenge.cash,
    tradeCount: challenge.trade_count,
    maxTrades: challenge.max_trades,
    benchmarkSymbol: normalizeTicker(challenge.benchmark_symbol),
    benchmarkStartPrice: challenge.benchmark_start_price,
    status: challenge.status,
    positions: positions.map((position) => ({
      ticker: normalizeTicker(position.ticker),
      qty: position.qty,
      avgCost: position.avg_cost,
    })),
    trades: trades
      .map((trade) => ({
        id: trade.trade_number,
        ticker: normalizeTicker(trade.ticker),
        side: trade.side,
        qty: trade.qty,
        executedPrice: trade.executed_price,
        tradeNumber: trade.trade_number,
      }))
      .sort((a, b) => b.tradeNumber - a.tradeNumber),
  };
}

async function ensureChallengeState(id: string): Promise<StoredChallengeState> {
  const existingChallenge = await getChallengeById(id);

  if (!existingChallenge) {
    const seed = createInitialChallengeSeed(id);
    const benchmarkQuote = await getLatestQuote(seed.benchmarkSymbol);
    await createChallenge({
      id: seed.id,
      starting_cash: seed.startingCash,
      cash: seed.cash,
      trade_count: seed.tradeCount,
      max_trades: seed.maxTrades,
      benchmark_symbol: seed.benchmarkSymbol,
      benchmark_start_price: benchmarkQuote.price,
      status: seed.status,
    });
  }

  return hydrateChallengeState(id);
}

async function persistChallengeState(
  state: StoredChallengeState
): Promise<ChallengeViewState> {
  const finalizedState = completeIfNeeded(state);
  const isCompleted = finalizedState.status === "completed";

  if (isCompleted) {
    const benchmarkQuote = await getLatestQuote(finalizedState.benchmarkSymbol);
    await updateChallenge(finalizedState.id, {
      cash: finalizedState.cash,
      trade_count: finalizedState.tradeCount,
      status: "completed",
      benchmark_end_price: benchmarkQuote.price,
      completed_at: new Date().toISOString(),
    });
  } else {
    await updateChallenge(finalizedState.id, {
      cash: finalizedState.cash,
      trade_count: finalizedState.tradeCount,
      status: finalizedState.status,
    });
  }

  const latestPrices = await getLatestPricesForState(finalizedState);

  return calculateChallengeViewState(finalizedState, latestPrices);
}

function ensureActiveChallenge(state: StoredChallengeState) {
  if (state.status !== "active") {
    throw new Error("Challenge is complete and cannot accept more trades.");
  }

  if (state.tradeCount >= state.maxTrades) {
    throw new Error("Challenge already used all available trades.");
  }
}

function parseTradeQty(qty: number): number {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error("Quantity must be a positive whole number.");
  }

  return qty;
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export async function getOrCreateChallengeState(
  id: string
): Promise<ChallengeViewState> {
  const state = await ensureChallengeState(id);
  const latestPrices = await getLatestPricesForState(state);
  return calculateChallengeViewState(state, latestPrices);
}

export async function resetChallenge(
  challengeId: string
): Promise<ChallengeActionResult> {
  try {
    const existingChallenge = await getChallengeById(challengeId);

    if (existingChallenge) {
      await deleteChallenge(challengeId);
    }

    const state = await getOrCreateChallengeState(challengeId);

    return {
      state,
      message: "Challenge reset. You can start trading from a clean slate.",
      error: null,
    };
  } catch (error) {
    const state = await getOrCreateChallengeState(challengeId).catch(() => {
      throw error;
    });

    return {
      state,
      message: null,
      error:
        error instanceof Error ? error.message : "Failed to reset challenge.",
    };
  }
}

export async function executeBuyOrder(
  challengeId: string,
  ticker: string,
  qty: number
): Promise<ChallengeActionResult> {
  const currentState = await ensureChallengeState(challengeId);

  try {
    ensureActiveChallenge(currentState);

    const tradeQty = parseTradeQty(qty);
    const tradeTicker = normalizeTicker(ticker);
    const executedPrice = (await getLatestQuote(tradeTicker)).price;
    const totalCost = tradeQty * executedPrice;

    if (totalCost > currentState.cash) {
      throw new Error("Not enough cash to place this buy.");
    }

    const existingPosition = currentState.positions.find(
      (position) => position.ticker === tradeTicker
    );

    const positions = existingPosition
      ? currentState.positions.map((position) => {
          if (position.ticker !== tradeTicker) {
            return position;
          }

          const nextQty = position.qty + tradeQty;
          const nextAvgCost =
            (position.avgCost * position.qty + totalCost) / nextQty;

          return {
            ...position,
            qty: nextQty,
            avgCost: nextAvgCost,
          };
        })
      : [
          ...currentState.positions,
          { ticker: tradeTicker, qty: tradeQty, avgCost: executedPrice },
        ];

    const nextTradeNumber = currentState.tradeCount + 1;

    const nextState: StoredChallengeState = {
      ...currentState,
      cash: currentState.cash - totalCost,
      tradeCount: nextTradeNumber,
      positions,
      trades: [
        {
          id: nextTradeNumber,
          ticker: tradeTicker,
          side: "buy",
          qty: tradeQty,
          executedPrice,
          tradeNumber: nextTradeNumber,
        },
        ...currentState.trades,
      ],
    };

    const savedPosition = positions.find((position) => position.ticker === tradeTicker);

    if (!savedPosition) {
      throw new Error("Position update failed after buy.");
    }

    await Promise.all([
      upsertPosition({
        challenge_id: challengeId,
        ticker: savedPosition.ticker,
        qty: savedPosition.qty,
        avg_cost: savedPosition.avgCost,
      }),
      createTrade({
        challenge_id: challengeId,
        ticker: tradeTicker,
        side: "buy",
        qty: tradeQty,
        executed_price: executedPrice,
        trade_number: nextTradeNumber,
      }),
    ]);

    return {
      state: await persistChallengeState(nextState),
      message: `Bought ${tradeQty} share${tradeQty > 1 ? "s" : ""} of ${tradeTicker}.`,
      error: null,
    };
  } catch (error) {
    const latestPrices = await getLatestPricesForState(currentState).catch(() => ({}));
    return {
      state: calculateChallengeViewState(currentState, latestPrices),
      message: null,
      error: error instanceof Error ? error.message : "Buy order failed.",
    };
  }
}

export async function executeSellOrder(
  challengeId: string,
  ticker: string,
  qty: number
): Promise<ChallengeActionResult> {
  const currentState = await ensureChallengeState(challengeId);

  try {
    ensureActiveChallenge(currentState);

    const tradeQty = parseTradeQty(qty);
    const tradeTicker = normalizeTicker(ticker);
    const existingPosition = currentState.positions.find(
      (position) => position.ticker === tradeTicker
    );

    if (!existingPosition) {
      throw new Error("You do not own this ticker.");
    }

    if (tradeQty > existingPosition.qty) {
      throw new Error("You cannot sell more shares than you own.");
    }

    const executedPrice = (await getLatestQuote(tradeTicker)).price;
    const proceeds = tradeQty * executedPrice;

    const positions = currentState.positions
      .map((position) =>
        position.ticker === tradeTicker
          ? { ...position, qty: position.qty - tradeQty }
          : position
      )
      .filter((position) => position.qty > 0);

    const nextTradeNumber = currentState.tradeCount + 1;

    const nextState: StoredChallengeState = {
      ...currentState,
      cash: currentState.cash + proceeds,
      tradeCount: nextTradeNumber,
      positions,
      trades: [
        {
          id: nextTradeNumber,
          ticker: tradeTicker,
          side: "sell",
          qty: tradeQty,
          executedPrice,
          tradeNumber: nextTradeNumber,
        },
        ...currentState.trades,
      ],
    };

    await Promise.all([
      existingPosition.qty === tradeQty
        ? deletePosition(challengeId, tradeTicker)
        : upsertPosition({
            challenge_id: challengeId,
            ticker: tradeTicker,
            qty: existingPosition.qty - tradeQty,
            avg_cost: existingPosition.avgCost,
          }),
      createTrade({
        challenge_id: challengeId,
        ticker: tradeTicker,
        side: "sell",
        qty: tradeQty,
        executed_price: executedPrice,
        trade_number: nextTradeNumber,
      }),
    ]);

    return {
      state: await persistChallengeState(nextState),
      message: `Sold ${tradeQty} share${tradeQty > 1 ? "s" : ""} of ${tradeTicker}.`,
      error: null,
    };
  } catch (error) {
    const latestPrices = await getLatestPricesForState(currentState).catch(() => ({}));
    return {
      state: calculateChallengeViewState(currentState, latestPrices),
      message: null,
      error: error instanceof Error ? error.message : "Sell order failed.",
    };
  }
}

export async function buildChallengePortfolio(
  challengeId: string,
  allocations: Record<string, number>
): Promise<ChallengeActionResult> {
  const normalizedAllocations = Object.entries(allocations)
    .map(([ticker, allocation]) => ({
      ticker: normalizeTicker(ticker),
      allocation,
    }))
    .filter(({ allocation }) => allocation > 0);

  if (normalizedAllocations.length === 0) {
    const state = await getOrCreateChallengeState(challengeId);
    return {
      state,
      message: null,
      error: "Choose at least one stock before confirming.",
    };
  }

  const totalAllocation = normalizedAllocations.reduce(
    (sum, entry) => sum + entry.allocation,
    0
  );

  if (totalAllocation > 100) {
    const state = await getOrCreateChallengeState(challengeId);
    return {
      state,
      message: null,
      error: "Total allocation cannot exceed 100% of your budget.",
    };
  }

  await resetChallenge(challengeId);

  const purchaseResults: ChallengeActionResult[] = [];

  for (const entry of normalizedAllocations) {
    const quote = await getLatestQuote(entry.ticker);
    const budgetSlice = STARTING_CASH * (entry.allocation / 100);
    const qty = Math.floor(budgetSlice / quote.price);

    if (qty <= 0) {
      continue;
    }

    const result = await executeBuyOrder(challengeId, entry.ticker, qty);
    purchaseResults.push(result);
  }

  if (purchaseResults.length === 0) {
    const state = await getOrCreateChallengeState(challengeId);
    return {
      state,
      message: null,
      error: "Allocations were too small to buy whole shares.",
    };
  }

  const finalResult = purchaseResults[purchaseResults.length - 1]!;

  return {
    state: finalResult.state,
    message: "Portfolio built. See how you stack up against the S&P 500.",
    error: null,
  };
}
