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

describe("AdminRepository broadcast sessions", () => {
  it("boshqaruv sessiyasini to'g'ri o'rnatadi, tekshiradi va tozalaydi", async () => {
    const { loadConfig } = await import("../src/config/env.js");
    const { createDatabaseClient } = await import("../src/db/client.js");
    const { AdminRepository } = await import("../src/admin/admin.repository.js");

    const db = createDatabaseClient(loadConfig());
    const admin = new AdminRepository(db);

    const { data: user } = await db.from("users").select("id").limit(1).single();
    if (!user) return;

    // 1. Initial state: no broadcast session
    await admin.clearBroadcastSession(user.id);
    let active = await admin.getBroadcastSession(user.id);
    expect(active).toBe(false);

    // 2. Set broadcast session
    await admin.setBroadcastSession(user.id);
    active = await admin.getBroadcastSession(user.id);
    expect(active).toBe(true);

    // 3. Clear broadcast session
    await admin.clearBroadcastSession(user.id);
    active = await admin.getBroadcastSession(user.id);
    expect(active).toBe(false);

    // 4. broadcastTargets returns active users
    const targets = await admin.broadcastTargets();
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      expect(typeof t.telegramId).toBe("number");
      expect(t.telegramId).toBeGreaterThan(0);
    }
  });
});
