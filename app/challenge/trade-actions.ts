"use server";

import "server-only";

import {
  executeBuyOrder,
  resetChallenge,
  executeSellOrder,
  type ChallengeActionResult,
} from "@/lib/challenge-engine";

export async function submitBuyOrder(input: {
  challengeId: string;
  ticker: string;
  qty: number;
}): Promise<ChallengeActionResult> {
  return await executeBuyOrder(input.challengeId, input.ticker, input.qty);
}

export async function submitSellOrder(input: {
  challengeId: string;
  ticker: string;
  qty: number;
}): Promise<ChallengeActionResult> {
  return await executeSellOrder(input.challengeId, input.ticker, input.qty);
}

export async function submitResetChallenge(input: {
  challengeId: string;
}): Promise<ChallengeActionResult> {
  return await resetChallenge(input.challengeId);
}
