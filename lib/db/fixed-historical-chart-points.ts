import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FixedHistoricalChartPoint = {
  symbol: string;
  pointKey: string;
  price: number;
};

function normalizeSymbol(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizePointKey(row: Record<string, unknown>): string | null {
  const value =
    row.point_key ??
    row.point_time ??
    row.time_key ??
    row.label ??
    row.time_label ??
    row.recorded_at ??
    row.ts;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePrice(row: Record<string, unknown>): number | null {
  return (
    normalizeNumber(row.price) ??
    normalizeNumber(row.value) ??
    normalizeNumber(row.close) ??
    normalizeNumber(row.chart_price)
  );
}

export async function listFixedHistoricalChartPointsForSymbolsAndRange(
  symbols: string[],
  startDate: string,
  endDate: string
): Promise<FixedHistoricalChartPoint[]> {
  const supabase = createSupabaseServerClient();
  const normalizedSymbols = symbols.map((symbol) => symbol.trim().toUpperCase());
  const { data, error } = await (supabase as never as {
    from: (
      table: string
    ) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            in: (column: string, values: string[]) => Promise<{
              data: Record<string, unknown>[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from("fixed_historical_chart_points")
    .select("*")
    .eq("start_date", startDate)
    .eq("end_date", endDate)
    .in("symbol", normalizedSymbols);

  if (error) {
    throw new Error(
      `Failed to load fixed historical chart points for ${startDate} to ${endDate}: ${error.message}`
    );
  }

  return (data ?? [])
    .map((row) => {
      const symbol = normalizeSymbol(row.symbol);
      const pointKey = normalizePointKey(row);
      const price = normalizePrice(row);

      if (!symbol || !pointKey || price === null) {
        return null;
      }

      return {
        symbol,
        pointKey,
        price,
      };
    })
    .filter((row): row is FixedHistoricalChartPoint => row !== null)
    .sort((left, right) => left.pointKey.localeCompare(right.pointKey));
}
