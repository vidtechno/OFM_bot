import { describe, expect, it } from "vitest";
import { formatResults, formatTable, formatMatchReport, formatLeaders } from "../src/matches/presentation.js";

describe("match presentation", () => {
  it("natijalarni to‘g‘ri formatda ko‘rsatadi", () => {
    const text = formatResults([{ id: "1", round: 2, playedAt: "x", homeClub: "Real Madrid", awayClub: "Barcelona", homeGoals: 3, awayGoals: 1 }]);
    expect(text).toContain("⚽ <b>SO‘NGGI NATIJALAR</b>");
    expect(text).toContain("<b>2-tur</b> · Real Madrid <b>3:1</b> Barcelona");
  });

  it("jadvalda user klubini ajratib ko‘rsatadi", () => {
    const rows = [
      { position: 1, club: "Barcelona", played: 10, wins: 9, draws: 1, losses: 0, goalDifference: 20, points: 28 },
      { position: 2, club: "Real Madrid", played: 10, wins: 8, draws: 1, losses: 1, goalDifference: 15, points: 25 },
    ];
    const text = formatTable(rows, "Real Madrid", "LALIGA — JADVAL");
    expect(text).toContain("🏆 <b>LALIGA — JADVAL</b>");
    expect(text).toContain("1. Barcelona — <b>28</b>");
    expect(text).toContain("👉 2. Real Madrid — <b>25</b>");
  });

  it("to‘purarlar va assistentlarni medallar bilan ko‘rsatadi", () => {
    const scorers = [
      { name: "Mbappé", club: "Real Madrid", total: 17 },
      { name: "Haaland", club: "Man City", total: 15 },
      { name: "Salah", club: "Liverpool", total: 13 },
    ];
    const text = formatLeaders("TO‘PURARLAR", scorers, "gol");
    expect(text).toContain("⚽ <b>TO‘PURARLAR</b>");
    expect(text).toContain("🥇 Mbappé <i>(Real Madrid)</i> — <b>17</b>");
    expect(text).toContain("🥈 Haaland <i>(Man City)</i> — <b>15</b>");
    expect(text).toContain("🥉 Salah <i>(Liverpool)</i> — <b>13</b>");
  });

  it("match reportni to'liq statistika va g'alaba bilan chiqaradi", () => {
    const text = formatMatchReport({
      telegramId: 12345678,
      clubId: "c-1",
      club: "Real Madrid",
      opponent: "Barcelona",
      isHome: true,
      homeGoals: 3,
      awayGoals: 1,
      played: 10,
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
      losses: 1,
      income: 2_500_000,
      balance: 45_000_000,
      leagueName: "LaLiga #0001",
      next: {
        home: "Real Madrid",
        away: "Atletico Madrid",
        scheduledAt: "2026-09-22T15:00:00.000Z",
      },
    });

    expect(text).toContain("🟢 <b>G‘ALABA</b>");
    expect(text).toContain("<b>REAL MADRID 3–1 BARCELONA</b>");
    expect(text).toContain("17' Mbappé <i>(Bellingham)</i>");
    expect(text).toContain("54' Yamal <i>(Pedri)</i>");
    expect(text).toContain("📊 <b>STATISTIKA</b>");
    expect(text).toContain("To‘p nazorati: <b>54%</b> — 46%");
    expect(text).toContain("Zarbalar: <b>14</b> — 10");
    expect(text).toContain("Aniq zarbalar: <b>7</b> — 4");
    expect(text).toContain("Burchaklar: <b>5</b> — 3");
    expect(text).toContain("📈 <b>LIGA</b>");
    expect(text).toContain("<b>2-o‘rin</b>");
    expect(text).toContain("25 ochko · 8W 1D 1L");
    expect(text).toContain("💰 <b>DAROMAD</b>");
    expect(text).toContain("Match: €2.5M");
    expect(text).toContain("⏭ <b>KEYINGI O‘YIN</b>");
  });
});
