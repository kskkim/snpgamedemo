import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type Challenge,
  type ChallengeInsert,
  type ChallengeStatus,
  type ChallengeUpdate,
  type Database,
} from "@/lib/db/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DbClient = SupabaseClient<Database>;
type QueryOptions = { client?: DbClient };

export type CreateChallengeInput = {
  id?: string;
  user_id?: string | null;
  starting_cash: number;
  cash?: number;
  trade_count?: number;
  max_trades?: number;
  benchmark_symbol: string;
  benchmark_start_price: number;
  benchmark_end_price?: number | null;
  status?: ChallengeStatus;
  started_at?: string;
  completed_at?: string | null;
};

export type UpdateChallengeInput = Omit<ChallengeUpdate, "benchmark_symbol"> & {
  benchmark_symbol?: string;
};

function getClient(client?: DbClient): DbClient {
  return client ?? createSupabaseServerClient();
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export async function listChallenges(
  options: QueryOptions = {}
): Promise<Challenge[]> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list challenges: ${error.message}`);
  }

  return (data ?? []) as Challenge[];
}

export async function getChallengeById(
  id: string,
  options: QueryOptions = {}
): Promise<Challenge | null> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load challenge ${id}: ${error.message}`);
  }

  return (data as Challenge | null) ?? null;
}

export async function createChallenge(
  input: CreateChallengeInput,
  options: QueryOptions = {}
): Promise<Challenge> {
  const supabase = getClient(options.client);
  const isCompleted = input.status === "completed";
  const payload: ChallengeInsert = {
    id: input.id,
    user_id: input.user_id ?? null,
    starting_cash: input.starting_cash,
    cash: input.cash ?? input.starting_cash,
    trade_count: input.trade_count ?? 0,
    max_trades: input.max_trades ?? 10,
    benchmark_symbol: normalizeTicker(input.benchmark_symbol),
    benchmark_start_price: input.benchmark_start_price,
    benchmark_end_price: input.benchmark_end_price ?? null,
    status: input.status ?? "active",
    started_at: input.started_at ?? new Date().toISOString(),
    completed_at: isCompleted
      ? input.completed_at ?? new Date().toISOString()
      : input.completed_at ?? null,
  };

  const { data, error } = await supabase
    .from("challenges")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create challenge: ${error.message}`);
  }

  return data as Challenge;
}

export async function updateChallenge(
  id: string,
  updates: UpdateChallengeInput,
  options: QueryOptions = {}
): Promise<Challenge> {
  const supabase = getClient(options.client);
  const payload: ChallengeUpdate = {
    ...updates,
    benchmark_symbol: updates.benchmark_symbol
      ? normalizeTicker(updates.benchmark_symbol)
      : updates.benchmark_symbol,
  };

  const { data, error } = await supabase
    .from("challenges")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update challenge ${id}: ${error.message}`);
  }

  return data as Challenge;
}

export async function markChallengeCompleted(
  id: string,
  benchmark_end_price: number,
  options: QueryOptions & { completed_at?: string; cash?: number } = {}
): Promise<Challenge> {
  const supabase = getClient(options.client);
  const payload: ChallengeUpdate = {
    status: "completed",
    benchmark_end_price,
    completed_at: options.completed_at ?? new Date().toISOString(),
  };

  if (options.cash !== undefined) {
    payload.cash = options.cash;
  }

  const { data, error } = await supabase
    .from("challenges")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to complete challenge ${id}: ${error.message}`);
  }

  return data as Challenge;
}

export async function deleteChallenge(
  id: string,
  options: QueryOptions = {}
): Promise<void> {
  const supabase = getClient(options.client);
  const { error } = await supabase.from("challenges").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete challenge ${id}: ${error.message}`);
  }
}
