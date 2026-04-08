import { NextResponse } from "next/server";

import { listV3CompletedRunsForPlayer } from "@/lib/db/v3-runs";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

function getCurrentWinStreak(
  runs: Array<{ alpha_pct: number | null }>
): number {
  let streak = 0;

  for (const run of runs) {
    if ((run.alpha_pct ?? 0) > 0) {
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 500 }
    );
  }

  const { id } = await params;
  const playerId = id?.trim();

  if (!playerId) {
    return NextResponse.json({ error: "Player id is required." }, { status: 400 });
  }

  try {
    const runs = await listV3CompletedRunsForPlayer(playerId, 50);
    return NextResponse.json({
      consecutiveWins: getCurrentWinStreak(runs),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load streak." },
      { status: 500 }
    );
  }
}
