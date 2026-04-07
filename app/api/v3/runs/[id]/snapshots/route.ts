import { NextResponse } from "next/server";

import { createV3RunSnapshot } from "@/lib/db/v3-runs";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export async function POST(
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
        benchmarkValue?: number;
        holdingsValue?: Array<{ symbol?: string; value?: number }>;
        capturedAt?: string;
      }
    | null;

  if (!id) {
    return NextResponse.json({ error: "Run id is required." }, { status: 400 });
  }

  if (
    typeof body?.portfolioValue !== "number" ||
    typeof body?.benchmarkValue !== "number"
  ) {
    return NextResponse.json(
      { error: "portfolioValue and benchmarkValue are required." },
      { status: 400 }
    );
  }

  try {
    const snapshot = await createV3RunSnapshot({
      run_id: id,
      portfolio_value: body.portfolioValue,
      benchmark_value: body.benchmarkValue,
      holdings_value: Array.isArray(body.holdingsValue)
        ? body.holdingsValue
            .filter(
              (entry): entry is { symbol: string; value: number } =>
                typeof entry?.symbol === "string" && typeof entry?.value === "number"
            )
            .map((entry) => ({ symbol: entry.symbol, value: entry.value }))
        : [],
      captured_at: typeof body?.capturedAt === "string" ? body.capturedAt : undefined,
    });

    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save the V3 snapshot.",
      },
      { status: 500 }
    );
  }
}
