import { describe, expect, it } from "vitest";
import { claimErrorMessage, formatClubDashboard, formatMoney, formatOpenLobbies, formatLobbyCountdown } from "../src/leagues/presentation.js";

describe("league presentation", () => {
  it("budgetni millionlarda formatlaydi", () => {
    expect(formatMoney(84_500_000)).toBe("€84.5M");
    expect(formatMoney(120_000_000)).toBe("€120M");
  });

  it("club dashboardni to'g'ri formatlaydi", () => {
    const result = formatClubDashboard({
      leagueClubId: "id",
      clubName: "Arsenal",
      competitionName: "Premier League",
      leagueName: "Premier League #0001",
      position: 4,
      points: 21,
      budget: 84_500_000,
    }, "@manager");
    expect(result).toContain("🏟 <b>ARSENAL</b>");
    expect(result).toContain("🏆 <i>Premier League #0001</i>");
    expect(result).toContain("📍 <b>4-o‘rin</b>");
    expect(result).toContain("💰 Transfer budjeti: <b>€84.5M</b>");
    expect(result).not.toContain("G‘azna");
    expect(result).toContain("⏭ <b>Keyingi o‘yin</b>");
  });

  it("countdown vaqt formatini to'g'ri ko'rsatadi", () => {
    const future11h20m = new Date(Date.now() + (11 * 60 + 20) * 60_000 + 1000).toISOString();
    expect(formatLobbyCountdown(future11h20m)).toContain("<b>11</b> soat <b>20</b> daqiqa qoldi");

    const future45m = new Date(Date.now() + 45 * 60_000 + 1000).toISOString();
    expect(formatLobbyCountdown(future45m)).toContain("<b>45</b> daqiqa qoldi");

    const future1h = new Date(Date.now() + 60 * 60_000 + 1000).toISOString();
    expect(formatLobbyCountdown(future1h)).toContain("<b>1</b> soat qoldi");

    const past = new Date(Date.now() - 1000).toISOString();
    expect(formatLobbyCountdown(past)).toBe("<b>Liga boshlanmoqda...</b>");
  });

  it("formatOpenLobbies ochiq va faol ligalarni to'g'ri ko'rsatadi", () => {
    const text = formatOpenLobbies(
      [
        {
          competitionCode: "LALIGA",
          competitionName: "LaLiga",
          instanceNumber: 1,
          humanCount: 0,
          maxClubs: 20,
          registrationClosesAt: null,
          status: "OPEN",
        },
      ],
      [
        {
          leagueClubId: "lc-1",
          clubName: "Real Madrid",
          competitionName: "LaLiga",
          leagueName: "LaLiga #0001",
          position: 1,
          points: 0,
          budget: 120_000_000,
        },
      ]
    );

    expect(text).toContain("🏆 <b>LIGALAR</b>");
    expect(text).toContain("🇪🇸 <b>LaLiga</b>");
    expect(text).toContain("🟢 <i>Qabul ochiq</i>");
    expect(text).toContain("👤 0/20 manager");
    expect(text).toContain("📌 <b>MENING LIGALARIM</b>");
    expect(text).toContain("⚽ <b>Real Madrid</b>");
    expect(text).toContain("<i>LaLiga #0001</i>");
  });

  it("claim race xatosini foydalanuvchiga tushuntiradi", () => {
    expect(claimErrorMessage(new Error("CLUB_ALREADY_CLAIMED"))).toContain("boshqa manager");
    expect(claimErrorMessage(new Error("COMPETITION_LIMIT_REACHED"))).toContain("allaqachon");
  });
});
