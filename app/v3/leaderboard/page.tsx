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

function getDisplayUsername(playerUsername: string, playerEmail: string): string {
  const fromEmail = playerEmail.split("@")[0]?.trim();
  return fromEmail || playerUsername || "Unknown";
}

function buildRows(
  runs: Awaited<ReturnType<typeof listV3Leaderboard>>,
  sortMode: SortMode
): LeaderboardRow[] {
  const runsByPlayer = new Map<string, typeof runs>();
  for (const run of runs) {
    const existing = runsByPlayer.get(run.player_id) ?? [];
    existing.push(run);
    runsByPlayer.set(run.player_id, existing);
  }

  const streakByPlayer = new Map<string, number>();
  for (const [playerId, playerRuns] of runsByPlayer.entries()) {
    const sortedRuns = [...playerRuns].sort(
      (left, right) =>
        new Date(right.completed_at ?? 0).getTime() - new Date(left.completed_at ?? 0).getTime()
    );
    streakByPlayer.set(playerId, getCurrentWinStreak(sortedRuns));
  }

  const rows = runs.map((run) => {
    return {
      id: run.id,
      username: getDisplayUsername(run.player_username, run.player_email),
      email: run.player_email,
      alpha: run.alpha_pct ?? 0,
      streak: streakByPlayer.get(run.player_id) ?? 0,
      completedAt: run.completed_at,
    } satisfies LeaderboardRow;
  });

  return rows.sort((left, right) => {
    if (sortMode === "streak") {
      if (right.streak !== left.streak) {
        return right.streak - left.streak;
      }
      if (right.alpha !== left.alpha) {
        return right.alpha - left.alpha;
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
