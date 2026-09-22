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
    const leagueClubId = "cf906880-24a9-4e6e-867b-231c3a7d61db";

    const squad = await repo.listOwnedClubSquad(userId, leagueClubId);
    expect(squad.length).toBeGreaterThanOrEqual(30);
    expect(squad[0]!.overall).toBeGreaterThanOrEqual(90);
    expect(squad.map((p) => p.shortName)).toContain("K. Mbappé");
    expect(squad.map((p) => p.shortName)).toContain("J. Bellingham");
  });
});
