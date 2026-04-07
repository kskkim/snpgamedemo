import { NextResponse } from "next/server";

import { getV3AssetsPayload } from "@/lib/market-data/coingecko-v3";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";
  const force = searchParams.get("force") === "1";

  try {
    const payload = await getV3AssetsPayload(query, { force });
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load V3 CoinGecko assets.";

    return NextResponse.json(
      {
        error: message,
        assets: [],
        featured: [],
        top_gainers: [],
        top_losers: [],
        search_results: [],
      },
      { status: 500 }
    );
  }
}
