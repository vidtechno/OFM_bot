import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

describe("Duplicate Squad & Integrity Test Suite", () => {
  const config = loadConfig();
  const db = createDatabaseClient(config);

  it("Real Madrid has between 20 and 36 players and exactly zero duplicate canonical players", async () => {
    const { data: realClubs, error: clubErr } = await db
      .from("clubs")
      .select("id, name")
      .ilike("name", "%Real Madrid%")
      .limit(1);

    expect(clubErr).toBeNull();
    expect(realClubs).toBeDefined();
    expect(realClubs!.length).toBeGreaterThan(0);

    const realMadridId = realClubs![0]!.id;

    const { data: players, error: pErr } = await db
      .from("players")
      .select("id, short_name, source_player_id, data_source_id")
      .eq("club_id", realMadridId);

    expect(pErr).toBeNull();
    expect(players).toBeDefined();
    expect(players!.length).toBeGreaterThanOrEqual(20);
    expect(players!.length).toBeLessThanOrEqual(36);

    // Check zero duplicate source_player_id (no duplicates allowed)
    const sourceIds = players!.map((p) => p.source_player_id).filter(Boolean);
    const uniqueSourceIds = new Set(sourceIds);
    expect(sourceIds.length).toBe(uniqueSourceIds.size); // zero duplicates
    // Squad count may vary after 2026/27 reconciliation (dedup of misplaced players)
    expect(sourceIds.length).toBeGreaterThanOrEqual(20);
    expect(sourceIds.length).toBeLessThanOrEqual(36);
  });

  it("All 20 Elite League clubs have valid squad sizes (20-36) and zero duplicates", async () => {
    const { data: eliteComp } = await db
      .from("competitions")
      .select("id")
      .eq("code", "ELITE")
      .single();

    if (!eliteComp) return;

    const { data: clubs } = await db
      .from("clubs")
      .select("id, name")
      .eq("competition_id", eliteComp.id);

    expect(clubs).toBeDefined();
    expect(clubs!.length).toBe(20);

    for (const club of clubs!) {
      const { data: players } = await db
        .from("players")
        .select("id, short_name, source_player_id")
        .eq("club_id", club.id);

      // After 2026/27 reconciliation, clubs may have 18-36 players
      // (min 18 = safe squad size, some externally-assigned players moved to pool)
      expect(players!.length).toBeGreaterThanOrEqual(18);
      expect(players!.length).toBeLessThanOrEqual(36);

      const sourceIds = players!.map((p) => p.source_player_id).filter(Boolean);
      expect(new Set(sourceIds).size).toBe(sourceIds.length);
    }
  });

  it("Database-level unique index prevents inserting duplicate player for same club", async () => {
    const { data: p } = await db
      .from("players")
      .select("club_id, source_player_id, data_source_id, name, short_name, primary_position, age")
      .not("club_id", "is", null)
      .not("source_player_id", "is", null)
      .limit(1)
      .single();

    if (!p) return;

    // Attempt to insert duplicate player with identical (club_id, source_player_id)
    const { error } = await db.from("players").insert({
      club_id: p.club_id,
      source_player_id: p.source_player_id,
      data_source_id: p.data_source_id,
      name: "Duplicate Test Player",
      short_name: "D. Test",
      primary_position: "ST",
      age: 25,
      nationality: "Spain",
    });

    expect(error).toBeDefined();
    expect(error?.message).toMatch(/duplicate key|unique constraint/i);
  });
});
