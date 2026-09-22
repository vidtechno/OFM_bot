import { describe, expect, it } from "vitest";
import { formatUpcomingFixtures } from "../src/fixtures/presentation.js";

describe("formatUpcomingFixtures", () => {
  it("Tashkent vaqti va uy/safar holatini chiqaradi", () => {
    const text = formatUpcomingFixtures([{
      id: "f1", round: 1, scheduledAt: "2026-09-22T08:00:00.000Z", status: "SCHEDULED",
      isHome: true, homeClub: "Real Madrid", awayClub: "Barcelona",
    }]);
    expect(text).toContain("📅 <b>KEYINGI O‘YINLAR</b>");
    expect(text).toContain("<b>1-tur</b> · vs <b>Barcelona</b>");
    expect(text).toContain("13:00");
  });
});
