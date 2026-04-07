import { NextResponse } from "next/server";

import { createV3Run, type CreateV3RunAllocationInput } from "@/lib/db/v3-runs";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json(
      {
        error:
          "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local first.",
      },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        playerId?: string;
        playerEmail?: string;
        playerUsername?: string;
        selectedSymbols?: string[];
        allocations?: Array<{
          symbol?: string;
          allocation?: number;
          startingPrice?: number;
          shares?: number;
        }>;
        startingBudget?: number;
        durationSeconds?: number;
        benchmarkSymbol?: string;
        benchmarkStartPrice?: number;
      }
    | null;

  if (!body?.playerId || !body.playerEmail || !body.playerUsername) {
    return NextResponse.json(
      { error: "Player details are required." },
      { status: 400 }
    );
  }

  try {
    const run = await createV3Run({
      player_id: body.playerId,
      player_email: body.playerEmail,
      player_username: body.playerUsername,
        selected_symbols: Array.isArray(body.selectedSymbols) ? body.selectedSymbols : [],
        allocations: Array.isArray(body.allocations)
          ? body.allocations
            .filter(
              (entry): entry is CreateV3RunAllocationInput =>
                typeof entry?.symbol === "string" && typeof entry?.allocation === "number"
            )
            .map((entry) => ({
              symbol: entry.symbol,
              allocation: entry.allocation,
              startingPrice:
                typeof entry.startingPrice === "number" ? entry.startingPrice : undefined,
              shares: typeof entry.shares === "number" ? entry.shares : undefined,
            }))
        : [],
      starting_budget:
        typeof body.startingBudget === "number" ? body.startingBudget : 10_000,
      duration_seconds:
        typeof body.durationSeconds === "number" ? body.durationSeconds : 300,
      benchmark_symbol:
        typeof body.benchmarkSymbol === "string" ? body.benchmarkSymbol : "SPYON",
      benchmark_start_price:
        typeof body.benchmarkStartPrice === "number" ? body.benchmarkStartPrice : null,
    });

    return NextResponse.json({ run: { id: run.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start the V3 run.";
    const normalizedMessage =
      message.includes("allocations") && message.includes("schema cache")
        ? "Your Supabase schema is missing the latest V3 columns. Apply migrations 004 and 005, then try again."
        : message;

    return NextResponse.json(
      {
        error: normalizedMessage,
      },
      { status: 500 }
    );
  }
}
