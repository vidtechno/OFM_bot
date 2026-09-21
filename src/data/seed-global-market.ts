import { createClient } from "@supabase/supabase-js";
import { Fc26Provider } from "./providers/fc26.provider.js";
import * as dotenv from "dotenv";

dotenv.config();

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key);

export async function seedGlobalMarket(): Promise<number> {
  process.stdout.write("Fetching FC26 CSV for Global Market stars...\n");
  const csvUrl = "https://raw.githubusercontent.com/ismailoksuz/EAFC26-DataHub/main/data/players.csv";
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
  const text = await res.text();
  const provider = new Fc26Provider();
  const allPlayers = provider.load(text);

  const eplLaligaClubs = new Set([
    "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton", "Chelsea",
    "Crystal Palace", "Everton", "Fulham", "Ipswich", "Leicester City", "Liverpool",
    "Manchester City", "Manchester United", "Newcastle United", "Nottingham Forest",
    "Southampton", "Tottenham Hotspur", "West Ham United", "Wolverhampton Wanderers",
    "Athletic Club", "Atlético Madrid", "Barcelona", "Celta Vigo", "Deportivo Alavés",
    "Espanyol", "Getafe", "Girona", "Las Palmas", "Leganés", "Mallorca", "Osasuna",
    "Rayo Vallecano", "Real Betis", "Real Madrid", "Real Sociedad", "Real Valladolid",
    "Sevilla", "Valencia", "Villarreal", "Coventry City", "Hull City", "Leeds United",
    "Sunderland", "RC Deportivo", "Racing Club", "Málaga CF", "Elche", "Levante",
    "FC Barcelona", "Real Madrid CF", "Atlético de Madrid", "Sevilla FC", "Valencia CF",
    "Villarreal CF", "Real Betis Balompié", "Athletic Club de Bilbao", "RCD Espanyol de Barcelona"
  ]);

  const excludedNames = new Set([
    "Lionel Messi", "Cristiano Ronaldo", "L. Messi", "C. Ronaldo", "Messi", "Ronaldo"
  ]);

  const topExternalClubs = new Set([
    "FC Bayern München", "Paris Saint-Germain", "Inter", "Borussia Dortmund",
    "Bayer 04 Leverkusen", "Milan", "Juventus", "Napoli", "Sporting CP", "SL Benfica"
  ]);

  // Fetch existing players to avoid duplicate names
  const { data: existingPlayers } = await db.from("players").select("short_name, name");
  const existingNames = new Set((existingPlayers ?? []).map((p) => p.short_name));
  const existingFullNames = new Set((existingPlayers ?? []).map((p) => p.name));

  const eligible = allPlayers.filter((p) =>
    topExternalClubs.has(p.clubName) &&
    !eplLaligaClubs.has(p.clubName) &&
    !excludedNames.has(p.name) &&
    !excludedNames.has(p.shortName) &&
    !existingNames.has(p.shortName) &&
    !existingFullNames.has(p.name) &&
    p.overall >= 83
  ).sort((a, b) => b.overall - a.overall);

  process.stdout.write(`Found ${eligible.length} eligible external top stars.\n`);

  // 1. Get or create external clubs
  const distinctClubs = [...new Set(eligible.map((p) => p.clubName))];
  const { data: existingClubs } = await db.from("clubs").select("id, name");
  const clubMap = new Map((existingClubs ?? []).map((c) => [c.name, c.id]));

  for (const clubName of distinctClubs) {
    if (!clubMap.has(clubName)) {
      const code = clubName.replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase();
      const { data: newClub, error } = await db.from("clubs").insert({
        name: clubName,
        code,
        city: clubName,
        is_external: true,
      }).select("id").single();
      if (error) throw error;
      clubMap.set(clubName, newClub.id);
    }
  }

  // 2. Get data source
  const { data: source } = await db.from("data_sources").select("id").eq("code", provider.code).maybeSingle();
  let sourceId = source?.id;
  if (!sourceId) {
    const { data: newSource, error } = await db.from("data_sources").insert({
      code: provider.code,
      name: "EA Sports FC 26 SoFIFA DataHub",
    }).select("id").single();
    if (error) throw error;
    sourceId = newSource.id;
  }

  // 3. Insert external players
  let insertedCount = 0;
  for (const p of eligible) {
    const clubId = clubMap.get(p.clubName)!;
    const { data: savedPlayer, error: pErr } = await db.from("players").upsert({
      data_source_id: sourceId,
      source_player_id: `EXT_${p.sourcePlayerId}`,
      club_id: clubId,
      name: p.name,
      short_name: p.shortName,
      age: p.age,
      nationality: p.nationality,
      primary_position: p.positions[0]!,
      secondary_position: p.positions[1] ?? null,
      market_value: p.marketValue,
      form: 75,
      fitness: 100,
      morale: 75,
    }, { onConflict: "data_source_id,source_player_id" }).select("id").single();

    if (pErr) {
      process.stderr.write(`Player insert failed for ${p.shortName}: ${pErr.message}\n`);
      continue;
    }

    const playerId = savedPlayer.id;

    // Attributes
    await db.from("player_attributes").upsert({
      player_id: playerId,
      overall: p.overall,
      pace: p.pace ?? p.overall,
      shooting: p.shooting ?? p.overall,
      passing: p.passing ?? p.overall,
      dribbling: p.dribbling ?? p.overall,
      defending: p.defending ?? p.overall,
      physical: p.physical ?? p.overall,
    }, { onConflict: "player_id" });

    // Positions
    const posRows = p.positions.map((pos, idx) => ({
      player_id: playerId,
      position: pos,
      priority: idx + 1,
    }));
    await db.from("player_positions").upsert(posRows, { onConflict: "player_id,position" });

    // Global Market Listing (Asking price = 1.30x market value, rounded to 100k)
    const askingPrice = Math.max(500_000, Math.round((p.marketValue * 1.30) / 100_000) * 100_000);
    const availableUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: listErr } = await db.from("global_market_listings").upsert({
      player_id: playerId,
      seller_name: p.clubName,
      asking_price: askingPrice,
      demand_multiplier: 1.2,
      rarity_multiplier: p.overall >= 86 ? 1.3 : 1.0,
      status: "ACTIVE",
      available_until: availableUntil,
    }, { onConflict: "player_id" });

    if (!listErr) {
      insertedCount++;
    }
  }

  process.stdout.write(`Successfully populated ${insertedCount} external stars into Global Market!\n`);
  return insertedCount;
}

if (process.argv[1]?.endsWith("seed-global-market.ts") || process.argv[1]?.endsWith("seed-global-market.js")) {
  seedGlobalMarket().catch((err) => {
    process.stderr.write(JSON.stringify(err, null, 2) + "\n");
    process.exit(1);
  });
}
