import { getGameUniverseSnapshot } from "@/lib/market-data/twelve-data";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

import { GameFlow } from "@/app/game/game-flow";

export const dynamic = "force-dynamic";

export default async function GamePage() {
  const hasSupabaseConfig = hasSupabaseServerConfig();

  if (!hasSupabaseConfig) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12 sm:px-10">
        <section className="rounded-[2rem] border border-panel-border bg-panel p-8 shadow-[0_20px_70px_rgba(22,33,29,0.08)]">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Game configuration required
          </h1>
          <p className="mt-4 text-lg leading-8 text-muted">
            The game route needs Supabase configured before it can load the
            seeded fixed snapshot.
          </p>
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to
            `.env.local`, then restart the dev server.
          </p>
        </section>
      </main>
    );
  }

  let gameUniverse = null;
  let pageError: string | null = null;

  try {
    gameUniverse = await getGameUniverseSnapshot();
  } catch (error) {
    pageError =
      error instanceof Error
        ? error.message.includes("429")
          ? "Fixed historical game data is temporarily unavailable because the Twelve Data rate limit was reached."
          : error.message
        : "Failed to load the fixed historical game data.";
  }

  if (!gameUniverse) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12 sm:px-10">
        <section className="rounded-[2rem] border border-panel-border bg-panel p-8 shadow-[0_20px_70px_rgba(22,33,29,0.08)]">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Fixed historical game unavailable
          </h1>
          <p className="mt-4 text-lg leading-8 text-muted">
            The game route could not load the manually seeded March 19 to March
            20 market snapshot from Supabase.
          </p>
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </p>
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Seed the fixed snapshot rows in Supabase, then reload `/game`.
          </p>
        </section>
      </main>
    );
  }

  return (
    <GameFlow
      initialSnapshot={gameUniverse.snapshots}
      initialBenchmark={gameUniverse.benchmark}
      chartPoints={gameUniverse.chartPoints}
      featuredStocks={gameUniverse.featuredSymbols}
      searchableStocks={gameUniverse.searchableSymbols}
    />
  );
}
