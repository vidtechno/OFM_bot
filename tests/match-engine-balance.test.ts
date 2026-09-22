import { describe, expect, it } from "vitest";
import { simulateMatch, type MatchTeamInput } from "../src/matches/match-engine.js";

describe("Match Engine Balance & Simulation Harness (5,000+ matches)", () => {
  it("5,000 match simulyatsiyasida gol taqsimoti, kutilmagan g'alabalar (upsets) va taktika effektlarini tekshiradi", () => {
    const TOTAL_MATCHES = 5000;
    let totalGoals = 0;
    let cleanSheets = 0;
    let highScores = 0; // > 5 goals total
    let blowouts = 0;   // > 8 goals by one team (should be 0)
    let upsets = 0;      // Underdog with gap >= 6 wins
    let underdogMatches = 0;
    let redCards = 0;
    let yellowCards = 0;
    let penalties = 0;

    // Tactical counter counters
    let highLineVsDirectGoals = 0;
    let standardLineGoals = 0;
    let aggressiveTacklingFouls = 0;
    let cautiousTacklingFouls = 0;

    for (let i = 0; i < TOTAL_MATCHES; i++) {
      const fixtureId = `balance-test-fixture-${i}`;

      // Vary team strengths: gap from -12 to +12
      const homeStrength = 75 + (i % 15);
      const awayStrength = 75 + ((i * 3) % 15);
      const gap = homeStrength - awayStrength;

      // Rotate tactics
      const tacticsList = ["VERY_DEFENSIVE", "DEFENSIVE", "BALANCED", "ATTACKING", "VERY_ATTACKING"];
      const passingStyles = ["SHORT", "MIXED", "DIRECT"];
      const attackFocuses = ["CENTRE", "BOTH_WINGS", "LEFT", "RIGHT", "MIXED"];
      const tacklings = ["CAUTIOUS", "NORMAL", "AGGRESSIVE"];

      const home: MatchTeamInput = {
        clubId: `home-${i}`,
        strength: homeStrength,
        mentality: tacticsList[i % tacticsList.length]!,
        pressing: 40 + (i % 50),
        tempo: 40 + (i % 50),
        defensiveLine: 35 + (i % 55),
        width: 30 + (i % 60),
        passingStyle: passingStyles[i % passingStyles.length],
        attackFocus: attackFocuses[i % attackFocuses.length],
        tackling: tacklings[i % tacklings.length],
      };

      const away: MatchTeamInput = {
        clubId: `away-${i}`,
        strength: awayStrength,
        mentality: tacticsList[(i + 2) % tacticsList.length]!,
        pressing: 40 + ((i * 2) % 50),
        tempo: 40 + ((i * 2) % 50),
        defensiveLine: 35 + ((i * 2) % 55),
        width: 30 + ((i * 2) % 60),
        passingStyle: passingStyles[(i + 1) % passingStyles.length],
        attackFocus: attackFocuses[(i + 1) % attackFocuses.length],
        tackling: tacklings[(i + 1) % tacklings.length],
      };

      const result = simulateMatch(fixtureId, home, away);

      const matchGoals = result.homeGoals + result.awayGoals;
      totalGoals += matchGoals;
      if (result.homeGoals === 0 || result.awayGoals === 0) cleanSheets++;
      if (matchGoals > 5) highScores++;
      if (result.homeGoals > 8 || result.awayGoals > 8) blowouts++;

      // Check upsets: favorite has gap >= 6
      if (gap >= 6) {
        underdogMatches++;
        if (result.awayGoals > result.homeGoals) upsets++;
      } else if (gap <= -6) {
        underdogMatches++;
        if (result.homeGoals > result.awayGoals) upsets++;
      }

      // Events tally
      for (const ev of result.events) {
        if (ev.type === "RED_CARD") redCards++;
        if (ev.type === "YELLOW_CARD") yellowCards++;
        if (ev.type === "GOAL" && ev.isPenalty) penalties++;
      }

      // Tactical tracking
      if (home.defensiveLine! > 65 && away.passingStyle === "DIRECT") {
        highLineVsDirectGoals += result.awayGoals;
      }
      if (home.defensiveLine! <= 50) {
        standardLineGoals += result.awayGoals;
      }

      if (home.tackling === "AGGRESSIVE") {
        aggressiveTacklingFouls += result.stats.foulsHome;
      } else if (home.tackling === "CAUTIOUS") {
        cautiousTacklingFouls += result.stats.foulsHome;
      }
    }

    const avgGoalsPerMatch = totalGoals / TOTAL_MATCHES;
    const upsetRate = underdogMatches > 0 ? (upsets / underdogMatches) * 100 : 0;

    // Assertions
    // 1. Average goals per match must be between 2.2 and 3.2
    expect(avgGoalsPerMatch).toBeGreaterThan(2.2);
    expect(avgGoalsPerMatch).toBeLessThan(3.2);

    // 2. Zero blowouts (>8 goals by a team)
    expect(blowouts).toBe(0);

    // 3. Realistic upset percentage (between 10% and 25%)
    expect(upsetRate).toBeGreaterThanOrEqual(10);
    expect(upsetRate).toBeLessThanOrEqual(25);

    // 4. Cards and penalties present but realistic
    expect(yellowCards).toBeGreaterThan(TOTAL_MATCHES); // ~2-4 yellows per match
    expect(redCards).toBeGreaterThan(0);
    expect(redCards).toBeLessThan(TOTAL_MATCHES * 0.15); // < 15% matches have red card
    expect(penalties).toBeGreaterThan(0);

    // 5. Tactical counter impacts: Aggressive tackling generates more fouls than cautious
    expect(aggressiveTacklingFouls).toBeGreaterThan(cautiousTacklingFouls);
  });
});
