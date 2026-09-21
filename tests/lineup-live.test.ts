import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";
import { TacticsRepository } from "../src/tactics/tactics.repository.js";
import { SquadRepository } from "../src/squads/squad.repository.js";

describe("Tactics & Lineup Live Test", () => {
  it("Real Madrid Starting XI to'g'ri o'qiladi va autoPick ishlaydi", async () => {
    const config = loadConfig();
    const db = createDatabaseClient(config);
    const squads = new SquadRepository(db);
    const tactics = new TacticsRepository(db, squads);

    const userId = "18440ffe-693d-4845-a14f-ee4aed6ba50e";
    const clubId = "cf906880-24a9-4e6e-867b-231c3a7d61db";

    const lineup = await tactics.lineup(userId, clubId);
    expect(lineup.players.length).toBe(11);
    expect(new Set(lineup.players.map((p) => p.clubPlayerId)).size).toBe(11);
    expect(lineup.formation).toBe("4-3-3");
  });
});
