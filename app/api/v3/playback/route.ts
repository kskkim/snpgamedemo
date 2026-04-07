import { NextResponse } from "next/server";

import { getV3AssetChartsByIds } from "@/lib/market-data/coingecko-v3";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = (searchParams.get("ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    const charts = await getV3AssetChartsByIds(ids);
    return NextResponse.json({ charts });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load V3 playback charts.";

    return NextResponse.json({ error: message, charts: {} }, { status: 500 });
  }
}
