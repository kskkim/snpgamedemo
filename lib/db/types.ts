export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ChallengeStatus = "active" | "completed";
export type TradeSide = "buy" | "sell";

export interface Database {
  public: {
    Tables: {
      challenges: {
        Row: {
          id: string;
          user_id: string | null;
          starting_cash: number;
          cash: number;
          trade_count: number;
          max_trades: number;
          benchmark_symbol: string;
          benchmark_start_price: number;
          benchmark_end_price: number | null;
          status: ChallengeStatus;
          started_at: string;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          starting_cash: number;
          cash: number;
          trade_count?: number;
          max_trades?: number;
          benchmark_symbol: string;
          benchmark_start_price: number;
          benchmark_end_price?: number | null;
          status?: ChallengeStatus;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          starting_cash?: number;
          cash?: number;
          trade_count?: number;
          max_trades?: number;
          benchmark_symbol?: string;
          benchmark_start_price?: number;
          benchmark_end_price?: number | null;
          status?: ChallengeStatus;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      positions: {
        Row: {
          id: string;
          challenge_id: string;
          ticker: string;
          qty: number;
          avg_cost: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          challenge_id: string;
          ticker: string;
          qty: number;
          avg_cost: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          challenge_id?: string;
          ticker?: string;
          qty?: number;
          avg_cost?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "positions_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: false;
            referencedRelation: "challenges";
            referencedColumns: ["id"];
          },
        ];
      };
      trades: {
        Row: {
          id: string;
          challenge_id: string;
          ticker: string;
          side: TradeSide;
          qty: number;
          executed_price: number;
          trade_number: number;
          executed_at: string;
        };
        Insert: {
          id?: string;
          challenge_id: string;
          ticker: string;
          side: TradeSide;
          qty: number;
          executed_price: number;
          trade_number: number;
          executed_at?: string;
        };
        Update: {
          id?: string;
          challenge_id?: string;
          ticker?: string;
          side?: TradeSide;
          qty?: number;
          executed_price?: number;
          trade_number?: number;
          executed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trades_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: false;
            referencedRelation: "challenges";
            referencedColumns: ["id"];
          },
        ];
      };
      latest_prices: {
        Row: {
          ticker: string;
          price: number;
          source: string;
          updated_at: string;
        };
        Insert: {
          ticker: string;
          price: number;
          source: string;
          updated_at?: string;
        };
        Update: {
          ticker?: string;
          price?: number;
          source?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      game_symbols: {
        Row: {
          symbol: string;
          company_name: string;
          is_featured: boolean;
        };
        Insert: {
          symbol: string;
          company_name: string;
          is_featured?: boolean;
        };
        Update: {
          symbol?: string;
          company_name?: string;
          is_featured?: boolean;
        };
        Relationships: [];
      };
      fixed_historical_snapshots: {
        Row: {
          symbol: string;
          start_date: string;
          end_date: string;
          start_close: number;
          end_close: number;
          reference_open: number;
          buy_open: number;
          result_close: number;
          pre_buy_return_pct: number;
          return_pct: number;
          created_at: string;
        };
        Insert: {
          symbol: string;
          start_date: string;
          end_date: string;
          start_close: number;
          end_close: number;
          reference_open: number;
          buy_open: number;
          result_close: number;
          pre_buy_return_pct: number;
          return_pct: number;
          created_at?: string;
        };
        Update: {
          symbol?: string;
          start_date?: string;
          end_date?: string;
          start_close?: number;
          end_close?: number;
          reference_open?: number;
          buy_open?: number;
          result_close?: number;
          pre_buy_return_pct?: number;
          return_pct?: number;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      challenge_status: ChallengeStatus;
      trade_side: TradeSide;
    };
    CompositeTypes: Record<string, never>;
  };
}

type PublicTables = Database["public"]["Tables"];

export type TableName = keyof PublicTables;

export type TableRow<T extends TableName> = PublicTables[T]["Row"];
export type TableInsert<T extends TableName> = PublicTables[T]["Insert"];
export type TableUpdate<T extends TableName> = PublicTables[T]["Update"];

export type Challenge = TableRow<"challenges">;
export type ChallengeInsert = TableInsert<"challenges">;
export type ChallengeUpdate = TableUpdate<"challenges">;

export type Position = TableRow<"positions">;
export type PositionInsert = TableInsert<"positions">;
export type PositionUpdate = TableUpdate<"positions">;

export type Trade = TableRow<"trades">;
export type TradeInsert = TableInsert<"trades">;
export type TradeUpdate = TableUpdate<"trades">;

export type LatestPrice = TableRow<"latest_prices">;
export type LatestPriceInsert = TableInsert<"latest_prices">;
export type LatestPriceUpdate = TableUpdate<"latest_prices">;

export type GameSymbol = TableRow<"game_symbols">;
export type GameSymbolInsert = TableInsert<"game_symbols">;
export type GameSymbolUpdate = TableUpdate<"game_symbols">;

export type FixedHistoricalSnapshot = TableRow<"fixed_historical_snapshots">;
export type FixedHistoricalSnapshotInsert =
  TableInsert<"fixed_historical_snapshots">;
export type FixedHistoricalSnapshotUpdate =
  TableUpdate<"fixed_historical_snapshots">;
