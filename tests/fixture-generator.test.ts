import { describe, expect, it } from "vitest";
import { generateDoubleRoundRobin } from "../src/fixtures/fixture-generator.js";

describe("generateDoubleRoundRobin", () => {
  it("20 klub uchun 38 tur va 380 ta noyob uy-safar o‘yini yaratadi", () => {
    const clubs = Array.from({ length: 20 }, (_, index) => `club-${index + 1}`);
    const fixtures = generateDoubleRoundRobin(clubs);
    expect(fixtures).toHaveLength(380);
    expect(new Set(fixtures.map((fixture) => fixture.round))).toHaveLength(38);

    for (let round = 1; round <= 38; round += 1) {
      const roundFixtures = fixtures.filter((fixture) => fixture.round === round);
      expect(roundFixtures).toHaveLength(10);
      expect(new Set(roundFixtures.flatMap((fixture) => [fixture.homeClubId, fixture.awayClubId])).size).toBe(20);
    }

    for (const home of clubs) for (const away of clubs) {
      if (home !== away) expect(fixtures.filter((fixture) => fixture.homeClubId === home && fixture.awayClubId === away)).toHaveLength(1);
    }
    for (const club of clubs) {
      const pattern = fixtures.map((fixture) => fixture.homeClubId === club ? "H" : fixture.awayClubId === club ? "A" : "").filter(Boolean).join("");
      expect(Math.max(...(pattern.match(/H+|A+/g) ?? []).map((run) => run.length))).toBeLessThanOrEqual(2);
    }
  });

  it("noto‘g‘ri klub ro‘yxatini rad etadi", () => {
    expect(() => generateDoubleRoundRobin(["a", "b", "c"])).toThrow();
    expect(() => generateDoubleRoundRobin(["a", "a"])).toThrow();
  });
});
