import { describe, expect, it } from "vitest";
import { escapeHtml, formatMoney, formatLobbyCountdown, formatDateTime, formatFixtureDate } from "../src/lib/html.js";
import { formatClubDashboard, formatOpenLobbies, claimErrorMessage } from "../src/leagues/presentation.js";
import { formatSquad } from "../src/squads/presentation.js";
import { formatTactics, formatStartingXi } from "../src/tactics/presentation.js";
import {
  formatTransferHub,
  formatLeagueMarket,
  formatMarket,
  formatPlayerProfile,
  formatIncomingOffer,
  formatListing,
  formatLeagueListing,
  formatTransferHistory,
} from "../src/transfers/presentation.js";
import { formatMatchReport, formatTable, formatLeaders, formatResults, formatFinances } from "../src/matches/presentation.js";
import { formatProfile, formatLeaderboard } from "../src/progression/presentation.js";
import { formatUpcomingFixtures } from "../src/fixtures/presentation.js";

describe("UI/Presentation Design Audit & Consistency Tests", () => {
  describe("1. HTML Escaping & Shared Utilities", () => {
    it("escapes all HTML special characters safely", () => {
      expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
      expect(escapeHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(escapeHtml('User "Name"')).toBe("User &quot;Name&quot;");
      expect(escapeHtml("O'Connor")).toBe("O&#39;Connor");
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml(undefined)).toBe("");
    });

    it("formats money with exact abbreviations", () => {
      expect(formatMoney(150_000_000)).toBe("€150M");
      expect(formatMoney(42_500_000)).toBe("€42.5M");
      expect(formatMoney(120_000_000)).toBe("€120M");
      expect(formatMoney(95_000_000)).toBe("€95M");
      expect(formatMoney(500_000)).toBe("€500K");
      expect(formatMoney(0)).toBe("€0");
    });

    it("formats countdown according to exact requirements", () => {
      const now = Date.now();
      // 11:20
      const d11h20m = new Date(now + (11 * 60 + 20) * 60_000 + 1000).toISOString();
      expect(formatLobbyCountdown(d11h20m)).toBe("<b>11</b> soat <b>20</b> daqiqa qoldi");

      // 0:45
      const d45m = new Date(now + 45 * 60_000 + 1000).toISOString();
      expect(formatLobbyCountdown(d45m)).toBe("<b>45</b> daqiqa qoldi");

      // 1:00
      const d1h = new Date(now + 60 * 60_000 + 1000).toISOString();
      expect(formatLobbyCountdown(d1h)).toBe("<b>1</b> soat qoldi");

      // 0:00 or expired
      expect(formatLobbyCountdown(new Date(now - 10_000).toISOString())).toBe("<b>Liga boshlanmoqda...</b>");
      expect(formatLobbyCountdown(null)).toBe("<b>Liga boshlanmoqda...</b>");
    });
  });

  describe("2. Ligalar Screen", () => {
    it("renders open lobbies and user leagues with correct hierarchy", () => {
      const output = formatOpenLobbies(
        [
          {
            competitionCode: "LALIGA",
            competitionName: "LaLiga",
            instanceNumber: 1,
            humanCount: 0,
            maxClubs: 20,
            registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
            status: "OPEN",
          },
          {
            competitionCode: "PL",
            competitionName: "Premier League",
            instanceNumber: 2,
            humanCount: 5,
            maxClubs: 20,
            registrationClosesAt: new Date(Date.now() + 7200_000).toISOString(),
            status: "OPEN",
          },
        ],
        [
          {
            leagueClubId: "lc-1",
            clubName: "Real Madrid",
            competitionName: "LaLiga",
            leagueName: "LaLiga #0001",
            position: 3,
            points: 12,
            budget: 120_000_000,
          },
        ]
      );

      expect(output).toContain("🏆 <b>LIGALAR</b>");
      expect(output).toContain("🇪🇸 <b>LaLiga</b>");
      expect(output).toContain("🟢 <i>Qabul ochiq</i>");
      expect(output).toContain("👤 0/20 manager");
      expect(output).toContain("⏳ Boshlanishiga:");
      expect(output).toContain("🏴 <b>Premier League</b>");
      expect(output).toContain("📌 <b>MENING LIGALARIM</b>");
      expect(output).toContain("⚽ <b>Real Madrid</b>");
      expect(output).toContain("<i>LaLiga #0001</i>");
    });
  });

  describe("3. Klubim Dashboard", () => {
    it("renders club dashboard with manager, rank, team OVR and budgets", () => {
      const output = formatClubDashboard(
        {
          leagueClubId: "lc-1",
          clubName: "Real Madrid",
          competitionName: "LaLiga",
          leagueName: "LaLiga #0001",
          position: 3,
          points: 12,
          budget: 120_000_000,
        },
        "Diyorbek",
        "<b>vs Barcelona</b>\n<i>Bugun · 20:00</i>",
        84
      );

      expect(output).toContain("🏟 <b>REAL MADRID</b>");
      expect(output).toContain("🏆 <i>LaLiga #0001</i>");
      expect(output).toContain("📍 <b>3-o‘rin</b>");
      expect(output).toContain("⭐ Jamoa OVR: <b>84</b>");
      expect(output).toContain("💰 Transfer budjeti: <b>€120M</b>");
      expect(output).not.toContain("G‘azna");
      expect(output).toContain("⏭ <b>Keyingi o‘yin</b>");
      expect(output).toContain("<b>vs Barcelona</b>");
      expect(output).toContain("<i>Bugun · 20:00</i>");
    });
  });

  describe("4. Jamoa Screen", () => {
    it("renders squad by position groups with bold OVR and escaped names", () => {
      const output = formatSquad("Real Madrid", [
        { id: "1", clubPlayerId: "cp-1", shortName: "T. Courtois", age: 33, primaryPosition: "GK", secondaryPosition: null, overall: 90, fitness: 100, form: 70, morale: 70 },
        { id: "2", clubPlayerId: "cp-2", shortName: "Éder Militão", age: 27, primaryPosition: "CB", secondaryPosition: null, overall: 84, fitness: 100, form: 70, morale: 70 },
        { id: "3", clubPlayerId: "cp-3", shortName: "J. Bellingham", age: 22, primaryPosition: "CAM", secondaryPosition: "CM", overall: 90, fitness: 100, form: 70, morale: 70 },
        { id: "4", clubPlayerId: "cp-4", shortName: "K. Mbappé", age: 26, primaryPosition: "ST", secondaryPosition: "LW", overall: 91, fitness: 100, form: 70, morale: 70 },
      ]);

      expect(output).toContain("👥 <b>REAL MADRID — JAMOA</b>");
      expect(output).toContain("📋 <b>4</b> futbolchi");
      expect(output).toContain("🧤 <b>DARVOZABONLAR</b>");
      expect(output).toContain("1. T. Courtois — GK — ⭐<b>90</b>");
      expect(output).toContain("🛡 <b>HIMOYACHILAR</b>");
      expect(output).toContain("1. Éder Militão — CB — ⭐<b>84</b>");
      expect(output).toContain("🎯 <b>YARIM HIMOYACHILAR</b>");
      expect(output).toContain("1. J. Bellingham — CAM/CM — ⭐<b>90</b>");
      expect(output).toContain("⚡ <b>HUJUMCHILAR</b>");
      expect(output).toContain("1. K. Mbappé — ST/LW — ⭐<b>91</b>");
    });
  });

  describe("5. Asosiy XI & Taktika", () => {
    it("renders Starting XI with slot name, player, bold OVR and team power", () => {
      const output = formatStartingXi("Real Madrid", "4-3-3", [
        { clubPlayerId: "cp-1", slotKey: "GK", slotPosition: "GK", shortName: "Courtois", overall: 90, effectiveRating: 90 },
        { clubPlayerId: "cp-2", slotKey: "LB", slotPosition: "LB", shortName: "Cucurella", overall: 86, effectiveRating: 86 },
      ]);

      expect(output).toContain("🔥 <b>REAL MADRID — ASOSIY XI</b>");
      expect(output).toContain("<i>Formation: 4-3-3</i>");
      expect(output).toContain("GK\nCourtois — ⭐<b>90</b>");
      expect(output).toContain("LB\nCucurella — ⭐<b>86</b>");
      expect(output).toContain("⭐ Jamoa kuchi: <b>88.0</b>");
    });

    it("renders tactics screen with bold values", () => {
      const output = formatTactics({
        formationCode: "433",
        formationName: "4-3-3",
        mentality: "BALANCED",
        pressing: 70,
        tempo: 65,
        defensiveLine: 60,
        width: 55,
        passingStyle: "MIXED",
        attackFocus: "BOTH_WINGS",
        tackling: "NORMAL",
      });

      expect(output).toContain("🧠 <b>TAKTIKA</b>");
      expect(output).toContain("🧩 Formation: <b>4-3-3</b>");
      expect(output).toContain("🎯 Mentalitet: <b>Balansli</b>");
      expect(output).toContain("⚡ Pressing: <b>70</b>");
      expect(output).toContain("⏱ Temp: <b>65</b>");
      expect(output).toContain("📏 Himoya chizig‘i: <b>60</b>");
      expect(output).toContain("↔️ Kenglik: <b>55</b>");
      expect(output).toContain("🎯 Pas turi: <b>Mixed</b>");
      expect(output).toContain("⚔️ Hujum yo‘nalishi: <b>Both Wings</b>");
      expect(output).toContain("🛡 Kurashuvchanlik: <b>Normal</b>");
    });
  });

  describe("6. Transfer Hub & Markets", () => {
    it("renders transfer hub with budgets", () => {
      const output = formatTransferHub("Real Madrid", 150_000_000, 45_000_000, 40_000_000);
      expect(output).toContain("🔁 <b>REAL MADRID — TRANSFER</b>");
      expect(output).toContain("💰 Budjet: <b>€150M</b>");
      expect(output).toContain("🔒 Band: <b>€40M</b>");
      expect(output).toContain("✅ Mavjud: <b>€110M</b>");
      expect(output).toContain("<i>Kerakli bo‘limni tanlang.</i>");
    });

    it("renders transfer market and empty state", () => {
      const empty = formatLeagueMarket([], "LaLiga #0001");
      expect(empty).toContain("🛒 <b>TRANSFER BOZORI</b>");
      expect(empty).toContain("<i>Hozircha transferga qo‘yilgan futbolchilar topilmadi.</i>");

      const market = formatLeagueMarket([
        {
          listingId: "l-1",
          name: "Cole Palmer",
          age: 22,
          position: "ST",
          overall: 84,
          askingPrice: 55_000_000,
          availableUntil: "x",
          sellerName: "Chelsea",
          isOwnListing: false,
        },
      ], "LaLiga #0001");

      expect(market).toContain("🛒 <b>TRANSFER BOZORI</b>");
      expect(market).toContain("1. <b>Cole Palmer</b>");
      expect(market).toContain("⚡ ST · ⭐<b>84</b>");
      expect(market).toContain("🏟 Chelsea");
      expect(market).toContain("💰 <b>€55M</b>");
    });

    it("renders player profile and incoming offers", () => {
      const profile = formatPlayerProfile({
        clubPlayerId: "cp-1",
        name: "Lamine Yamal",
        clubName: "Barcelona",
        position: "RW/RM",
        overall: 90,
        age: 19,
        marketValue: 120_000_000,
        managerType: "AI",
      });

      expect(profile).toContain("👤 <b>LAMINE YAMAL</b>");
      expect(profile).toContain("🏟 Barcelona");
      expect(profile).toContain("📍 RW/RM");
      expect(profile).toContain("⭐ OVR: <b>90</b>");
      expect(profile).toContain("🎂 Yosh: <b>19</b>");
      expect(profile).toContain("💶 Bozor qiymati: <b>€120M</b>");
      expect(profile).toContain("<i>Manager: AI</i>");

      const offer = formatIncomingOffer("Barcelona", "Lamine Yamal", 95_000_000);
      expect(offer).toContain("📥 <b>TRANSFER TAKLIFI</b>");
      expect(offer).toContain("<b>Barcelona</b>");
      expect(offer).toContain("sizning <b>Lamine Yamal</b> futbolchingiz uchun");
      expect(offer).toContain("💶 <b>€95M</b> taklif qildi.");
    });
  });

  describe("7. Match Results, Table & Progression", () => {
    it("renders match report with win, stats and income", () => {
      const report = formatMatchReport({
        telegramId: 12345678,
        clubId: "c-1",
        club: "Real Madrid",
        opponent: "Barcelona",
        isHome: true,
        homeGoals: 3,
        awayGoals: 1,
        played: 11,
        goals: [
          { minute: 17, player: "Mbappé", assist: "Bellingham" },
          { minute: 54, player: "Yamal", assist: "Pedri" },
        ],
        possession: [54, 46],
        shots: [14, 10],
        onTarget: [7, 4],
        corners: [5, 3],
        position: 2,
        points: 25,
        wins: 8,
        draws: 1,
        losses: 2,
        income: 2_500_000,
        balance: 45_000_000,
        leagueName: "LaLiga #0001",
        next: {
          home: "Real Madrid",
          away: "Atletico Madrid",
          scheduledAt: "2026-09-22T20:00:00.000Z",
        },
      });

      expect(report).toContain("🟢 <b>G‘ALABA</b>");
      expect(report).toContain("<b>REAL MADRID 3–1 BARCELONA</b>");
      expect(report).toContain("17' Mbappé <i>(Bellingham)</i>");
      expect(report).toContain("📊 <b>STATISTIKA</b>");
      expect(report).toContain("To‘p nazorati: <b>54%</b> — 46%");
      expect(report).toContain("Zarbalar: <b>14</b> — 10");
      expect(report).toContain("Aniq zarbalar: <b>7</b> — 4");
      expect(report).toContain("Burchaklar: <b>5</b> — 3");
      expect(report).toContain("📈 <b>LIGA</b>");
      expect(report).toContain("<b>2-o‘rin</b>");
      expect(report).toContain("25 ochko · 8W 1D 2L");
      expect(report).toContain("💰 <b>DAROMAD</b>");
      expect(report).toContain("Match: €2.5M");
      expect(report).toContain("⏭ <b>KEYINGI O‘YIN</b>");
      expect(report).toContain("vs <b>Atletico Madrid</b>");
    });

    it("renders league table with highlighted user club", () => {
      const table = formatTable(
        [
          { position: 1, club: "Barcelona", played: 10, wins: 9, draws: 1, losses: 0, goalDifference: 20, points: 28 },
          { position: 2, club: "Real Madrid", played: 10, wins: 8, draws: 1, losses: 1, goalDifference: 15, points: 25 },
          { position: 3, club: "Atletico", played: 10, wins: 7, draws: 2, losses: 1, goalDifference: 12, points: 23 },
        ],
        "Real Madrid"
      );

      expect(table).toContain("🏆 <b>LALIGA — JADVAL</b>");
      expect(table).toContain("1. Barcelona — <b>28</b>");
      expect(table).toContain("👉 2. Real Madrid — <b>25</b>");
      expect(table).toContain("3. Atletico — <b>23</b>");
    });

    it("renders top scorers and assists with medals", () => {
      const scorers = formatLeaders(
        "TO‘PURARLAR",
        [
          { name: "Mbappé", club: "Real Madrid", total: 17 },
          { name: "Haaland", club: "Man City", total: 15 },
          { name: "Salah", club: "Liverpool", total: 13 },
        ],
        "gol"
      );

      expect(scorers).toContain("⚽ <b>TO‘PURARLAR</b>");
      expect(scorers).toContain("🥇 Mbappé — <b>17</b>");
      expect(scorers).toContain("🥈 Haaland — <b>15</b>");
      expect(scorers).toContain("🥉 Salah — <b>13</b>");

      const assists = formatLeaders(
        "ASSISTLAR",
        [
          { name: "Bellingham", club: "Real Madrid", total: 10 },
          { name: "Pedri", club: "Barcelona", total: 9 },
        ],
        "assist"
      );

      expect(assists).toContain("🎯 <b>ASSISTLAR</b>");
      expect(assists).toContain("🥇 Bellingham — <b>10</b>");
      expect(assists).toContain("🥈 Pedri — <b>9</b>");
    });

    it("renders manager profile with career stats and honours", () => {
      const profile = formatProfile({
        name: "Diyorbek",
        username: "diyorbek",
        rating: 1245,
        matches: 76,
        wins: 48,
        draws: 11,
        losses: 17,
        titles: 2,
        seasons: 5,
        spend: 200_000_000,
        income: 180_000_000,
        biggest: 100_000_000,
      });

      expect(profile).toContain("👤 <b>MANAGER PROFILI</b>");
      expect(profile).toContain("<b>@diyorbek</b>");
      expect(profile).toContain("⭐ Reyting: <b>1,245</b>");
      expect(profile).toContain("🎮 Mavsumlar: 5");
      expect(profile).toContain("🏆 Chempionlik: <b>2</b>");
      expect(profile).toContain("📊 <b>KARYERA</b>");
      expect(profile).toContain("W 48 · D 11 · L 17");
      expect(profile).toContain("Win rate: <b>63%</b>");
    });
  });
});
