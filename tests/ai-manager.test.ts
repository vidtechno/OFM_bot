import { describe, it, expect, vi } from "vitest";
import { AiClubStrategySchema } from "../src/ai/types.js";
import { OpenAiStrategyService } from "../src/ai/openai-strategy.service.js";
import { AiTransferEngine } from "../src/ai/ai-transfer-engine.js";

describe("AI Manager Strategy Schema & Fallback", () => {
  it("Zod schema to'g'ri AI strategiya strukturasini qabul qiladi", () => {
    const validStrategy = {
      style: "attacking" as const,
      transfer_risk: "medium" as const,
      priority_positions: ["ST", "CB"],
      sell_candidates: ["LB"],
      max_offer_multiplier: 1.4,
      youth_preference: 0.8,
      star_protection: 0.95,
    };

    const parsed = AiClubStrategySchema.safeParse(validStrategy);
    expect(parsed.success).toBe(true);
  });

  it("Zod schema noto'g'ri maydonlarni rad etadi", () => {
    const invalidStrategy = {
      style: "invalid_style",
      transfer_risk: "extreme",
      youth_preference: 2.5, // max 1.0
    };

    const parsed = AiClubStrategySchema.safeParse(invalidStrategy);
    expect(parsed.success).toBe(false);
  });

  it("OpenAI API mavjud bo'lmaganda deterministik fallback strategiya qaytaradi", async () => {
    const mockDb: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            single: vi.fn().mockResolvedValue({
              data: {
                transfer_budget: 100_000_000,
                cash_balance: 50_000_000,
                clubs: { name: "Real Madrid" },
              },
              error: null,
            }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    const mockLogger: any = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const service = new OpenAiStrategyService(mockDb, mockLogger, { apiKey: undefined });
    const strategy = await service.getClubStrategy("test-club-uuid");

    expect(strategy).toBeDefined();
    expect(["very_defensive", "defensive", "balanced", "attacking", "very_attacking"]).toContain(strategy.style);
    expect(strategy.star_protection).toBeGreaterThanOrEqual(0.5);
    expect(strategy.priority_positions.length).toBeGreaterThanOrEqual(1);
  });
});

describe("AI Transfer Engine Offer Evaluation", () => {
  it("Bozor narxidan past yoki yetarli bo'lmagan taklifni REJECT qiladi", async () => {
    const mockDb: any = {
      from: vi.fn((table: string) => {
        if (table === "club_players") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [{}], error: null }),
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "cp-1",
                    league_club_id: "seller-club-id",
                    players: {
                      short_name: "Test Star",
                      age: 26,
                      market_value: 50_000_000,
                      primary_position: "ST",
                      player_attributes: { overall: 88 },
                    },
                    league_clubs: { cash_balance: 10_000_000, transfer_budget: 20_000_000 },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "ai_decisions") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return { select: vi.fn() };
      }),
    };

    const mockStrategyService: any = {
      getClubStrategy: vi.fn().mockResolvedValue({
        style: "attacking",
        transfer_risk: "medium",
        priority_positions: ["CB"],
        sell_candidates: [],
        max_offer_multiplier: 1.4,
        youth_preference: 0.7,
        star_protection: 1.4,
      }),
    };

    const mockLogger: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const engine = new AiTransferEngine(mockDb, mockStrategyService, mockLogger);

    // Offered 52M for 50M star player (needs >= 1.35x resistance) -> REJECT
    const result = await engine.evaluateOffer("seller-club-id", "cp-1", 52_000_000);
    expect(result.decision).toBe("REJECT");
  });

  it("Munosib miqdor taklif qilinganda COUNTER yoki ACCEPT qaytaradi", async () => {
    const mockDb: any = {
      from: vi.fn((table: string) => {
        if (table === "club_players") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [{}, {}, {}], error: null }), // 3 players at position
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "cp-2",
                    league_club_id: "seller-club-id",
                    players: {
                      short_name: "Good Midfielder",
                      age: 27,
                      market_value: 30_000_000,
                      primary_position: "CM",
                      player_attributes: { overall: 80 },
                    },
                    league_clubs: { cash_balance: 5_000_000, transfer_budget: 10_000_000 },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "ai_decisions") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return { select: vi.fn() };
      }),
    };

    const mockStrategyService: any = {
      getClubStrategy: vi.fn().mockResolvedValue({
        style: "balanced",
        transfer_risk: "medium",
        priority_positions: ["ST"],
        sell_candidates: [],
        max_offer_multiplier: 1.35,
        youth_preference: 0.6,
        star_protection: 0.9,
      }),
    };

    const mockLogger: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const engine = new AiTransferEngine(mockDb, mockStrategyService, mockLogger);

    // Offered 42M for 30M player (1.4x) -> ACCEPT
    const acceptResult = await engine.evaluateOffer("seller-club-id", "cp-2", 42_000_000);
    expect(acceptResult.decision).toBe("ACCEPT");

    // Offered 35M for 30M player (1.17x, threshold is 1.20x) -> COUNTER
    const counterResult = await engine.evaluateOffer("seller-club-id", "cp-2", 35_000_000);
    expect(counterResult.decision).toBe("COUNTER");
    expect(counterResult.counterAmount).toBeGreaterThan(35_000_000);
  });
});
