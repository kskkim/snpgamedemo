import { NextResponse } from "next/server";

import { getLatestV3RunForPlayer } from "@/lib/db/v3-runs";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";
import { syncV3RunHourlyHistory } from "@/lib/v3-run-sync";

export async function GET(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json(
      {
        error:
          "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local first.",
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const playerId = (searchParams.get("playerId") ?? "").trim();

  if (!playerId) {
    return NextResponse.json({ error: "playerId is required." }, { status: 400 });
  }

  try {
    const run = await getLatestV3RunForPlayer(playerId);

    if (!run) {
      return NextResponse.json({ run: null, snapshots: [] });
    }

    const { run: syncedRun, snapshots } = await syncV3RunHourlyHistory(run);
    return NextResponse.json({ run: syncedRun, snapshots });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load the active V3 run.",
      },
      { status: 500 }
    );
  }
}
