import Link from "next/link";

import { LeaderboardTable, type LeaderboardRow } from "@/app/v3/leaderboard/leaderboard-table";
import { listV3Leaderboard } from "@/lib/db/v3-runs";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

type SortMode = "alpha" | "streak";

function getSortMode(value: string | string[] | undefined): SortMode {
  return value === "streak" ? "streak" : "alpha";
}

function getCurrentWinStreak(
  runs: Array<{ alpha_pct: number | null; completed_at: string | null }>
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

function buildRows(
  runs: Awaited<ReturnType<typeof listV3Leaderboard>>,
  sortMode: SortMode
): LeaderboardRow[] {
  const runsByPlayer = new Map<
    string,
    Array<{
      id: string;
      player_username: string;
      player_email: string;
      alpha_pct: number | null;
      completed_at: string | null;
    }>
  >();

  for (const run of runs) {
    const playerRuns = runsByPlayer.get(run.player_id) ?? [];
    playerRuns.push({
      id: run.id,
      player_username: run.player_username,
      player_email: run.player_email,
      alpha_pct: run.alpha_pct,
      completed_at: run.completed_at,
    });
    runsByPlayer.set(run.player_id, playerRuns);
  }

  const rows = Array.from(runsByPlayer.entries()).map(([playerId, playerRuns]) => {
    const sortedRuns = [...playerRuns].sort((left, right) => {
      return new Date(right.completed_at ?? 0).getTime() - new Date(left.completed_at ?? 0).getTime();
    });
    const latestRun = sortedRuns[0];
    const bestAlpha = Math.max(...sortedRuns.map((run) => run.alpha_pct ?? 0));
    const currentStreak = getCurrentWinStreak(sortedRuns);

    return {
      id: playerId,
      username: latestRun?.player_username ?? "Unknown",
      email: latestRun?.player_email ?? "",
      alpha: sortMode === "streak" ? latestRun?.alpha_pct ?? 0 : bestAlpha,
      streak: currentStreak,
      completedAt: latestRun?.completed_at ?? null,
    } satisfies LeaderboardRow;
  });

  return rows.sort((left, right) => {
    if (sortMode === "streak") {
      if (right.streak !== left.streak) {
        return right.streak - left.streak;
      }
    } else if (right.alpha !== left.alpha) {
      return right.alpha - left.alpha;
    }

    return new Date(right.completedAt ?? 0).getTime() - new Date(left.completedAt ?? 0).getTime();
  });
}

export default async function V3LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const sortMode = getSortMode(resolvedSearchParams.sort);

  if (!hasSupabaseServerConfig()) {
    return (
      <main
        className="relative min-h-screen overflow-hidden px-6 py-10 text-white sm:px-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(11, 29, 34, 0.28), rgba(11, 29, 34, 0.4)), url('/treasures-home-bg.png')",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_38%),linear-gradient(to_top,rgba(223,150,78,0.34),transparent_24%)]" />
        <section className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-[1500px] items-center justify-center">
          <div className="w-full rounded-[2rem] border border-[#123343] bg-[rgba(194,100,45,0.72)] px-8 py-16 text-center shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-sm sm:px-12">
            <h1 className="text-4xl font-semibold sm:text-5xl">Leaderboard</h1>
            <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-white/88">
              Supabase is not configured yet, so leaderboard results are unavailable.
            </p>
            <Link
              href="/v3"
              className="mt-8 inline-flex rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/18"
            >
              Back to Challenge
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const runs = await listV3Leaderboard(300);
  const rows = buildRows(runs, sortMode);

  return (
    <main
      className="relative min-h-screen overflow-hidden px-6 py-10 text-white sm:px-10"
      style={{
        backgroundImage:
          "linear-gradient(rgba(11, 29, 34, 0.28), rgba(11, 29, 34, 0.4)), url('/treasures-home-bg.png')",
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_38%),linear-gradient(to_top,rgba(223,150,78,0.34),transparent_24%)]" />

      <section className="relative mx-auto w-full max-w-[1660px] rounded-[2rem] border border-[#123343] bg-[rgba(194,100,45,0.72)] px-8 py-12 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-sm sm:px-12">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-semibold sm:text-5xl">Leaderboard</h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/v3"
              className="rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/18"
            >
              Back to Challenge
            </Link>
          </div>
        </div>

        <div className="mt-10">
          <LeaderboardTable initialRows={rows} sortMode={sortMode} />
        </div>
      </section>
    </main>
  );
}
