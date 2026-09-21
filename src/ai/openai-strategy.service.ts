import type { SupabaseClient } from "@supabase/supabase-js";
import { AiClubStrategySchema, type AiClubStrategy } from "./types.js";
import type { Logger } from "../lib/logger.js";

export class OpenAiStrategyService {
  private readonly model: string;
  private readonly apiKey?: string | undefined;

  constructor(
    private readonly database: SupabaseClient,
    private readonly logger: Logger,
    options?: { apiKey?: string | undefined; model?: string | undefined }
  ) {
    this.apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY ?? undefined;
    this.model = options?.model ?? process.env.OPENAI_AI_MANAGER_MODEL ?? "gpt-4o-mini";
  }

  async getClubStrategy(leagueClubId: string, forceRefresh = false): Promise<AiClubStrategy> {
    const now = new Date().toISOString();

    // 1. Check cache in ai_club_strategies
    if (!forceRefresh) {
      const { data: cached } = await this.database
        .from("ai_club_strategies")
        .select("strategy, expires_at, source")
        .eq("league_club_id", leagueClubId)
        .maybeSingle();

      if (cached && new Date(cached.expires_at) > new Date()) {
        const parsed = AiClubStrategySchema.safeParse(cached.strategy);
        if (parsed.success) {
          return parsed.data;
        }
      }
    }

    // 2. Fetch club context to build prompt
    const { data: club } = await this.database
      .from("league_clubs")
      .select("id, transfer_budget, cash_balance, clubs!inner(name), club_players(players(short_name, primary_position, age, player_attributes(overall)))")
      .eq("id", leagueClubId)
      .maybeSingle();

    if (!club) {
      return this.defaultStrategy();
    }

    const clubName = (club.clubs as any)?.name ?? "Club";
    const budget = Number(club.transfer_budget);
    const players = (club.club_players ?? []).map((cp: any) => ({
      name: cp.players?.short_name,
      pos: cp.players?.primary_position,
      age: cp.players?.age,
      ovr: cp.players?.player_attributes?.[0]?.overall ?? cp.players?.player_attributes?.overall ?? 75,
    }));

    // Find position counts
    const posCounts: Record<string, number> = {};
    for (const p of players) {
      posCounts[p.pos] = (posCounts[p.pos] ?? 0) + 1;
    }

    // Weakest positions
    const weaknesses: string[] = [];
    if ((posCounts["GK"] ?? 0) < 2) weaknesses.push("GK");
    if ((posCounts["CB"] ?? 0) < 4) weaknesses.push("CB");
    if ((posCounts["ST"] ?? 0) < 2) weaknesses.push("ST");
    if ((posCounts["CM"] ?? 0) < 3) weaknesses.push("CM");
    if (weaknesses.length === 0) weaknesses.push("ST", "CB");

    // 3. Try OpenAI API call
    let strategy: AiClubStrategy;
    let source: "OPENAI" | "RULE_BASED" = "RULE_BASED";

    if (this.apiKey) {
      try {
        const startTime = Date.now();
        strategy = await this.callOpenAi(clubName, budget, players, weaknesses);
        source = "OPENAI";
        const latencyMs = Date.now() - startTime;

        this.logger.info(
          { event: "ai_strategy_generated", leagueClubId, model: this.model, latencyMs },
          "AI Manager strategy generated via OpenAI"
        );
      } catch (err: unknown) {
        this.logger.warn(
          { event: "ai_strategy_fallback", leagueClubId, err },
          "OpenAI API call failed or timed out, falling back to deterministic strategy"
        );
        strategy = this.ruleBasedStrategy(weaknesses, players);
      }
    } else {
      strategy = this.ruleBasedStrategy(weaknesses, players);
    }

    // 4. Cache strategy for 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await this.database.from("ai_club_strategies").upsert({
      league_club_id: leagueClubId,
      strategy,
      source,
      generated_at: now,
      expires_at: expiresAt,
    }, { onConflict: "league_club_id" });

    // 5. Log decision in ai_decisions
    await this.database.from("ai_decisions").insert({
      league_club_id: leagueClubId,
      action: "STRATEGY",
      details: {
        source,
        strategy,
        clubName,
        budget,
      },
      model: source === "OPENAI" ? this.model : "deterministic-rule",
    });

    return strategy;
  }

  private async callOpenAi(
    clubName: string,
    budget: number,
    players: Array<{ name: string; pos: string; age: number; ovr: number }>,
    weaknesses: string[]
  ): Promise<AiClubStrategy> {
    const prompt = `You are the AI Sporting Director of ${clubName} in an online football manager game.
Current Transfer Budget: €${budget.toLocaleString()}
Squad size: ${players.length} players.
Identified squad gaps: ${weaknesses.join(", ")}.

Top players: ${players.slice(0, 5).map(p => `${p.name} (${p.pos}, ⭐${p.ovr})`).join(", ")}

Generate a seasonal transfer strategy in JSON format conforming to this schema:
{
  "style": "very_defensive" | "defensive" | "balanced" | "attacking" | "very_attacking",
  "transfer_risk": "low" | "medium" | "high",
  "priority_positions": string[] (1-4 positions like ST, CB, CM, GK),
  "sell_candidates": string[] (up to 3 player names),
  "max_offer_multiplier": number between 1.1 and 1.8,
  "youth_preference": number between 0.0 and 1.0,
  "star_protection": number between 0.7 and 1.0
}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: "You are a professional football manager AI. Output only valid JSON." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenAI HTTP ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenAI");

    const parsedJson = JSON.parse(content);
    return AiClubStrategySchema.parse(parsedJson);
  }

  private ruleBasedStrategy(
    weaknesses: string[],
    players: Array<{ name: string; pos: string; age: number; ovr: number }>
  ): AiClubStrategy {
    // Find players over 30 or with low ratings as sell candidates
    const sellCandidates = players
      .filter((p) => p.age >= 31 || p.ovr <= 72)
      .slice(0, 2)
      .map((p) => p.name);

    return {
      style: "balanced",
      transfer_risk: "medium",
      priority_positions: weaknesses.slice(0, 3),
      sell_candidates: sellCandidates,
      max_offer_multiplier: 1.35,
      youth_preference: 0.75,
      star_protection: 0.9,
    };
  }

  private defaultStrategy(): AiClubStrategy {
    return {
      style: "balanced",
      transfer_risk: "medium",
      priority_positions: ["ST", "CB"],
      sell_candidates: [],
      max_offer_multiplier: 1.35,
      youth_preference: 0.7,
      star_protection: 0.9,
    };
  }
}
