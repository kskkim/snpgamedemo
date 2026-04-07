import { NextResponse } from "next/server";

import { hasSupabaseServerConfig } from "@/lib/supabase/server";
import { listActiveV3Runs } from "@/lib/db/v3-runs";
import { syncV3RunHourlyHistory } from "@/lib/v3-run-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasSupabaseServerConfig()) {
    return NextResponse.json(
      {
        error:
          "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local first.",
      },
      { status: 500 }
    );
  }

  try {
    const runs = await listActiveV3Runs();
    const syncedRuns = [];

    for (const run of runs) {
      const { run: syncedRun, snapshots } = await syncV3RunHourlyHistory(run);
      syncedRuns.push({
        id: syncedRun.id,
        status: syncedRun.status,
        lastSyncedAt: syncedRun.last_synced_at,
        snapshotCount: snapshots.length,
      });
    }

    return NextResponse.json({
      ok: true,
      syncedCount: syncedRuns.length,
      runs: syncedRuns,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to sync active V3 runs.",
      },
      { status: 500 }
    );
  }
}
