import { describe, expect, it } from "vitest";
import { formatStartingXi } from "../src/tactics/presentation.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";
import { TacticsRepository } from "../src/tactics/tactics.repository.js";
import { SquadRepository } from "../src/squads/squad.repository.js";

describe("Starting XI Presentation", () => {
  it("formatStartingXi jamoa kuchini va bo'limlar bo'yicha futbolchilarni to'g'ri chiqaradi", () => {
    const text = formatStartingXi("Real Madrid", "4-3-3", [
      { clubPlayerId: "c1", slotKey: "GK", slotPosition: "GK", shortName: "T. Courtois", overall: 90, effectiveRating: 90 },
      { clubPlayerId: "c2", slotKey: "LB", slotPosition: "LB", shortName: "Cucurella", overall: 86, effectiveRating: 86 },
      { clubPlayerId: "c3", slotKey: "ST", slotPosition: "ST", shortName: "K. Mbappé", overall: 91, effectiveRating: 91 },
    ]);

    expect(text).toContain("🔥 REAL MADRID — ASOSIY XI");
    expect(text).toContain("📐 Sxema: 4-3-3");
    expect(text).toContain("⭐ Jamoaviy kuch: 89.0");
    expect(text).toContain("🧤 DARVOZABON");
    expect(text).toContain("GK: ✅ T. Courtois — ⭐90");
    expect(text).toContain("🛡 HIMOYACHILAR");
    expect(text).toContain("LB: ✅ Cucurella — ⭐86");
    expect(text).toContain("⚡ HUJUMCHILAR");
    expect(text).toContain("ST: ✅ K. Mbappé — ⭐91");
  });
});

describe("TacticsRepository swapOrAssignPlayer Live Test", () => {
  it("futbolchini slotga tayinlaydi va mavjud bo'lsa atomik ravishda almashtiradi", async () => {
    const config = loadConfig();
    const db = createDatabaseClient(config);
    const squads = new SquadRepository(db);
    const tactics = new TacticsRepository(db, squads);

    const userId = "18440ffe-693d-4845-a14f-ee4aed6ba50e";
    const clubId = "cf906880-24a9-4e6e-867b-231c3a7d61db";

    const squad = await squads.listOwnedClubSquad(userId, clubId);
    const courtois = squad.find((p) => p.shortName.includes("Courtois"))!;
    const lunin = squad.find((p) => p.shortName.includes("Lunin"))!;

    // 1. Assign Lunin to GK
    const lineup1 = await tactics.swapOrAssignPlayer(userId, clubId, "GK", lunin.clubPlayerId);
    const gkEntry1 = lineup1.players.find((p) => p.slotKey === "GK")!;
    expect(gkEntry1.shortName).toContain("Lunin");
    expect(lineup1.players).toHaveLength(11);

    // 2. Assign Courtois back to GK
    const lineup2 = await tactics.swapOrAssignPlayer(userId, clubId, "GK", courtois.clubPlayerId);
    const gkEntry2 = lineup2.players.find((p) => p.slotKey === "GK")!;
    expect(gkEntry2.shortName).toContain("Courtois");
    expect(lineup2.players).toHaveLength(11);
  });
});
