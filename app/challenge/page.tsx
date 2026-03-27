import Link from "next/link";

import { ChallengeDashboard } from "@/app/challenge/challenge-dashboard";
import { CreateChallengeForm } from "@/app/challenge/create-challenge-form";
import {
  getOrCreateChallengeState,
  PERSISTED_CHALLENGE_ID,
} from "@/lib/challenge-engine";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export default async function ChallengePage() {
  const hasSupabaseConfig = hasSupabaseServerConfig();
  let challengeState = null;
  let pageError: string | null = null;

  if (hasSupabaseConfig) {
    try {
      challengeState = await getOrCreateChallengeState(PERSISTED_CHALLENGE_ID);
    } catch (error) {
      pageError =
        error instanceof Error
          ? error.message
          : "Failed to load the persisted challenge state.";
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-10 lg:px-12">
      {challengeState ? (
        <ChallengeDashboard initialState={challengeState} />
      ) : (
        <section className="rounded-[2rem] border border-panel-border bg-panel p-8 shadow-[0_20px_70px_rgba(22,33,29,0.08)] backdrop-blur-sm sm:p-10">
          <p className="text-sm font-semibold tracking-[0.18em] text-muted uppercase">
            Milestone 6
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {pageError ? "Market data configuration required" : "Supabase configuration required"}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
            {pageError
              ? "Milestone 7 uses real server-side quotes, so the dashboard needs a working FMP setup before it can load."
              : "Milestone 6 persists challenge state in Supabase, so the dashboard needs server environment variables before it can load."}
          </p>
          {pageError ? (
            <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {pageError}
            </p>
          ) : null}
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Add `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
            `FMP_API_KEY` to `.env.local`, then restart the dev server.
          </p>
        </section>
      )}

      <section className="mt-6 rounded-[2rem] border border-panel-border bg-panel p-8 shadow-[0_20px_70px_rgba(22,33,29,0.08)] backdrop-blur-sm sm:p-10">
        <section className="rounded-2xl border border-panel-border bg-white/80 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-foreground">
            Create Challenge Demo
          </h2>
          <p className="mt-1 text-sm text-muted">
            The Milestone 2.5 helper remains available here, while Milestone 7
            now fetches real server-side quotes for gameplay.
          </p>

          {!hasSupabaseConfig ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Add Supabase values to `.env.local` and restart the dev server to
              enable the create button.
            </p>
          ) : null}

          <CreateChallengeForm />
        </section>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-transform duration-150 hover:-translate-y-0.5 hover:bg-[#20302b]"
          >
            Back Home
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-panel-border bg-white/70 px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-white"
          >
            Review Rules
          </Link>
        </div>
      </section>
    </main>
  );
}
