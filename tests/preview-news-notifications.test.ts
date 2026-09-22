import { describe, expect, it } from "vitest";
import { formatMatchPreview } from "../src/matches/presentation.js";
import { NewsService } from "../src/leagues/news.service.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

describe("Match Preview, League News & Notifications Test Suite", () => {
  const config = loadConfig();
  const db = createDatabaseClient(config);
  const newsService = new NewsService(db);

  it("formatMatchPreview correctly formats standings, OVRs, form, and H2H", () => {
    const preview = {
      homeClubName: "Real Madrid",
      awayClubName: "Barcelona",
      homeRank: 1,
      awayRank: 2,
      homeOvr: 87,
      awayOvr: 86,
      homeForm: "WWWDW",
      awayForm: "WWLWW",
      h2h: {
        homeWins: 3,
        draws: 1,
        awayWins: 1,
        hasHistory: true,
      },
      scheduledAt: "2026-09-22T20:00:00Z",
    };

    const text = formatMatchPreview(preview);

    expect(text).toContain("⚔️ <b>KEYINGI O‘YIN</b>");
    expect(text).toContain("Real Madrid vs Barcelona");
    expect(text).toContain("Real Madrid — 1-o‘rin");
    expect(text).toContain("Barcelona — 2-o‘rin");
    expect(text).toContain("87 vs 86");
    expect(text).toContain("WWWDW vs WWLWW");
    expect(text).toContain("3W · 1D · 1L");
  });

  it("NewsService formats news feed with pagination properly", () => {
    const items = [
      {
        id: "n1",
        leagueInstanceId: "inst-1",
        eventType: "MATCH_RESULT",
        headline: "🔥 <b>Real Madrid 3:1 Barcelona</b> uchrashuvi yakunlandi.",
        payload: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: "n2",
        leagueInstanceId: "inst-1",
        eventType: "TRANSFER",
        headline: "🔄 <b>K. Mbappe</b> Real Madrid tarkibiga qo‘shildi.",
        payload: {},
        createdAt: new Date().toISOString(),
      },
    ];

    const feed = newsService.formatNewsFeed(items, 1, 3, "OFM Elite League #0001");

    expect(feed).toContain("📰 <b>LIGA YANGILIKLARI</b>");
    expect(feed).toContain("<i>OFM Elite League #0001</i>");
    expect(feed).toContain("🔥 <b>Real Madrid 3:1 Barcelona</b>");
    expect(feed).toContain("🔄 <b>K. Mbappe</b>");
  });

  it("league_notifications table enforces unique dedup key", async () => {
    const testDedupKey = `test:dedup:${Date.now()}`;
    const { data: user } = await db.from("users").select("id").limit(1).single();
    const { data: inst } = await db.from("league_instances").select("id").limit(1).single();
    if (!user || !inst) return;

    const { error: err1 } = await db.from("league_notifications").insert({
      user_id: user.id,
      league_instance_id: inst.id,
      notification_type: "MATCH_RESULT",
      dedup_key: testDedupKey,
      payload: { test: true },
    });

    expect(err1).toBeNull();

    // Duplicate insert with same dedup_key must fail unique constraint
    const { error: err2 } = await db.from("league_notifications").insert({
      user_id: user.id,
      league_instance_id: inst.id,
      notification_type: "MATCH_RESULT",
      dedup_key: testDedupKey,
      payload: { test: true },
    });

    expect(err2).toBeDefined();
    expect(err2?.message).toMatch(/duplicate key|unique constraint/i);
  });
});
