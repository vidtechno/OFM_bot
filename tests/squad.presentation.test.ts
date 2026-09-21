import { describe, expect, it } from "vitest";
import { formatSquad } from "../src/squads/presentation.js";

describe("formatSquad", () => {
  it("har bir playerni alohida satrda, bo'limlar bo'yicha va OVR bo'yicha kamayish tartibida chiqaradi", () => {
    const text = formatSquad("Real Madrid", [
      { id: "1", clubPlayerId: "c1", shortName: "A. Lunin", age: 26, primaryPosition: "GK", secondaryPosition: null, overall: 80, fitness: 100, form: 70, morale: 70 },
      { id: "2", clubPlayerId: "c2", shortName: "T. Courtois", age: 33, primaryPosition: "GK", secondaryPosition: null, overall: 90, fitness: 100, form: 70, morale: 70 },
      { id: "3", clubPlayerId: "c3", shortName: "Éder Militão", age: 27, primaryPosition: "CB", secondaryPosition: null, overall: 84, fitness: 100, form: 70, morale: 70 },
      { id: "4", clubPlayerId: "c4", shortName: "T. Alexander-Arnold", age: 26, primaryPosition: "RB", secondaryPosition: "RM", overall: 85, fitness: 100, form: 70, morale: 70 },
      { id: "5", clubPlayerId: "c5", shortName: "K. Mbappé", age: 26, primaryPosition: "ST", secondaryPosition: "LW", overall: 91, fitness: 96, form: 80, morale: 70 },
    ]);

    expect(text).toContain("👥 REAL MADRID — JAMOA");
    expect(text).toContain("📋 5 futbolchi");

    // Sections present
    expect(text).toContain("🧤 DARVOZABONLAR");
    expect(text).toContain("🛡 HIMOYACHILAR");
    expect(text).toContain("⚡ HUJUMCHILAR");

    // Line-by-line format: N. Short Name — PRIMARY/SECONDARY — ⭐OVR
    expect(text).toContain("1. T. Courtois — GK — ⭐90");
    expect(text).toContain("2. A. Lunin — GK — ⭐80");
    expect(text).toContain("1. T. Alexander-Arnold — RB/RM — ⭐85");
    expect(text).toContain("2. Éder Militão — CB — ⭐84");
    expect(text).toContain("1. K. Mbappé — ST/LW — ⭐91");

    // OVR ordering: Courtois (90) comes before Lunin (80)
    const courtoisIdx = text.indexOf("T. Courtois");
    const luninIdx = text.indexOf("A. Lunin");
    expect(courtoisIdx).toBeLessThan(luninIdx);
  });
});
