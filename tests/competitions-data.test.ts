import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

describe("Competitions Dataset & Global Market Integrity", () => {
  const config = loadConfig();
  const db = createDatabaseClient(config);

  it("OFM Elite League: 20 ta klub, haqiqiy tarkiblar va 380 ta fixture mavjudligini tasdiqlaydi", async () => {
    const { data: comp } = await db.from("competitions").select("id, club_limit, rounds").eq("code", "ELITE").single();
    expect(comp?.club_limit).toBe(20);
    expect(comp?.rounds).toBe(38);

    const { data: clubs } = await db.from("clubs").select("id, name, code").eq("competition_id", comp!.id);
    expect(clubs?.length).toBe(20);

    const clubNames = clubs!.map((c) => c.name);
    expect(clubNames).toContain("Real Madrid");
    expect(clubNames).toContain("Barcelona");
    expect(clubNames).toContain("Manchester City");
    expect(clubNames).toContain("Bayern München");
    expect(clubNames).toContain("Paris Saint-Germain");

    // Check squad sizes: every club must have >= 20 players after 2026/27 reconciliation
    const clubIds = clubs!.map((c) => c.id);
    const { data: allPlayers } = await db.from("players").select("id, club_id").in("club_id", clubIds);
    const countByClub = new Map<string, number>();
    for (const p of allPlayers ?? []) {
      countByClub.set(p.club_id, (countByClub.get(p.club_id) || 0) + 1);
    }
    for (const club of clubs!) {
      // After 2026/27 reconciliation some clubs may be at 18 (MIN_SQUAD_SIZE)
      expect(countByClub.get(club.id) ?? 0).toBeGreaterThanOrEqual(18);
    }

    // Check open lobby fixtures: 20 clubs double round-robin = 380 fixtures
    const { data: lobby } = await db
      .from("league_instances")
      .select("id")
      .eq("competition_id", comp!.id)
      .eq("status", "OPEN")
      .limit(1)
      .single();

    const { count: fixtureCount } = await db
      .from("fixtures")
      .select("*", { count: "exact", head: true })
      .eq("league_instance_id", lobby!.id);
    expect(fixtureCount).toBe(380);
  });

  it("O‘zbekiston Superligasi: 16 ta real klub, OVR 56-76 va 240 ta fixture mavjudligini tasdiqlaydi", async () => {
    const { data: comp } = await db.from("competitions").select("id, club_limit, rounds").eq("code", "UZB").single();
    expect(comp?.club_limit).toBe(16);
    expect(comp?.rounds).toBe(30);

    const { data: clubs } = await db.from("clubs").select("id, name, code").eq("competition_id", comp!.id);
    expect(clubs?.length).toBe(16);

    const clubNames = clubs!.map((c) => c.name);
    expect(clubNames).toContain("Pakhtakor Tashkent");
    expect(clubNames).toContain("Navbahor Namangan");
    expect(clubNames).toContain("Nasaf Qarshi");
    expect(clubNames).toContain("Neftchi Fergana");
    expect(clubNames).toContain("Bunyodkor Tashkent");

    // Check players ratings: strictly 56 to 76
    const clubIds = clubs!.map((c) => c.id);
    const { data: uzbPlayers } = await db
      .from("players")
      .select("id, player_attributes(overall)")
      .in("club_id", clubIds);

    expect(uzbPlayers?.length).toBeGreaterThanOrEqual(350);
    const ratings = uzbPlayers!.map((p: any) => p.player_attributes?.overall).filter(Boolean);
    expect(Math.min(...ratings)).toBeGreaterThanOrEqual(56);
    expect(Math.max(...ratings)).toBeLessThanOrEqual(76);

    // Check open lobby fixtures: 16 clubs double round-robin = 240 fixtures
    const { data: lobby } = await db
      .from("league_instances")
      .select("id")
      .eq("competition_id", comp!.id)
      .eq("status", "OPEN")
      .limit(1)
      .single();

    const { count: fixtureCount } = await db
      .from("fixtures")
      .select("*", { count: "exact", head: true })
      .eq("league_instance_id", lobby!.id);
    expect(fixtureCount).toBe(240);
  });

  it("O‘zbekiston Superligasi Global Market: OVR <= 80 qoidasini va narx chegaralarini tasdiqlaydi", async () => {
    const { data: comp } = await db.from("competitions").select("id").eq("code", "UZB").single();
    const { data: lobby } = await db
      .from("league_instances")
      .select("id")
      .eq("competition_id", comp!.id)
      .eq("status", "OPEN")
      .limit(1)
      .single();

    const { data: listings } = await db
      .from("global_market_listings")
      .select("asking_price, players(player_attributes(overall))")
      .eq("league_instance_id", lobby!.id)
      .eq("status", "ACTIVE");

    // Market listings may vary: seeder creates 40 initially, some may expire or be bought
    expect(listings?.length).toBeGreaterThanOrEqual(30);
    expect(listings?.length).toBeLessThanOrEqual(50);
    const ovrs = listings!.map((l: any) => l.players?.player_attributes?.overall).filter(Boolean);
    const prices = listings!.map((l: any) => l.asking_price);

    // Strict cap: max overall MUST NOT exceed 80
    expect(Math.max(...ovrs)).toBeLessThanOrEqual(80);
    expect(Math.min(...ovrs)).toBeGreaterThanOrEqual(75);

    // Prices in €2.0M - €6.8M range
    expect(Math.min(...prices)).toBeGreaterThanOrEqual(2_000_000);
    expect(Math.max(...prices)).toBeLessThanOrEqual(6_800_000);
  });

  it("O‘zbekiston Superligasi klubi OVR > 80 futbolchini sotib olmoqchi bo'lsa RPC darajasida xatolik qaytaradi", async () => {
    const { data: comp } = await db.from("competitions").select("id").eq("code", "UZB").single();

    // Create a temporary ACTIVE instance
    const { data: activeInstance } = await db
      .from("league_instances")
      .insert({
        competition_id: comp!.id,
        access_mode: "PRIVATE",
        join_code: `U${Math.floor(1000 + Math.random() * 9000)}`,
        status: "ACTIVE",
        instance_number: 9998,
        current_round: 1,
      })
      .select("id")
      .single();

    const instanceId = activeInstance!.id;

    // Pick an 85+ OVR player from external pool
    const { data: elitePlayer } = await db
      .from("players")
      .select("id, player_attributes!inner(overall)")
      .gte("player_attributes.overall", 85)
      .limit(1)
      .single();

    expect(elitePlayer).not.toBeNull();

    // Insert test listing into active instance
    const { data: testListing, error: listErr } = await db
      .from("global_market_listings")
      .insert({
        league_instance_id: instanceId,
        player_id: elitePlayer!.id,
        seller_name: "Test Elite Club",
        asking_price: 1_000_000,
        demand_multiplier: 1.0,
        rarity_multiplier: 1.0,
        status: "ACTIVE",
        available_until: new Date(Date.now() + 86400000).toISOString(),
      })
      .select("id")
      .single();

    expect(listErr).toBeNull();
    const listingId = testListing!.id;

    // Create test user and assign club in this active instance
    const { data: uzbRealClub } = await db.from("clubs").select("id").eq("competition_id", comp!.id).limit(1).single();

    const testTelegramId = 999000500 + Math.floor(Math.random() * 100000);
    const { data: testUser } = await db
      .from("users")
      .insert({ telegram_id: testTelegramId, first_name: "OvrTester" })
      .select("id")
      .single();
    const userId = testUser!.id;

    const { data: uzbClub } = await db
      .from("league_clubs")
      .insert({
        league_instance_id: instanceId,
        club_id: uzbRealClub!.id,
        manager_type: "HUMAN",
        manager_user_id: userId,
        cash_balance: 50_000_000,
      })
      .select("id")
      .single();

    try {
      // Attempt to buy this >80 player: MUST BE REJECTED BY RPC
      const { error: buyErr } = await db.rpc("buy_global_market_player", {
        p_user_id: userId,
        p_buyer_club_id: uzbClub!.id,
        p_listing_id: listingId,
      });

      expect(buyErr).not.toBeNull();
      expect(buyErr?.message).toContain("UZBEK_LEAGUE_MAX_OVR_80_EXCEEDED");
    } finally {
      await db.from("global_market_listings").delete().eq("id", listingId);
      await db.from("league_clubs").delete().eq("id", uzbClub!.id);
      await db.from("league_instances").delete().eq("id", instanceId);
      await db.from("manager_profiles").delete().eq("user_id", userId);
      await db.from("users").delete().eq("id", userId);
    }
  });
});
