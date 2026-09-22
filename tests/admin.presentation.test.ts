import { describe, expect, it } from "vitest";
import { formatAdminStats } from "../src/admin/presentation.js";

describe("admin presentation", () => {
  it("statistikani chiqaradi", () => {
    const text = formatAdminStats({
      users: 2,
      activeUsers: 1,
      blockedUsers: 1,
      activeLeagues: 2,
      openLobbies: 1,
      humanClubs: 1,
      aiClubs: 39,
      matches: 0,
      offers: 1,
      activeListings: 79,
    });
    expect(text).toContain("🛠 <b>ADMIN BOSHQARUV PANELI</b>");
    expect(text).toContain("Foydalanuvchilar: <b>2</b>");
    expect(text).toContain("🏆 Jami aktiv ligalar: <b>2</b> · Ochiq lobbilar: <b>1</b>");
  });
});
