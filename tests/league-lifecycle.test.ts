import { describe, expect, it } from "vitest";
import { formatLobbyCountdown, formatOpenLobbies } from "../src/leagues/presentation.js";

describe("League Lifecycle & Open Lobbies UI", () => {
  it("formats lobby countdown correctly for future target time", () => {
    const future = new Date(Date.now() + (8 * 3600 + 24 * 60) * 1000).toISOString();
    const countdown = formatLobbyCountdown(future);
    expect(countdown).toContain("<b>8</b> soat");
    expect(countdown).toContain("daqiqa qoldi");
  });

  it("formats open lobbies presentation according to specification", () => {
    const future = new Date(Date.now() + (8 * 3600 + 24 * 60) * 1000).toISOString();
    const lobbies = [
      {
        competitionCode: "LALIGA",
        competitionName: "LaLiga",
        instanceNumber: 15,
        humanCount: 4,
        maxClubs: 20,
        registrationClosesAt: future,
        status: "OPEN",
      },
      {
        competitionCode: "PL",
        competitionName: "Premier League",
        instanceNumber: 18,
        humanCount: 7,
        maxClubs: 20,
        registrationClosesAt: future,
        status: "OPEN",
      },
    ];

    const managedClubs = [
      {
        leagueClubId: "11111111-1111-1111-1111-111111111111",
        clubName: "Real Madrid",
        competitionName: "LaLiga",
        leagueName: "LaLiga #0015",
        position: 1,
        points: 0,
        budget: 150000000,
      },
    ];

    const text = formatOpenLobbies(lobbies, managedClubs);

    expect(text).toContain("🏆 <b>LIGALAR</b>");
    expect(text).toContain("🇪🇸 <b>LaLiga</b>");
    expect(text).toContain("🟢 <i>Qabul ochiq</i>");
    expect(text).toContain("👤 4/20 manager");
    expect(text).toContain("⏳ Boshlanishiga: <b>8</b> soat");
    expect(text).toContain("🏴 <b>Premier League</b>");
    expect(text).toContain("👤 7/20 manager");
    expect(text).toContain("📌 <b>MENING LIGALARIM</b>");
    expect(text).toContain("⚽ <b>Real Madrid</b>");
    expect(text).toContain("<i>LaLiga #0015</i>");

    // Must NOT contain private league references
    expect(text).not.toContain("Private");
    expect(text).not.toContain("Kod bilan");
  });
});
