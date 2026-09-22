import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";
import { LeagueRepository } from "../src/leagues/league.repository.js";

describe("Tournament Limit Rule (Max 2 Tournaments)", () => {
  const config = loadConfig();
  const db = createDatabaseClient(config);
  const leagues = new LeagueRepository(db);

  it("foydalanuvchi maksimal 2 ta faol/ochiq turnirda qatnasha oladi, 3-sida xatolik beradi", async () => {
    // 1. Create a dedicated ephemeral test user
    const testTelegramId = 999000100 + Math.floor(Math.random() * 100000);
    const { data: testUser, error: userErr } = await db
      .from("users")
      .insert({
        telegram_id: testTelegramId,
        first_name: "LimitTester",
        username: `limit_test_${testTelegramId}`,
      })
      .select("id")
      .single();

    expect(userErr).toBeNull();
    const userId = testUser!.id;

    try {
      // 2. Fetch available clubs across open lobbies
      const lobbies = await leagues.listOpenLobbies();
      expect(lobbies.length).toBeGreaterThanOrEqual(2);

      const eliteLobby = lobbies.find((l) => l.competitionCode === "ELITE")!;
      const uzbLobby = lobbies.find((l) => l.competitionCode === "UZB")!;

      const eliteClubs = await leagues.listAvailableClubs(eliteLobby.leagueId);
      const uzbClubs = await leagues.listAvailableClubs(uzbLobby.leagueId);

      expect(eliteClubs.length).toBeGreaterThan(2);
      expect(uzbClubs.length).toBeGreaterThan(2);

      const club1 = eliteClubs[eliteClubs.length - 1]!;
      const club2 = uzbClubs[uzbClubs.length - 1]!;
      const club3 = eliteClubs[eliteClubs.length - 2]!;

      // 3. Claim Club 1 (1st tournament) -> SUCCESS
      const claim1 = await leagues.claimClub(userId, club1.leagueClubId);
      expect(claim1.leagueClubId).toBe(club1.leagueClubId);

      // 4. Claim Club 2 (2nd tournament) -> SUCCESS
      const claim2 = await leagues.claimClub(userId, club2.leagueClubId);
      expect(claim2.leagueClubId).toBe(club2.leagueClubId);

      // Check managed clubs count
      const managed = await leagues.listManagedClubs(userId);
      expect(managed.length).toBe(2);

      // 5. Attempt Claim Club 3 (3rd tournament) -> MUST FAIL with MAX_TOURNAMENT_LIMIT_REACHED
      await expect(leagues.claimClub(userId, club3.leagueClubId)).rejects.toThrow(
        "MAX_TOURNAMENT_LIMIT_REACHED"
      );

      // 6. Exit one league, now managed count is 1 -> claiming should succeed again
      await leagues.exitLeagueClub(userId, club1.leagueClubId);
      const managedAfterExit = await leagues.listManagedClubs(userId);
      expect(managedAfterExit.length).toBe(1);

      // 7. Now claiming 2nd club succeeds
      const claim3 = await leagues.claimClub(userId, club3.leagueClubId);
      expect(claim3.leagueClubId).toBe(club3.leagueClubId);

    } finally {
      // Cleanup test user and memberships
      await db.from("league_memberships").delete().eq("user_id", userId);
      await db.from("league_clubs").update({ manager_type: "AI", manager_user_id: null, claimed_at: null }).eq("manager_user_id", userId);
      await db.from("league_departures").delete().eq("user_id", userId);
      await db.from("manager_profiles").delete().eq("user_id", userId);
      await db.from("users").delete().eq("id", userId);
    }
  });

  it("bitta liga instansiyasida bir nechta klub olish taqiqlanadi", async () => {
    const testTelegramId = 999000200 + Math.floor(Math.random() * 100000);
    const { data: testUser } = await db
      .from("users")
      .insert({
        telegram_id: testTelegramId,
        first_name: "SameLeagueTester",
        username: `same_test_${testTelegramId}`,
      })
      .select("id")
      .single();

    const userId = testUser!.id;

    try {
      const lobbies = await leagues.listOpenLobbies();
      const lobby = lobbies[0]!;
      const available = await leagues.listAvailableClubs(lobby.leagueId);

      const clubA = available[0]!;
      const clubB = available[1]!;

      await leagues.claimClub(userId, clubA.leagueClubId);

      // Attempting to claim another club in the same league
      await expect(leagues.claimClub(userId, clubB.leagueClubId)).rejects.toThrow(
        "ALREADY_IN_LEAGUE_INSTANCE"
      );
    } finally {
      await db.from("league_memberships").delete().eq("user_id", userId);
      await db.from("league_clubs").update({ manager_type: "AI", manager_user_id: null, claimed_at: null }).eq("manager_user_id", userId);
      await db.from("league_departures").delete().eq("user_id", userId);
      await db.from("manager_profiles").delete().eq("user_id", userId);
      await db.from("users").delete().eq("id", userId);
    }
  });
});
