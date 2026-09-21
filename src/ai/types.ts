import { z } from "zod";

export const AiClubStrategySchema = z.object({
  style: z.enum(["very_defensive", "defensive", "balanced", "attacking", "very_attacking"]).default("balanced"),
  transfer_risk: z.enum(["low", "medium", "high"]).default("medium"),
  priority_positions: z.array(z.string()).min(1).max(4).default(["ST", "CB"]),
  sell_candidates: z.array(z.string()).default([]),
  max_offer_multiplier: z.number().min(1.0).max(2.0).default(1.35),
  youth_preference: z.number().min(0).max(1).default(0.7),
  star_protection: z.number().min(0).max(1).default(0.9),
});

export type AiClubStrategy = z.infer<typeof AiClubStrategySchema>;

export interface AiDecisionLog {
  leagueClubId: string;
  action: "STRATEGY" | "OFFER_RESPONSE" | "AI_BUY" | "AI_SELL";
  details: Record<string, unknown>;
  model?: string;
}
