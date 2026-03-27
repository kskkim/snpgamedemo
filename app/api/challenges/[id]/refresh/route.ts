import { NextResponse } from "next/server";

import { getOrCreateChallengeState } from "@/lib/challenge-engine";
import { getLatestQuote } from "@/lib/market-data/fmp";

const POPULAR_PICK_SYMBOLS = ["AAPL", "MSFT", "NVDA", "AMZN", "TSLA", "META", "SPY"];

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const selectedTicker = searchParams.get("selectedTicker")?.trim().toUpperCase();

  try {
    const state = await getOrCreateChallengeState(id);
    const symbols = Array.from(
      new Set([
        ...POPULAR_PICK_SYMBOLS,
        ...(selectedTicker ? [selectedTicker] : []),
      ])
    );

    const priceEntries = await Promise.all(
      symbols.map(async (symbol) => {
        const quote = await getLatestQuote(symbol);
        return [
          symbol,
          {
            price: quote.price,
            changePercent24h: quote.changePercent24h,
          },
        ] as const;
      })
    );

    return NextResponse.json({
      state,
      popularPrices: Object.fromEntries(priceEntries),
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to refresh prices.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
