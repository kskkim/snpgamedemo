import { NextResponse } from "next/server";

import { searchSymbols } from "@/lib/market-data/fmp";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";

  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchSymbols(query);
    return NextResponse.json({ results });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to search market symbols.";

    return NextResponse.json({ error: message, results: [] }, { status: 500 });
  }
}
