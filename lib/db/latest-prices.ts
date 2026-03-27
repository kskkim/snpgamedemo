import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  LatestPrice,
  LatestPriceInsert,
} from "@/lib/db/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DbClient = SupabaseClient<Database>;
type QueryOptions = { client?: DbClient };

export type UpsertLatestPriceInput = {
  ticker: string;
  price: number;
  source: string;
  updated_at?: string;
};

function getClient(client?: DbClient): DbClient {
  return client ?? createSupabaseServerClient();
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export async function getLatestPrice(
  ticker: string,
  options: QueryOptions = {}
): Promise<LatestPrice | null> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("latest_prices")
    .select("*")
    .eq("ticker", normalizeTicker(ticker))
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load latest price for ${ticker}: ${error.message}`
    );
  }

  return (data as LatestPrice | null) ?? null;
}

export async function listLatestPrices(
  tickers?: string[],
  options: QueryOptions = {}
): Promise<LatestPrice[]> {
  const supabase = getClient(options.client);
  const normalizedTickers = tickers?.map(normalizeTicker);
  let query = supabase.from("latest_prices").select("*").order("ticker");

  if (normalizedTickers && normalizedTickers.length > 0) {
    query = query.in("ticker", normalizedTickers);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list latest prices: ${error.message}`);
  }

  return (data ?? []) as LatestPrice[];
}

export async function upsertLatestPrice(
  input: UpsertLatestPriceInput,
  options: QueryOptions = {}
): Promise<LatestPrice> {
  const supabase = getClient(options.client);
  const payload: LatestPriceInsert = {
    ticker: normalizeTicker(input.ticker),
    price: input.price,
    source: input.source,
    updated_at: input.updated_at ?? new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("latest_prices")
    .upsert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to upsert latest price: ${error.message}`);
  }

  return data as LatestPrice;
}
