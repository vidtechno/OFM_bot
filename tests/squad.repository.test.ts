import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";
import { SquadRepository } from "../src/squads/squad.repository.js";

describe("SquadRepository Live Test", () => {
  it("Frankfurt bazasidan klub squadini to'g'ri o'qiydi", async () => {
    const config = loadConfig();
    const db = createDatabaseClient(config);
    const repo = new SquadRepository(db);

    // Diyorbek - Real Madrid manager in Frankfurt
    const userId = "18440ffe-693d-4845-a14f-ee4aed6ba50e";
    const { data: rmClub } = await db.from("league_clubs").select("id, clubs!inner(name)").eq("clubs.name", "Real Madrid").limit(1).single();
    const leagueClubId = rmClub!.id;
    await db.from("league_clubs").update({ manager_user_id: userId, manager_type: "HUMAN" }).eq("id", leagueClubId);

    const squad = await repo.listOwnedClubSquad(userId, leagueClubId);
    expect(squad.length).toBe(32);
    expect(squad[0]!.overall).toBeGreaterThanOrEqual(90);
    expect(squad.map((p) => p.shortName)).toContain("K. Mbappé");
    expect(squad.map((p) => p.shortName)).toContain("J. Bellingham");
  });
});
