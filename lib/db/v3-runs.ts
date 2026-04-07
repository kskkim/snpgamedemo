import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  Json,
  V3Run,
  V3RunInsert,
  V3RunSnapshot,
  V3RunSnapshotInsert,
  V3RunUpdate,
} from "@/lib/db/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DbClient = SupabaseClient<Database>;
type QueryOptions = { client?: DbClient };

export type CreateV3RunAllocationInput = {
  symbol: string;
  allocation: number;
  startingPrice?: number;
  shares?: number;
};

export type CreateV3RunInput = {
  player_id: string;
  player_email: string;
  player_username: string;
  selected_symbols: string[];
  allocations?: CreateV3RunAllocationInput[];
  starting_budget: number;
  duration_seconds?: number;
  started_at?: string;
  benchmark_symbol?: string;
  benchmark_start_price?: number | null;
};

export type CompleteV3RunInput = {
  portfolio_value: number;
  user_return_pct: number;
  benchmark_return_pct: number;
  alpha_pct: number;
  completed_at?: string;
};

export type CreateV3RunSnapshotInput = {
  run_id: string;
  portfolio_value: number;
  benchmark_value: number;
  holdings_value?: Array<{ symbol: string; value: number }>;
  captured_at?: string;
};

function getClient(client?: DbClient): DbClient {
  return client ?? createSupabaseServerClient();
}

function normalizeSymbols(symbols: string[]): string[] {
  return Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)));
}

function normalizeAllocations(allocations: CreateV3RunAllocationInput[] | undefined): Json {
  if (!allocations) {
    return [];
  }

  return allocations
    .map((entry) => ({
      symbol: entry.symbol.trim().toUpperCase(),
      allocation: Math.max(0, entry.allocation),
      startingPrice:
        typeof entry.startingPrice === "number" ? Math.max(0, entry.startingPrice) : null,
      shares: typeof entry.shares === "number" ? Math.max(0, entry.shares) : null,
    }))
    .filter((entry) => entry.symbol.length > 0);
}

export async function createV3Run(
  input: CreateV3RunInput,
  options: QueryOptions = {}
): Promise<V3Run> {
  const supabase = getClient(options.client);
  const startedAt = input.started_at ?? new Date().toISOString();
  const durationSeconds = input.duration_seconds ?? 300;
  const endsAt = new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString();
  const payload: V3RunInsert = {
    player_id: input.player_id,
    player_email: input.player_email.trim().toLowerCase(),
    player_username: input.player_username.trim(),
    selected_symbols: normalizeSymbols(input.selected_symbols),
    allocations: normalizeAllocations(input.allocations),
    starting_budget: input.starting_budget,
    duration_seconds: durationSeconds,
    benchmark_symbol: (input.benchmark_symbol ?? "SPYON").trim().toUpperCase(),
    benchmark_start_price: input.benchmark_start_price ?? null,
    status: "active",
    started_at: startedAt,
    ends_at: endsAt,
  };

  const { data, error } = await supabase
    .from("v3_runs")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error("Failed to create V3 run: " + error.message);
  }

  return data as V3Run;
}

export async function getActiveV3RunForPlayer(
  playerId: string,
  options: QueryOptions = {}
): Promise<V3Run | null> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("v3_runs")
    .select("*")
    .eq("player_id", playerId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load active V3 run: " + error.message);
  }

  return (data as V3Run | null) ?? null;
}

export async function getLatestV3RunForPlayer(
  playerId: string,
  options: QueryOptions = {}
): Promise<V3Run | null> {
  const activeRun = await getActiveV3RunForPlayer(playerId, options);

  if (activeRun) {
    return activeRun;
  }

  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("v3_runs")
    .select("*")
    .eq("player_id", playerId)
    .in("status", ["completed", "expired", "cancelled"])
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load latest V3 run: " + error.message);
  }

  return (data as V3Run | null) ?? null;
}

export async function getV3RunById(
  id: string,
  options: QueryOptions = {}
): Promise<V3Run | null> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("v3_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load V3 run: " + error.message);
  }

  return (data as V3Run | null) ?? null;
}

export async function completeV3Run(
  id: string,
  input: CompleteV3RunInput,
  options: QueryOptions = {}
): Promise<V3Run> {
  const supabase = getClient(options.client);
  const payload: V3RunUpdate = {
    portfolio_value: input.portfolio_value,
    user_return_pct: input.user_return_pct,
    benchmark_return_pct: input.benchmark_return_pct,
    alpha_pct: input.alpha_pct,
    completed_at: input.completed_at ?? new Date().toISOString(),
    status: "completed",
  };

  const { data, error } = await supabase
    .from("v3_runs")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error("Failed to complete V3 run: " + error.message);
  }

  return data as V3Run;
}

export async function updateV3Run(
  id: string,
  input: V3RunUpdate,
  options: QueryOptions = {}
): Promise<V3Run> {
  const supabase = getClient(options.client);

  const { data, error } = await supabase
    .from("v3_runs")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error("Failed to update V3 run: " + error.message);
  }

  return data as V3Run;
}

export async function createV3RunSnapshot(
  input: CreateV3RunSnapshotInput,
  options: QueryOptions = {}
): Promise<V3RunSnapshot> {
  const supabase = getClient(options.client);
  const payload: V3RunSnapshotInsert = {
    run_id: input.run_id,
    portfolio_value: input.portfolio_value,
    benchmark_value: input.benchmark_value,
    holdings_value: (input.holdings_value ?? []) as Json,
    captured_at: input.captured_at ?? new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("v3_run_snapshots")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error("Failed to create V3 run snapshot: " + error.message);
  }

  return data as V3RunSnapshot;
}

export async function listV3RunSnapshots(
  runId: string,
  options: QueryOptions = {}
): Promise<V3RunSnapshot[]> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("v3_run_snapshots")
    .select("*")
    .eq("run_id", runId)
    .order("captured_at", { ascending: true });

  if (error) {
    throw new Error("Failed to load V3 run snapshots: " + error.message);
  }

  return (data ?? []) as V3RunSnapshot[];
}

export async function listV3Leaderboard(
  limit = 50,
  options: QueryOptions = {}
): Promise<V3Run[]> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("v3_runs")
    .select("*")
    .eq("status", "completed")
    .order("alpha_pct", { ascending: false })
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error("Failed to load V3 leaderboard: " + error.message);
  }

  return (data ?? []) as V3Run[];
}

export async function listActiveV3Runs(options: QueryOptions = {}): Promise<V3Run[]> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("v3_runs")
    .select("*")
    .eq("status", "active")
    .order("started_at", { ascending: true });

  if (error) {
    throw new Error("Failed to load active V3 runs: " + error.message);
  }

  return (data ?? []) as V3Run[];
}
