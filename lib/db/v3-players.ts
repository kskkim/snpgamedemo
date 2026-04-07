import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, V3Player } from "@/lib/db/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DbClient = SupabaseClient<Database>;
type QueryOptions = { client?: DbClient };

export type UpsertV3PlayerInput = {
  email: string;
  username: string;
};

function getClient(client?: DbClient): DbClient {
  return client ?? createSupabaseServerClient();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string): string {
  return username.trim();
}

export async function upsertV3Player(
  input: UpsertV3PlayerInput,
  options: QueryOptions = {}
): Promise<V3Player> {
  const supabase = getClient(options.client);
  const payload = {
    email: normalizeEmail(input.email),
    username: normalizeUsername(input.username),
  };

  const { data, error } = await supabase
    .from("v3_players")
    .upsert(payload, { onConflict: "email" })
    .select("*")
    .single();

  if (error) {
    throw new Error("Failed to save V3 player: " + error.message);
  }

  return data as V3Player;
}

export async function getV3PlayerByEmail(
  email: string,
  options: QueryOptions = {}
): Promise<V3Player | null> {
  const supabase = getClient(options.client);
  const { data, error } = await supabase
    .from("v3_players")
    .select("*")
    .eq("email", normalizeEmail(email))
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load V3 player: " + error.message);
  }

  return (data as V3Player | null) ?? null;
}
