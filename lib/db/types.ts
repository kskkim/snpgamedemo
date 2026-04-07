export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      v3_players: {
        Row: {
          id: string;
          auth_user_id: string | null;
          email: string;
          username: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          email: string;
          username: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string | null;
          email?: string;
          username?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      v3_runs: {
        Row: {
          id: string;
          player_id: string;
          player_email: string;
          player_username: string;
          selected_symbols: string[];
          allocations: Json;
          starting_budget: number;
          duration_seconds: number;
          benchmark_symbol: string;
          benchmark_start_price: number | null;
          portfolio_value: number | null;
          user_return_pct: number | null;
          benchmark_return_pct: number | null;
          alpha_pct: number | null;
          status: string;
          started_at: string;
          ends_at: string;
          last_synced_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          player_email: string;
          player_username: string;
          selected_symbols?: string[];
          allocations?: Json;
          starting_budget: number;
          duration_seconds?: number;
          benchmark_symbol?: string;
          benchmark_start_price?: number | null;
          portfolio_value?: number | null;
          user_return_pct?: number | null;
          benchmark_return_pct?: number | null;
          alpha_pct?: number | null;
          status?: string;
          started_at?: string;
          ends_at?: string;
          last_synced_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          player_id?: string;
          player_email?: string;
          player_username?: string;
          selected_symbols?: string[];
          allocations?: Json;
          starting_budget?: number;
          duration_seconds?: number;
          benchmark_symbol?: string;
          benchmark_start_price?: number | null;
          portfolio_value?: number | null;
          user_return_pct?: number | null;
          benchmark_return_pct?: number | null;
          alpha_pct?: number | null;
          status?: string;
          started_at?: string;
          ends_at?: string;
          last_synced_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "v3_runs_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "v3_players";
            referencedColumns: ["id"];
          },
        ];
      };
      v3_run_snapshots: {
        Row: {
          id: string;
          run_id: string;
          captured_at: string;
          portfolio_value: number;
          benchmark_value: number;
          holdings_value: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_id: string;
          captured_at?: string;
          portfolio_value: number;
          benchmark_value: number;
          holdings_value?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          run_id?: string;
          captured_at?: string;
          portfolio_value?: number;
          benchmark_value?: number;
          holdings_value?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "v3_run_snapshots_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "v3_runs";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

type PublicTables = Database["public"]["Tables"];
export type TableName = keyof PublicTables;
export type TableRow<T extends TableName> = PublicTables[T]["Row"];
export type TableInsert<T extends TableName> = PublicTables[T]["Insert"];
export type TableUpdate<T extends TableName> = PublicTables[T]["Update"];

export type V3Player = TableRow<"v3_players">;
export type V3PlayerInsert = TableInsert<"v3_players">;
export type V3PlayerUpdate = TableUpdate<"v3_players">;

export type V3Run = TableRow<"v3_runs">;
export type V3RunInsert = TableInsert<"v3_runs">;
export type V3RunUpdate = TableUpdate<"v3_runs">;
export type V3RunSnapshot = TableRow<"v3_run_snapshots">;
export type V3RunSnapshotInsert = TableInsert<"v3_run_snapshots">;
export type V3RunSnapshotUpdate = TableUpdate<"v3_run_snapshots">;
