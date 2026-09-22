import { describe, expect, it } from "vitest";
import { formatLineup, formatStartingXi } from "../src/tactics/presentation.js";
import type { LineupEntry, SetPieceAssignments } from "../src/tactics/tactics.repository.js";

describe("Captain & Set Pieces Test Suite", () => {
  const samplePlayers: LineupEntry[] = [
    { clubPlayerId: "cp-1", slotKey: "GK", slotPosition: "GK", shortName: "T. Courtois", overall: 89, effectiveRating: 89 },
    { clubPlayerId: "cp-2", slotKey: "CB1", slotPosition: "CB", shortName: "E. Militao", overall: 85, effectiveRating: 85 },
    { clubPlayerId: "cp-3", slotKey: "CB2", slotPosition: "CB", shortName: "A. Rüdiger", overall: 87, effectiveRating: 87 },
    { clubPlayerId: "cp-4", slotKey: "LB", slotPosition: "LB", shortName: "F. Mendy", overall: 82, effectiveRating: 82 },
    { clubPlayerId: "cp-5", slotKey: "RB", slotPosition: "RB", shortName: "D. Carvajal", overall: 86, effectiveRating: 86 },
    { clubPlayerId: "cp-6", slotKey: "CM1", slotPosition: "CM", shortName: "F. Valverde", overall: 88, effectiveRating: 88 },
    { clubPlayerId: "cp-7", slotKey: "CM2", slotPosition: "CM", shortName: "A. Tchouaméni", overall: 85, effectiveRating: 85 },
    { clubPlayerId: "cp-8", slotKey: "CAM", slotPosition: "CAM", shortName: "J. Bellingham", overall: 90, effectiveRating: 90 },
    { clubPlayerId: "cp-9", slotKey: "LW", slotPosition: "LW", shortName: "Vinicius Jr.", overall: 90, effectiveRating: 90 },
    { clubPlayerId: "cp-10", slotKey: "RW", slotPosition: "RW", shortName: "Rodrygo", overall: 86, effectiveRating: 86 },
    { clubPlayerId: "cp-11", slotKey: "ST", slotPosition: "ST", shortName: "K. Mbappé", overall: 91, effectiveRating: 91 },
  ];

  const sampleSetPieces: SetPieceAssignments = {
    captain: { clubPlayerId: "cp-5", name: "D. Carvajal" },
    penaltyTaker: { clubPlayerId: "cp-11", name: "K. Mbappé" },
    freeKickTaker: { clubPlayerId: "cp-8", name: "J. Bellingham" },
    cornerTaker: { clubPlayerId: "cp-6", name: "F. Valverde" },
  };

  it("formatStartingXi renders captain and all 3 set piece takers", () => {
    const text = formatStartingXi("Real Madrid", "4-3-3", samplePlayers, sampleSetPieces);

    expect(text).toContain("🔥 <b>REAL MADRID — ASOSIY XI</b>");
    expect(text).toContain("👑 Kapitan: <b>D. Carvajal</b>");
    expect(text).toContain("⚽ Penalti: <b>K. Mbappé</b>");
    expect(text).toContain("🎯 Jarima zarbasi: <b>J. Bellingham</b>");
    expect(text).toContain("🚩 Burchak: <b>F. Valverde</b>");
  });

  it("formatLineup displays fallback Tanlanmagan when roles are unassigned", () => {
    const emptySetPieces: SetPieceAssignments = {
      captain: null,
      penaltyTaker: null,
      freeKickTaker: null,
      cornerTaker: null,
    };

    const text = formatLineup("4-3-3", samplePlayers, emptySetPieces);

    expect(text).toContain("👑 Kapitan: <b>Tanlanmagan</b>");
    expect(text).toContain("⚽ Penalti: <b>Tanlanmagan</b>");
    expect(text).toContain("🎯 Jarima zarbasi: <b>Tanlanmagan</b>");
    expect(text).toContain("🚩 Burchak: <b>Tanlanmagan</b>");
  });
});
