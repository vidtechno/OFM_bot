import { describe, expect, it } from "vitest";
import { formatSquad } from "../src/squads/presentation.js";

describe("formatSquad", () => {
  it("playerlarni positional bo'limlarga ajratadi", () => {
    const text = formatSquad("Real Madrid", [
      { id: "1", clubPlayerId: "c1", shortName: "T. Courtois", age: 33, primaryPosition: "GK", secondaryPosition: null, overall: 89, fitness: 100, form: 70, morale: 70 },
      { id: "2", clubPlayerId: "c2", shortName: "K. Mbappé", age: 26, primaryPosition: "ST", secondaryPosition: "LW", overall: 91, fitness: 96, form: 80, morale: 70 },
    ]);
    expect(text).toContain("REAL MADRID — JAMOA");
    expect(text).toContain("T. Courtois (GK · ⭐89)");
    expect(text).toContain("K. Mbappé (ST/LW · ⭐91)");
  });
});
