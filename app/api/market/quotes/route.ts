import { NextResponse } from "next/server";

import { getLatestQuote } from "@/lib/market-data/fmp";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbols = (searchParams.get("symbols") ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ quotes: {} });
  }

  try {
    const entries = await Promise.all(
      Array.from(new Set(symbols)).map(async (symbol) => {
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

    return NextResponse.json({ quotes: Object.fromEntries(entries) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load quotes.";

    return NextResponse.json({ error: message, quotes: {} }, { status: 500 });
  }
}
