import { NextResponse } from "next/server";

import { upsertV3Player } from "@/lib/db/v3-players";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json(
      {
        error:
          "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local first.",
      },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: string; username?: string; walletAddress?: string }
    | null;

  const email = body?.email?.trim() ?? "";
  const walletAddress = body?.walletAddress?.trim() ?? body?.username?.trim() ?? "";

  if (!email || !walletAddress) {
    return NextResponse.json(
      { error: "Email and wallet address are required." },
      { status: 400 }
    );
  }

  try {
    const player = await upsertV3Player({ email, username: walletAddress });

    return NextResponse.json({
      player: {
        id: player.id,
        email: player.email,
        walletAddress: player.username,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save player." },
      { status: 500 }
    );
  }
}
