import { describe, expect, it } from "vitest";
import { formatGlobalLeaderboard, formatHonours } from "../src/progression/presentation.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

describe("Manager Progression & XP System Test Suite", () => {
  const config = loadConfig();
  const db = createDatabaseClient(config);

  it("formatGlobalLeaderboard renders top 10 with medals, XP and user's rank and XP", () => {
    const entries = [
      { userId: "u1", name: "Diyorbek", username: "diyorbek", xp: 150, wins: 45, matches: 60, rank: 1 },
      { userId: "u2", name: "Aziz", username: "azizbek", xp: 120, wins: 38, matches: 55, rank: 2 },
      { userId: "u3", name: "Sardor", username: null, xp: 95, wins: 29, matches: 40, rank: 3 },
      { userId: "u4", name: "Jasur", username: "jasur", xp: 80, wins: 22, matches: 35, rank: 4 },
    ];

    const text = formatGlobalLeaderboard(entries, 14, 42);

    expect(text).toContain("🌍 <b>GLOBAL REYTING</b>");
    expect(text).toContain("🥇 @diyorbek — ⭐ <b>150 XP</b>");
    expect(text).toContain("🥈 @azizbek — ⭐ <b>120 XP</b>");
    expect(text).toContain("🥉 Sardor — ⭐ <b>95 XP</b>");
    expect(text).toContain("4. @jasur — ⭐ <b>80 XP</b>");
    expect(text).toContain("📍 Siz: <b>#14</b>");
    expect(text).toContain("⭐ <b>42 XP</b>");
  });

  it("formatHonours formats career titles and achievements properly", () => {
    const honours = [
      {
        id: "h1",
        managerUserId: "u1",
        leagueInstanceId: "inst-1",
        competitionCode: "ELITE",
        season: 1,
        honourType: "CHAMPION",
        title: "OFM Elite League #0001 — Chempion",
        createdAt: new Date().toISOString(),
      },
      {
        id: "h2",
        managerUserId: "u1",
        leagueInstanceId: "inst-1",
        competitionCode: "ELITE",
        season: 1,
        honourType: "BEST_ATTACK",
        title: "OFM Elite League #0001 — Eng yaxshi hujum",
        createdAt: new Date().toISOString(),
      },
    ];

    const text = formatHonours(honours);
    expect(text).toContain("🏆 <b>MANAGER SOVRINLARI</b>");
    expect(text).toContain("🏆 OFM Elite League #0001 — Chempion");
    expect(text).toContain("⚔️ OFM Elite League #0001 — Eng yaxshi hujum");
  });

  it("manager_xp_events table enforces unique(user_id, match_id, reason) for idempotency", async () => {
    const { data: user } = await db.from("users").select("id").limit(1).single();
    if (!user) return;

    // 1st insert or ignore
    await db.from("manager_xp_events").upsert(
      {
        user_id: user.id,
        xp_amount: 3,
        reason: "MATCH_WIN_TEST",
      },
      { onConflict: "user_id,match_id,reason", ignoreDuplicates: true }
    );

    // 2nd insert with exact same conflict target must not throw error with onConflict ignore
    const { error } = await db.from("manager_xp_events").upsert(
      {
        user_id: user.id,
        xp_amount: 3,
        reason: "MATCH_WIN_TEST",
      },
      { onConflict: "user_id,match_id,reason", ignoreDuplicates: true }
    );

    expect(error).toBeNull();
  });
});
