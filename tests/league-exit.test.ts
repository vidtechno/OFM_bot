import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";
import { LeagueRepository } from "../src/leagues/league.repository.js";

describe("League Exit & Exploit Protection", () => {
  const config = loadConfig();
  const db = createDatabaseClient(config);
  const leagues = new LeagueRepository(db);

  it("OPEN ligadan chiqqanda klub to'liq AI'ga qaytadi va boshqalar uchun bo'shaydi", async () => {
    const testTelegramId = 999000300 + Math.floor(Math.random() * 100000);
    const { data: testUser } = await db
      .from("users")
      .insert({ telegram_id: testTelegramId, first_name: "OpenExitTester" })
      .select("id")
      .single();
    const userId = testUser!.id;

    try {
      const lobbies = await leagues.listOpenLobbies();
      const openLobby = lobbies.find((l) => l.status === "OPEN")!;
      const availableClubs = await leagues.listAvailableClubs(openLobby.leagueId);
      const targetClub = availableClubs[0]!;

      // 1. Claim club
      await leagues.claimClub(userId, targetClub.leagueClubId);

      // Verify club is claimed
      const { data: claimedRow } = await db
        .from("league_clubs")
        .select("manager_type, manager_user_id")
        .eq("id", targetClub.leagueClubId)
        .single();
      expect(claimedRow?.manager_type).toBe("HUMAN");
      expect(claimedRow?.manager_user_id).toBe(userId);

      // 2. Exit club while OPEN
      const exitResult = await leagues.exitLeagueClub(userId, targetClub.leagueClubId);
      expect(exitResult.leagueStatus).toBe("OPEN");
      expect(exitResult.clubName).toBe(targetClub.clubName);

      // Verify club is now AI and available again
      const { data: freedRow } = await db
        .from("league_clubs")
        .select("manager_type, manager_user_id, claimed_at")
        .eq("id", targetClub.leagueClubId)
        .single();
      expect(freedRow?.manager_type).toBe("AI");
      expect(freedRow?.manager_user_id).toBeNull();
      expect(freedRow?.claimed_at).toBeNull();

      // Verify membership is deleted
      const { data: memRow } = await db
        .from("league_memberships")
        .select("id")
        .eq("league_club_id", targetClub.leagueClubId)
        .maybeSingle();
      expect(memRow).toBeNull();

      // Check available clubs list includes it again
      const availableAgain = await leagues.listAvailableClubs(openLobby.leagueId);
      expect(availableAgain.some((c) => c.leagueClubId === targetClub.leagueClubId)).toBe(true);

    } finally {
      await db.from("league_memberships").delete().eq("user_id", userId);
      await db.from("league_clubs").update({ manager_type: "AI", manager_user_id: null, claimed_at: null }).eq("manager_user_id", userId);
      await db.from("league_departures").delete().eq("user_id", userId);
      await db.from("manager_profiles").delete().eq("user_id", userId);
      await db.from("users").delete().eq("id", userId);
    }
  });

  it("ACTIVE ligadan chiqqanda klub AI'ga o'tadi, squad/ochko/budget saqlanadi, va qayta kirish bloklanadi", async () => {
    const testTelegramId = 999000400 + Math.floor(Math.random() * 100000);
    const { data: testUser } = await db
      .from("users")
      .insert({ telegram_id: testTelegramId, first_name: "ActiveExitTester" })
      .select("id")
      .single();
    const userId = testUser!.id;

    // Create a temporary test league instance in ACTIVE status
    const { data: comp } = await db.from("competitions").select("id").eq("code", "ELITE").single();
    const { data: testInstance, error: instErr } = await db
      .from("league_instances")
      .insert({
        competition_id: comp!.id,
        access_mode: "PRIVATE",
        join_code: `T${Math.floor(1000 + Math.random() * 9000)}`,
        status: "ACTIVE",
        instance_number: 9999,
        current_round: 5,
      })
      .select("id")
      .single();

    expect(instErr).toBeNull();
    const instanceId = testInstance!.id;

    // Add a club to this instance
    const { data: club } = await db.from("clubs").select("id, name").eq("code", "MCI").single();
    const { data: lc } = await db
      .from("league_clubs")
      .insert({
        league_instance_id: instanceId,
        club_id: club!.id,
        manager_type: "HUMAN",
        manager_user_id: userId,
        points: 12,
        cash_balance: 45000000,
      })
      .select("id")
      .single();

    const leagueClubId = lc!.id;

    // Add membership
    await db.from("league_memberships").insert({
      league_instance_id: instanceId,
      competition_id: comp!.id,
      league_club_id: leagueClubId,
      user_id: userId,
    });

    try {
      // 1. Exit active league
      const exitResult = await leagues.exitLeagueClub(userId, leagueClubId);
      expect(exitResult.leagueStatus).toBe("ACTIVE");

      // Verify club row: AI manager, but points & budget preserved
      const { data: activeClubRow } = await db
        .from("league_clubs")
        .select("manager_type, manager_user_id, points, cash_balance")
        .eq("id", leagueClubId)
        .single();

      expect(activeClubRow?.manager_type).toBe("AI");
      expect(activeClubRow?.manager_user_id).toBeNull();
      expect(activeClubRow?.points).toBe(12);
      expect(Number(activeClubRow?.cash_balance)).toBe(45000000);

      // Verify league_departures record created
      const { data: dep } = await db
        .from("league_departures")
        .select("id")
        .eq("league_instance_id", instanceId)
        .eq("user_id", userId)
        .single();
      expect(dep).not.toBeNull();

      // 2. Exploit Protection: attempting to re-claim ANY club in this ACTIVE instance MUST FAIL
      await expect(leagues.claimClub(userId, leagueClubId)).rejects.toThrow(
        "DEPARTED_LEAGUE_REJOIN_BLOCKED"
      );

    } finally {
      await db.from("league_departures").delete().eq("user_id", userId);
      await db.from("league_memberships").delete().eq("league_instance_id", instanceId);
      await db.from("league_clubs").delete().eq("league_instance_id", instanceId);
      await db.from("league_instances").delete().eq("id", instanceId);
      await db.from("manager_profiles").delete().eq("user_id", userId);
      await db.from("users").delete().eq("id", userId);
    }
  });
});
