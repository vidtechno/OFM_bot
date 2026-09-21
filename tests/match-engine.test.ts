import { describe, expect, it } from "vitest";
import { simulateMatch } from "../src/matches/match-engine.js";

const home = { clubId: "h", strength: 88, mentality: "ATTACKING", pressing: 60, tempo: 60 };
const away = { clubId: "a", strength: 80, mentality: "BALANCED", pressing: 50, tempo: 50 };

describe("simulateMatch", () => {
  it("bir fixture uchun deterministik natija va izchil statistika beradi", () => {
    const first = simulateMatch("fixture-1", home, away);
    expect(simulateMatch("fixture-1", home, away)).toEqual(first);
    expect(first.stats.shotsOnTargetHome).toBeGreaterThanOrEqual(first.homeGoals);
    expect(first.stats.shotsOnTargetAway).toBeGreaterThanOrEqual(first.awayGoals);
    expect(first.events.filter((event) => event.type === "GOAL")).toHaveLength(first.homeGoals + first.awayGoals);
  });

  it("turli fixture seedlari turli simulyatsiya beradi", () => {
    expect(simulateMatch("fixture-2", home, away)).not.toEqual(simulateMatch("fixture-3", home, away));
  });
});
