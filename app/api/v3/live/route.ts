import { NextResponse } from "next/server";

import { getV3LiveAssetsByIds } from "@/lib/market-data/coingecko-v3";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = (searchParams.get("ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    const assets = await getV3LiveAssetsByIds(ids);
    return NextResponse.json(
      { assets },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load V3 live assets.";

    return NextResponse.json(
      { error: message, assets: [] },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
}
