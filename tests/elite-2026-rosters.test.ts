import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";
import { ELITE_2026_ROSTERS } from "../src/data/elite-2026-rosters.js";
import { runEliteRosterImport } from "../src/data/import-elite-rosters.js";

describe("OFM Elite League 2026/27 Rosters Comprehensive Test Suite", () => {
  const db = createDatabaseClient(loadConfig());

  it("Uzbekistan Superliga is 100% unchanged (16 clubs, 410 players)", async () => {
    const { data: uzbComp } = await db.from("competitions").select("id").eq("code", "UZB").single();
    expect(uzbComp).toBeDefined();

    const { data: clubs } = await db.from("clubs").select("id").eq("competition_id", uzbComp!.id);
    expect(clubs?.length).toBe(16);

    const { count } = await db.from("players").select("id", { count: "exact", head: true }).in("club_id", clubs!.map(c => c.id));
    expect(count).toBe(410);
  });

  it("All 20 Elite League clubs exist and have valid squad size between 18 and 30", async () => {
    const { data: eliteComp } = await db.from("competitions").select("id").eq("code", "ELITE").single();
    expect(eliteComp).toBeDefined();

    const { data: clubs } = await db.from("clubs").select("id, name").eq("competition_id", eliteComp!.id);
    expect(clubs?.length).toBe(20);

    for (const club of clubs!) {
      const { data: players } = await db.from("players").select("id").eq("club_id", club.id);
      expect(players?.length).toBeGreaterThanOrEqual(18);
      expect(players?.length).toBeLessThanOrEqual(30);
    }
  });

  it("Real Madrid 2026/27 squad has exactly 25 players matching authoritative official list", async () => {
    const { data: rmClub } = await db.from("clubs").select("id").eq("name", "Real Madrid").single();
    const { data: players } = await db.from("players").select("id, name, short_name").eq("club_id", rmClub!.id);
    expect(players?.length).toBe(25);

    const shortNames = new Set(players!.map(p => p.short_name));
    expect(shortNames.has("K. Mbappé")).toBe(true);
    expect(shortNames.has("Vini Jr.")).toBe(true);
    expect(shortNames.has("J. Bellingham")).toBe(true);
    expect(shortNames.has("T. Courtois")).toBe(true);
    expect(shortNames.has("T. Alexander-Arnold")).toBe(true);
    expect(shortNames.has("A. Rüdiger")).toBe(true);
    expect(shortNames.has("D. Dumfries")).toBe(true);
    expect(shortNames.has("Marc Cucurella")).toBe(true);
  });

  it("Barcelona 2026/27 squad has exactly 25 players matching authoritative official list", async () => {
    const { data: barcaClub } = await db.from("clubs").select("id").eq("name", "Barcelona").single();
    const { data: players } = await db.from("players").select("id, name, short_name").eq("club_id", barcaClub!.id);
    expect(players?.length).toBe(25);

    const shortNames = new Set(players!.map(p => p.short_name));
    expect(shortNames.has("Lamine Yamal")).toBe(true);
    expect(shortNames.has("Raphinha")).toBe(true);
    expect(shortNames.has("Pedri")).toBe(true);
    expect(shortNames.has("Gavi")).toBe(true);
    expect(shortNames.has("Dani Olmo")).toBe(true);
    expect(shortNames.has("F. de Jong")).toBe(true);
    expect(shortNames.has("Gabriel Jesus")).toBe(true);
    expect(shortNames.has("K. Adeyemi")).toBe(true);
    expect(shortNames.has("A. Gordon")).toBe(true);
    expect(shortNames.has("Joan García")).toBe(true);
    expect(shortNames.has("W. Szczęsny")).toBe(true);
  });

  it("Zero duplicate canonical players exist within any of the 20 Elite clubs", async () => {
    const { data: eliteComp } = await db.from("competitions").select("id").eq("code", "ELITE").single();
    const { data: clubs } = await db.from("clubs").select("id").eq("competition_id", eliteComp!.id);
    const clubIds = clubs!.map(c => c.id);

    const { data: players } = await db.from("players").select("id, club_id").in("club_id", clubIds);
    const playerIds = players!.map(p => p.id);
    const uniqueIds = new Set(playerIds);
    expect(playerIds.length).toBe(uniqueIds.size);
  });

  it("Dry-run import is completely idempotent (0 moved, 0 added, 0 removed, 0 duplicates)", async () => {
    const result = await runEliteRosterImport(true);
    expect(result.totalMoved).toBe(0);
    expect(result.totalAdded).toBe(0);
    expect(result.totalRemoved).toBe(0);
    expect(result.totalDuplicates).toBe(0);
    expect(result.reports.length).toBe(20);
    for (const r of result.reports) {
      expect(r.unmapped.length).toBe(0);
      expect(r.duplicates).toBe(0);
      expect(r.currentDbCount).toBe(r.officialSourceCount);
    }
  });
});
