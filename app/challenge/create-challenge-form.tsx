"use client";

import { useActionState } from "react";

import {
  createChallengeAction,
  type CreateChallengeActionState,
} from "@/app/challenge/actions";

const initialCreateChallengeState: CreateChallengeActionState = {
  error: null,
  challenge: null,
};

export function CreateChallengeForm() {
  const [state, formAction, pending] = useActionState(
    createChallengeAction,
    initialCreateChallengeState
  );

  return (
    <div className="mt-8 space-y-5">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:bg-[#20302b] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? "Creating..." : "Create Challenge"}
        </button>
      </form>

      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.challenge ? (
        <dl className="grid gap-3 rounded-2xl border border-panel-border bg-white/80 p-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">id</dt>
            <dd className="mt-1 break-all font-medium text-foreground">
              {state.challenge.id}
            </dd>
          </div>
          <div>
            <dt className="text-muted">starting_cash</dt>
            <dd className="mt-1 font-medium text-foreground">
              {state.challenge.starting_cash}
            </dd>
          </div>
          <div>
            <dt className="text-muted">cash</dt>
            <dd className="mt-1 font-medium text-foreground">
              {state.challenge.cash}
            </dd>
          </div>
          <div>
            <dt className="text-muted">benchmark_symbol</dt>
            <dd className="mt-1 font-medium text-foreground">
              {state.challenge.benchmark_symbol}
            </dd>
          </div>
          <div>
            <dt className="text-muted">trade_count</dt>
            <dd className="mt-1 font-medium text-foreground">
              {state.challenge.trade_count}
            </dd>
          </div>
          <div>
            <dt className="text-muted">status</dt>
            <dd className="mt-1 font-medium text-foreground">
              {state.challenge.status}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
