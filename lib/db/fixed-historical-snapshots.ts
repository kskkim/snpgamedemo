import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  FixedHistoricalSnapshot,
  FixedHistoricalSnapshotInsert,
} from "@/lib/db/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DbClient = SupabaseClient<Database>;
type QueryOptions = { client?: DbClient };

function getClient(client?: DbClient): DbClient {
  return client ?? createSupabaseServerClient();
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export async function listFixedHistoricalSnapshotsForRange(
  startDate: string,
  endDate: string,
  options: QueryOptions = {}
): Promise<FixedHistoricalSnapshot[]> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("fixed_historical_snapshots")
    .select("*")
    .eq("start_date", startDate)
    .eq("end_date", endDate)
    .order("symbol", { ascending: true });

  if (error) {
    throw new Error(
      `Failed to load fixed historical snapshots for ${startDate} to ${endDate}: ${error.message}`
    );
  }

  return (data ?? []) as FixedHistoricalSnapshot[];
}

export async function listFixedHistoricalSnapshotsForSymbolsAndRange(
  symbols: string[],
  startDate: string,
  endDate: string,
  options: QueryOptions = {}
): Promise<FixedHistoricalSnapshot[]> {
  const supabase = getClient(options.client);
  const normalizedSymbols = symbols.map(normalizeSymbol);
  const { data, error } = await supabase
    .from("fixed_historical_snapshots")
    .select("*")
    .eq("start_date", startDate)
    .eq("end_date", endDate)
    .in("symbol", normalizedSymbols)
    .order("symbol", { ascending: true });

  if (error) {
    throw new Error(
      `Failed to load fixed historical snapshots for ${startDate} to ${endDate}: ${error.message}`
    );
  }

  return (data ?? []) as FixedHistoricalSnapshot[];
}

export async function upsertFixedHistoricalSnapshots(
  snapshots: Array<{
    symbol: string;
    start_date: string;
    end_date: string;
    start_close: number;
    end_close: number;
    reference_open: number;
    buy_open: number;
    result_close: number;
    pre_buy_return_pct: number;
    return_pct: number;
  }>,
  options: QueryOptions = {}
): Promise<FixedHistoricalSnapshot[]> {
  const supabase = getClient(options.client);
  const payload: FixedHistoricalSnapshotInsert[] = snapshots.map((snapshot) => ({
    symbol: normalizeSymbol(snapshot.symbol),
    start_date: snapshot.start_date,
    end_date: snapshot.end_date,
    start_close: snapshot.start_close,
    end_close: snapshot.end_close,
    reference_open: snapshot.reference_open,
    buy_open: snapshot.buy_open,
    result_close: snapshot.result_close,
    pre_buy_return_pct: snapshot.pre_buy_return_pct,
    return_pct: snapshot.return_pct,
  }));

  const { data, error } = await supabase
    .from("fixed_historical_snapshots")
    .upsert(payload, { onConflict: "symbol,start_date,end_date" })
    .select("*");

  if (error) {
    throw new Error(`Failed to save fixed historical snapshots: ${error.message}`);
  }

  return (data ?? []) as FixedHistoricalSnapshot[];
}
