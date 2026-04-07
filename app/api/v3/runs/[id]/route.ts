import { NextResponse } from "next/server";

import { completeV3Run } from "@/lib/db/v3-runs";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json(
      {
        error:
          "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local first.",
      },
      { status: 500 }
    );
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        portfolioValue?: number;
        userReturnPct?: number;
        benchmarkReturnPct?: number;
        alphaPct?: number;
      }
    | null;

  if (!id) {
    return NextResponse.json({ error: "Run id is required." }, { status: 400 });
  }

  try {
    await completeV3Run(id, {
      portfolio_value:
        typeof body?.portfolioValue === "number" ? body.portfolioValue : 0,
      user_return_pct:
        typeof body?.userReturnPct === "number" ? body.userReturnPct : 0,
      benchmark_return_pct:
        typeof body?.benchmarkReturnPct === "number"
          ? body.benchmarkReturnPct
          : 0,
      alpha_pct: typeof body?.alphaPct === "number" ? body.alphaPct : 0,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to complete the V3 run.",
      },
      { status: 500 }
    );
  }
}
