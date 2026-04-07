"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SortMode = "alpha" | "streak";

export type LeaderboardRow = {
  id: string;
  username: string;
  email: string;
  alpha: number;
  streak: number;
  completedAt: string | null;
};

type PlayerProfile = {
  id: string;
  email: string;
  walletAddress: string;
};

type LeaderboardTableProps = {
  initialRows: LeaderboardRow[];
  sortMode: SortMode;
};

const V3_PLAYER_KEY = "v3-game-player-profile";

function formatPercentPoints(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} p.p.`;
}

function formatTime(isoString: string | null): string {
  if (!isoString) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoString));
}

function sortRows(rows: LeaderboardRow[], sortMode: SortMode): LeaderboardRow[] {
  return [...rows].sort((left, right) => {
    if (sortMode === "streak") {
      if (right.streak !== left.streak) {
        return right.streak - left.streak;
      }
    } else if (right.alpha !== left.alpha) {
      return right.alpha - left.alpha;
    }

    return new Date(right.completedAt ?? 0).getTime() - new Date(left.completedAt ?? 0).getTime();
  });
}

export function LeaderboardTable({
  initialRows,
  sortMode,
}: LeaderboardTableProps) {
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);

  useEffect(() => {
    try {
      const rawPlayer = window.localStorage.getItem(V3_PLAYER_KEY);

      if (!rawPlayer) {
        return;
      }

      const parsed = JSON.parse(rawPlayer) as PlayerProfile;

      if (parsed?.id && parsed?.walletAddress) {
        setPlayerProfile(parsed);
      }
    } catch {
      setPlayerProfile(null);
    }
  }, []);

  const rows = useMemo(() => sortRows(initialRows, sortMode), [initialRows, sortMode]);

  const placeholderRow = useMemo(
    () =>
      ({
        id: playerProfile?.id ?? "join-row",
        username: playerProfile?.walletAddress ?? "You",
        email: playerProfile?.email ?? "",
        alpha: 0,
        streak: 0,
        completedAt: null,
      }) satisfies LeaderboardRow,
    [playerProfile]
  );

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-white/12 bg-[rgba(63,32,19,0.16)] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-black/12 px-6 py-4">
        <p className="text-sm font-semibold tracking-[0.18em] text-white/62 uppercase">
          Global Leaderboard
        </p>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/v3/leaderboard?sort=alpha"
            className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-colors ${
              sortMode === "alpha"
                ? "border-white/28 bg-white/18 text-white"
                : "border-white/10 bg-black/10 text-white/80 hover:bg-black/18"
            }`}
          >
            By % Won
          </Link>
          <Link
            href="/v3/leaderboard?sort=streak"
            className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-colors ${
              sortMode === "streak"
                ? "border-white/28 bg-white/18 text-white"
                : "border-white/10 bg-black/10 text-white/80 hover:bg-black/18"
            }`}
          >
            By Consecutive Wins
          </Link>
        </div>
      </div>

      <div>
        <div className="grid grid-cols-[96px_minmax(260px,1.5fr)_240px_200px_240px] gap-6 px-6 py-4 text-sm font-semibold tracking-[0.18em] text-white/62 uppercase">
          <span>Rank</span>
          <span>Username</span>
          <span>Dominance vs S&amp;P 500</span>
          <span>Consecutive Wins</span>
          <span>Date Played</span>
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-14 text-center text-lg text-white/80">
            No completed runs yet.
          </div>
        ) : (
          rows.map((row, index) => {
            return (
              <div
                key={row.id}
                className="grid grid-cols-[96px_minmax(260px,1.5fr)_240px_200px_240px] items-center gap-6 border-t border-white/10 px-6 py-5 text-base text-white/90"
              >
                <span className="text-xl font-semibold text-white">#{index + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-xl font-semibold text-white">
                    {row.username}
                  </p>
                </div>
                <span
                  className={`text-lg font-semibold ${
                    row.alpha >= 0 ? "text-[#ffe8a8]" : "text-[#ffd0bc]"
                  }`}
                >
                  {formatPercentPoints(row.alpha)}
                </span>
                <span className="text-lg font-semibold text-white">{row.streak}</span>
                <span className="text-sm leading-6 text-white/76">{formatTime(row.completedAt)}</span>
              </div>
            );
          })
        )}
      </div>

      {placeholderRow ? (
        <div className="grid grid-cols-[96px_minmax(260px,1.5fr)_240px_200px_240px] items-center gap-6 border-t border-[#f0d7a6]/30 bg-[linear-gradient(90deg,rgba(228,189,124,0.92),rgba(217,165,86,0.95))] px-6 py-5 text-base text-[#342113]">
          <span className="text-2xl font-semibold">
            #{rows.length + 1}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <p className="truncate text-2xl font-semibold">{placeholderRow.username}</p>
              <span className="rounded-full border border-[#7d5423]/18 bg-white/35 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5b3710]">
                Join Now
              </span>
            </div>
            <p className="truncate text-sm text-[#5b3710]/72">
              {placeholderRow.email || "Join the challenge and claim your spot"}
            </p>
          </div>
          <span className="text-xl font-semibold">+0.00 p.p.</span>
          <span className="text-xl font-semibold">0</span>
          <Link
            href="/v3"
            className="inline-flex w-fit rounded-full border border-[#7d5423]/18 bg-white/35 px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-[#5b3710] transition-colors hover:bg-white/50"
          >
            Ready to Play
          </Link>
        </div>
      ) : null}
    </div>
  );
}
