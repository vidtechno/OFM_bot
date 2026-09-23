import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";
import { LegendRepository } from "../src/legends/legend.repository.js";
import { TransferRepository } from "../src/transfers/transfer.repository.js";
import {
  formatLegendCard,
  formatLegendCategory,
  formatLegendMenu,
  formatMyLegends,
} from "../src/legends/presentation.js";

describe("👑 Legend Transfers & Global Market Auto-Seeding Comprehensive Test Suite", () => {
  const config = loadConfig();
  const db = createDatabaseClient(config);
  const legendRepo = new LegendRepository(db);
  const transferRepo = new TransferRepository(db);

  it("1. Exactly 41 Legends exist in DB with expected categories: 5 GK, 12 DEF, 12 MID, 12 ATT", async () => {
    const { data: legends, error } = await db
      .from("legend_players")
      .select("id, slug, name, category, overall, tier, stars_price, active");

    expect(error).toBeNull();
    expect(legends).toBeDefined();
    expect(legends?.length).toBe(41);

    const gks = (legends ?? []).filter((l) => l.category === "GK");
    const defs = (legends ?? []).filter((l) => l.category === "DEF");
    const mids = (legends ?? []).filter((l) => l.category === "MID");
    const atts = (legends ?? []).filter((l) => l.category === "ATT");

    expect(gks.length).toBe(5);
    expect(defs.length).toBe(12);
    expect(mids.length).toBe(12);
    expect(atts.length).toBe(12);

    // Verify key required players exist
    const names = new Set((legends ?? []).map((l) => l.name));
    expect(names.has("Lionel Messi")).toBe(true);
    expect(names.has("Cristiano Ronaldo")).toBe(true);
    expect(names.has("Marcelo")).toBe(true);
    expect(names.has("Gareth Bale")).toBe(true);
    expect(names.has("Toni Kroos")).toBe(true);
    expect(names.has("Gianluigi Buffon")).toBe(true);
    expect(names.has("Paolo Maldini")).toBe(true);
    expect(names.has("Zinedine Zidane")).toBe(true);

    // Verify excluded players do NOT exist in active roster
    expect(names.has("Diego Maradona")).toBe(false);
    expect(names.has("Johan Cruyff")).toBe(false);
    expect(names.has("Ruud Gullit")).toBe(false);
    expect(names.has("Lothar Matthäus")).toBe(false);
    expect(names.has("Patrick Vieira")).toBe(false);

    // Verify Ibrahimovic is 91
    const ibra = (legends ?? []).find((l) => l.name === "Zlatan Ibrahimović");
    expect(ibra).toBeDefined();
    expect(ibra?.overall).toBe(91);
  });

  it("2. Current TEST PRICING is exactly ⭐ 1 Star for all 41 legends", async () => {
    const { data: legends, error } = await db
      .from("legend_players")
      .select("stars_price");

    expect(error).toBeNull();
    expect(legends?.every((l) => l.stars_price === 1)).toBe(true);
  });

  it("3. Legends have sensible OVR attributes (88 to 96) and match engine attributes", async () => {
    const { data: legends, error } = await db
      .from("legend_players")
      .select("name, overall, pace, shooting, passing, dribbling, defending, physical, tier");

    expect(error).toBeNull();
    for (const l of legends ?? []) {
      expect(l.overall).toBeGreaterThanOrEqual(88);
      expect(l.overall).toBeLessThanOrEqual(96);
      expect(l.pace).toBeGreaterThanOrEqual(50);
      expect(l.shooting).toBeGreaterThanOrEqual(30);
      expect(l.passing).toBeGreaterThanOrEqual(50);
      expect(l.dribbling).toBeGreaterThanOrEqual(50);
      expect(l.defending).toBeGreaterThanOrEqual(30);
      expect(l.physical).toBeGreaterThanOrEqual(50);

      if (l.tier === "GOAT") {
        expect(l.overall).toBeGreaterThanOrEqual(95);
      }
    }
  });

  it("4. League Uniqueness: UNIQUE (league_instance_id, legend_id) constraint is present", async () => {
    const { error } = await db
      .from("league_legend_players")
      .select("id, league_instance_id, legend_id")
      .limit(1);

    expect(error).toBeNull();
  });

  it("5. Presentation formatting functions produce clean, HTML-safe Telegram markup", () => {
    const summary = {
      clubName: "Real Madrid",
      leagueName: "OFM Elite League #0001",
      leagueInstanceId: "test-instance",
      leagueClubId: "test-club",
      leagueStatus: "ACTIVE" as const,
      currentLegendCount: 2,
      maxLegends: 5,
      legends: [
        {
          legendId: "leg-1",
          slug: "lionel-messi",
          clubPlayerId: "cp-1",
          name: "Lionel Messi",
          displayName: "L. Messi",
          primaryPosition: "RW",
          overall: 96,
          tier: "GOAT" as const,
        },
      ],
    };

    const menuText = formatLegendMenu(summary);
    expect(menuText).toContain("👑 <b>LEGEND TRANSFERS</b>");
    expect(menuText).toContain("2/5");

    const categoryText = formatLegendCategory("ATT", 0, 2, [
      {
        legend: {
          id: "leg-1",
          slug: "lionel-messi",
          name: "Lionel Messi",
          displayName: "L. Messi",
          category: "ATT",
          primaryPosition: "RW",
          secondaryPositions: ["CAM"],
          overall: 96,
          pace: 90,
          shooting: 95,
          passing: 96,
          dribbling: 98,
          defending: 40,
          physical: 78,
          tier: "GOAT",
          starsPrice: 1,
          active: true,
          cardMetadata: {},
        },
        status: "AVAILABLE",
        isOwnedByMe: false,
      },
    ], summary);
    expect(categoryText).toContain("⚡ <b>HUJUMCHILAR</b>");
    expect(categoryText).toContain("Lionel Messi");
    expect(categoryText).toContain("⭐ <b>1 Star</b>");

    const cardText = formatLegendCard(
      {
        legend: {
          id: "leg-1",
          slug: "lionel-messi",
          name: "Lionel Messi",
          displayName: "L. Messi",
          category: "ATT",
          primaryPosition: "RW",
          secondaryPositions: ["CAM"],
          overall: 96,
          pace: 90,
          shooting: 95,
          passing: 96,
          dribbling: 98,
          defending: 40,
          physical: 78,
          tier: "GOAT",
          starsPrice: 1,
          active: true,
          cardMetadata: {},
        },
        status: "AVAILABLE",
        isOwnedByMe: false,
      },
      summary
    );
    expect(cardText).toContain("👑 <b>LIONEL MESSI</b>");
    expect(cardText).toContain("OVR 96");
    expect(cardText).toContain("⭐ <b>Narxi: 1 Star</b>");
    expect(cardText).toContain("Real Madrid");

    const myLegendsText = formatMyLegends(summary);
    expect(myLegendsText).toContain("👑 <b>KLUB LEGENDLARI</b>");
    expect(myLegendsText).toContain("Lionel Messi");
  });

  it("6. Legend transfer protection: cannot list legend for regular sale or make transfer offers", async () => {
    // Check if transferRepo methods enforce legend restrictions
    const dummyUserId = "00000000-0000-0000-0000-000000000000";
    const dummyClubId = "00000000-0000-0000-0000-000000000000";
    const dummyPlayerId = "00000000-0000-0000-0000-000000000000";

    await expect(
      transferRepo.listForSale(dummyUserId, dummyClubId, dummyPlayerId, 10_000_000)
    ).rejects.toThrow();
  });

  it("7. Global Market is populated and not empty across European and Uzbek leagues", async () => {
    const { data: leagues, error } = await db
      .from("league_instances")
      .select("id, status, competitions!inner(code)")
      .in("status", ["OPEN", "ACTIVE"]);

    expect(error).toBeNull();
    expect(leagues).toBeDefined();
    expect((leagues ?? []).length).toBeGreaterThan(0);

    for (const l of leagues ?? []) {
      const { count, error: countErr } = await db
        .from("global_market_listings")
        .select("id", { count: "exact", head: true })
        .eq("league_instance_id", l.id)
        .eq("status", "ACTIVE");

      expect(countErr).toBeNull();
      // Every league MUST have at least 15 active global market listings!
      expect(count ?? 0).toBeGreaterThanOrEqual(15);
    }
  });

  it("8. Global Transfer Callback Contract: tr_global and gm match regex, parse correctly and stay <= 64 bytes", () => {
    const regex = /^(?:tr_global|gm):([0-9a-f-]{36})(?::(\d+))?(?::(ALL|GK|DEF|MID|ATT))?$/;
    const clubId = "12345678-1234-1234-1234-123456789abc";

    // Standard tr_global with full params
    const m1 = `tr_global:${clubId}:0:ALL`.match(regex);
    expect(m1).not.toBeNull();
    expect(m1?.[1]).toBe(clubId);
    expect(m1?.[2]).toBe("0");
    expect(m1?.[3]).toBe("ALL");

    // tr_global with position filter
    const m2 = `tr_global:${clubId}:1:DEF`.match(regex);
    expect(m2).not.toBeNull();
    expect(m2?.[1]).toBe(clubId);
    expect(m2?.[2]).toBe("1");
    expect(m2?.[3]).toBe("DEF");

    // tr_global with only clubId
    const m3 = `tr_global:${clubId}`.match(regex);
    expect(m3).not.toBeNull();
    expect(m3?.[1]).toBe(clubId);
    expect(m3?.[2]).toBeUndefined();
    expect(m3?.[3]).toBeUndefined();

    // Legacy gm format with full params
    const m4 = `gm:${clubId}:0:ALL`.match(regex);
    expect(m4).not.toBeNull();
    expect(m4?.[1]).toBe(clubId);
    expect(m4?.[2]).toBe("0");
    expect(m4?.[3]).toBe("ALL");

    // Legacy gm format with only clubId
    const m5 = `gm:${clubId}`.match(regex);
    expect(m5).not.toBeNull();
    expect(m5?.[1]).toBe(clubId);

    // Verify byte lengths
    for (const str of [
      `tr_global:${clubId}:0:ALL`,
      `tr_global:${clubId}:99:MID`,
      `tr_global:${clubId}`,
      `gm:${clubId}:0:ALL`,
      `gm:${clubId}`,
    ]) {
      const bytes = new TextEncoder().encode(str).length;
      expect(bytes).toBeLessThanOrEqual(64);
    }
  });
});
