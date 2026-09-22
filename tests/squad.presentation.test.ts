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

    expect(text).toContain("👥 <b>REAL MADRID — JAMOA</b>");
    expect(text).toContain("📋 <b>5</b> futbolchi");

    // Sections present with bold headers
    expect(text).toContain("🧤 <b>DARVOZABONLAR</b>");
    expect(text).toContain("🛡 <b>HIMOYACHILAR</b>");
    expect(text).toContain("⚡ <b>HUJUMCHILAR</b>");

    // Line-by-line format: N. Short Name — PRIMARY/SECONDARY — ⭐<b>OVR</b>
    expect(text).toContain("1. T. Courtois — GK — ⭐<b>90</b>");
    expect(text).toContain("2. A. Lunin — GK — ⭐<b>80</b>");
    expect(text).toContain("1. T. Alexander-Arnold — RB/RM — ⭐<b>85</b>");
    expect(text).toContain("2. Éder Militão — CB — ⭐<b>84</b>");
    expect(text).toContain("1. K. Mbappé — ST/LW — ⭐<b>91</b>");

    // OVR ordering: Courtois (90) comes before Lunin (80)
    const courtoisIdx = text.indexOf("T. Courtois");
    const luninIdx = text.indexOf("A. Lunin");
    expect(courtoisIdx).toBeLessThan(luninIdx);
  });

  it("HTML belgilarni xavfsiz escape qiladi", () => {
    const text = formatSquad("Test & Club", [
      { id: "1", clubPlayerId: "c1", shortName: "<Script> Player", age: 20, primaryPosition: "ST", secondaryPosition: null, overall: 75, fitness: 100, form: 70, morale: 70 },
    ]);
    expect(text).toContain("TEST &amp; CLUB");
    expect(text).toContain("&lt;Script&gt; Player");
  });
});
