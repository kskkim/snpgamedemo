"use server";

import "server-only";

import { createChallenge } from "@/lib/db/challenges";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export type CreateChallengeActionState = {
  error: string | null;
  challenge: {
    id: string;
    starting_cash: number;
    cash: number;
    benchmark_symbol: string;
    trade_count: number;
    status: string;
  } | null;
};

export async function createChallengeAction(
  previousState: CreateChallengeActionState
): Promise<CreateChallengeActionState> {
  void previousState;

  if (!hasSupabaseServerConfig()) {
    return {
      error:
        "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local first.",
      challenge: null,
    };
  }

  try {
    const challenge = await createChallenge({
      starting_cash: 10000,
      cash: 10000,
      max_trades: 10,
      benchmark_symbol: "SPY",
      benchmark_start_price: 500,
      trade_count: 0,
      status: "active",
    });

    return {
      error: null,
      challenge: {
        id: challenge.id,
        starting_cash: challenge.starting_cash,
        cash: challenge.cash,
        benchmark_symbol: challenge.benchmark_symbol,
        trade_count: challenge.trade_count,
        status: challenge.status,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create challenge.";

    return {
      error: message,
      challenge: null,
    };
  }
}
