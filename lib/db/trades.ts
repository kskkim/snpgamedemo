import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Trade, TradeInsert, TradeSide } from "@/lib/db/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DbClient = SupabaseClient<Database>;
type QueryOptions = { client?: DbClient };

export type CreateTradeInput = {
  challenge_id: string;
  ticker: string;
  side: TradeSide;
  qty: number;
  executed_price: number;
  trade_number?: number;
  executed_at?: string;
};

function getClient(client?: DbClient): DbClient {
  return client ?? createSupabaseServerClient();
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export async function listTradesForChallenge(
  challengeId: string,
  options: QueryOptions = {}
): Promise<Trade[]> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("challenge_id", challengeId)
    .order("trade_number", { ascending: true });

  if (error) {
    throw new Error(
      `Failed to list trades for challenge ${challengeId}: ${error.message}`
    );
  }

  return (data ?? []) as Trade[];
}

export async function getNextTradeNumber(
  challengeId: string,
  options: QueryOptions = {}
): Promise<number> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("trades")
    .select("trade_number")
    .eq("challenge_id", challengeId)
    .order("trade_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to determine next trade number for challenge ${challengeId}: ${error.message}`
    );
  }

  const latestTrade = data as Pick<Trade, "trade_number"> | null;

  return (latestTrade?.trade_number ?? 0) + 1;
}

export async function createTrade(
  input: CreateTradeInput,
  options: QueryOptions = {}
): Promise<Trade> {
  const supabase = getClient(options.client);
  const tradeNumber =
    input.trade_number ?? (await getNextTradeNumber(input.challenge_id, options));
  const payload: TradeInsert = {
    challenge_id: input.challenge_id,
    ticker: normalizeTicker(input.ticker),
    side: input.side,
    qty: input.qty,
    executed_price: input.executed_price,
    trade_number: tradeNumber,
    executed_at: input.executed_at ?? new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("trades")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create trade: ${error.message}`);
  }

  return data as Trade;
}
