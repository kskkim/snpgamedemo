import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Position, PositionInsert } from "@/lib/db/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DbClient = SupabaseClient<Database>;
type QueryOptions = { client?: DbClient };

export type UpsertPositionInput = {
  challenge_id: string;
  ticker: string;
  qty: number;
  avg_cost: number;
};

function getClient(client?: DbClient): DbClient {
  return client ?? createSupabaseServerClient();
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export async function listPositionsForChallenge(
  challengeId: string,
  options: QueryOptions = {}
): Promise<Position[]> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("positions")
    .select("*")
    .eq("challenge_id", challengeId)
    .order("ticker", { ascending: true });

  if (error) {
    throw new Error(
      `Failed to list positions for challenge ${challengeId}: ${error.message}`
    );
  }

  return (data ?? []) as Position[];
}

export async function getPosition(
  challengeId: string,
  ticker: string,
  options: QueryOptions = {}
): Promise<Position | null> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("positions")
    .select("*")
    .eq("challenge_id", challengeId)
    .eq("ticker", normalizeTicker(ticker))
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load ${ticker} for challenge ${challengeId}: ${error.message}`
    );
  }

  return (data as Position | null) ?? null;
}

export async function upsertPosition(
  input: UpsertPositionInput,
  options: QueryOptions = {}
): Promise<Position> {
  const supabase = getClient(options.client);
  const payload: PositionInsert = {
    challenge_id: input.challenge_id,
    ticker: normalizeTicker(input.ticker),
    qty: input.qty,
    avg_cost: input.avg_cost,
  };

  const { data, error } = await supabase
    .from("positions")
    .upsert(payload, { onConflict: "challenge_id,ticker" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to upsert position: ${error.message}`);
  }

  return data as Position;
}

export async function deletePosition(
  challengeId: string,
  ticker: string,
  options: QueryOptions = {}
): Promise<void> {
  const supabase = getClient(options.client);
  const { error } = await supabase
    .from("positions")
    .delete()
    .eq("challenge_id", challengeId)
    .eq("ticker", normalizeTicker(ticker));

  if (error) {
    throw new Error(
      `Failed to delete ${ticker} for challenge ${challengeId}: ${error.message}`
    );
  }
}
