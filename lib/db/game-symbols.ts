import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, GameSymbol } from "@/lib/db/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DbClient = SupabaseClient<Database>;
type QueryOptions = { client?: DbClient };

export type GameSymbolOption = {
  symbol: string;
  companyName: string;
  isFeatured: boolean;
};

function getClient(client?: DbClient): DbClient {
  return client ?? createSupabaseServerClient();
}

function toGameSymbolOption(row: GameSymbol): GameSymbolOption {
  return {
    symbol: row.symbol.trim().toUpperCase(),
    companyName: row.company_name,
    isFeatured: row.is_featured,
  };
}

export async function listGameSymbols(
  options: QueryOptions = {}
): Promise<GameSymbolOption[]> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("game_symbols")
    .select("symbol, company_name, is_featured")
    .order("is_featured", { ascending: false })
    .order("symbol", { ascending: true });

  if (error) {
    throw new Error(`Failed to load game symbols: ${error.message}`);
  }

  return ((data ?? []) as GameSymbol[]).map(toGameSymbolOption);
}
