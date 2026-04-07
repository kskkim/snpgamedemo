import { V3StockPicker } from "@/app/v3/v3-stock-picker";
import {
  getV3AssetsPayload,
  type V3AssetsPayload,
} from "@/lib/market-data/coingecko-v3";

const EMPTY_DATA: V3AssetsPayload = {
  assets: [],
  featured: [],
  top_gainers: [],
  top_losers: [],
  search_results: [],
  benchmark: null,
  benchmark_chart: [],
  category: "ondo-tokenized-assets",
  cached_at: new Date(0).toISOString(),
  source_count: 0,
};

async function getInitialV3Data(): Promise<{
  initialData: V3AssetsPayload;
  loadError: string | null;
}> {
  try {
    const initialData = await getV3AssetsPayload("");
    return { initialData, loadError: null };
  } catch (error) {
    return {
      initialData: EMPTY_DATA,
      loadError:
        error instanceof Error
          ? error.message
          : "Failed to load the shared V3 dataset.",
    };
  }
}

export default async function V3Page() {
  const { initialData, loadError } = await getInitialV3Data();

  return <V3StockPicker initialData={initialData} loadError={loadError} />;
}
