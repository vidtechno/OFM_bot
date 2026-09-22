import { describe, expect, it } from "vitest";
import { formatProfile, formatLeaderboard } from "../src/progression/presentation.js";

const p = {
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
};

describe("progression presentation", () => {
  it("profilni to'g'ri formatda chiqaradi", () => {
    const text = formatProfile(p);
    expect(text).toContain("👤 <b>MANAGER PROFILI</b>");
    expect(text).toContain("<b>@diyorbek</b>");
    expect(text).toContain("⭐ Reyting: <b>1,245</b>");
    expect(text).toContain("🎮 Mavsumlar: 5");
    expect(text).toContain("🏆 Chempionlik: <b>2</b>");
    expect(text).toContain("📊 <b>KARYERA</b>");
    expect(text).toContain("W 48 · D 11 · L 17");
    expect(text).toContain("Win rate: <b>63%</b>");
  });

  it("global reytingni medallar bilan chiqaradi", () => {
    const text = formatLeaderboard([p]);
    expect(text).toContain("🏆 <b>GLOBAL REYTING</b>");
    expect(text).toContain("🥇 <b>@diyorbek</b> — ⭐<b>1245</b> <i>(48W)</i>");
  });
});
