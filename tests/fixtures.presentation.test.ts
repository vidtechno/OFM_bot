import { describe, expect, it } from "vitest";
import { formatUpcomingFixtures } from "../src/fixtures/presentation.js";

describe("formatUpcomingFixtures", () => {
  it("Tashkent vaqti va uy/safar holatini chiqaradi", () => {
    const text = formatUpcomingFixtures([{
      id: "f1", round: 1, scheduledAt: "2026-09-22T08:00:00.000Z", status: "SCHEDULED",
      isHome: true, homeClub: "Real Madrid", awayClub: "Barcelona",
    }]);
    expect(text).toContain("1-tur · 22/09, 13:00");
    expect(text).toContain("Real Madrid — Barcelona · UY");
  });
});
