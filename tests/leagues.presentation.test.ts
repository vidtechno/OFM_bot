import { describe, expect, it } from "vitest";
import { claimErrorMessage, formatClubDashboard, formatMoney } from "../src/leagues/presentation.js";

describe("league presentation", () => {
  it("budgetni millionlarda formatlaydi", () => {
    expect(formatMoney(84_500_000)).toBe("€84.5M");
  });

  it("club dashboardni sodda formatlaydi", () => {
    const result = formatClubDashboard({
      leagueClubId: "id",
      clubName: "Arsenal",
      competitionName: "Premier League",
      leagueName: "Premier League #0001",
      position: 4,
      points: 21,
      budget: 84_500_000,
    }, "@manager");
    expect(result).toContain("ARSENAL");
    expect(result).toContain("Murabbiy: @manager");
    expect(result).toContain("Budjet: €84.5M");
  });

  it("claim race xatosini foydalanuvchiga tushuntiradi", () => {
    expect(claimErrorMessage(new Error("CLUB_ALREADY_CLAIMED"))).toContain("boshqa manager");
    expect(claimErrorMessage(new Error("COMPETITION_LIMIT_REACHED"))).toContain("allaqachon");
  });
});
