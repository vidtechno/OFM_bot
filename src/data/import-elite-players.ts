import { parse } from "csv-parse/sync";
import { loadConfig } from "../config/env.js";
import { createDatabaseClient } from "../db/client.js";
import { Fc26Provider } from "./providers/fc26.provider.js";
import type { ImportedPlayer } from "./providers/player-provider.js";

const SOURCE_URL = "https://raw.githubusercontent.com/ismailoksuz/EAFC26-DataHub/main/data/players.csv";
const BATCH_SIZE = 100;

export const ELITE_CSV_CLUB_MAP: Record<string, string> = {
  "Real Madrid": "Real Madrid",
  "FC Barcelona": "Barcelona",
  "Atlético Madrid": "Atlético Madrid",
  "Atlético de Madrid": "Atlético Madrid",
  "Manchester City": "Manchester City",
  "Liverpool": "Liverpool",
  "Arsenal": "Arsenal",
  "Manchester United": "Manchester United",
  "Manchester Utd": "Manchester United",
  "Chelsea": "Chelsea",
  "Tottenham Hotspur": "Tottenham Hotspur",
  "Tottenham": "Tottenham Hotspur",
  "Newcastle United": "Newcastle United",
  "Newcastle Utd": "Newcastle United",
  "FC Bayern München": "Bayern München",
  "Bayern Munich": "Bayern München",
  "Borussia Dortmund": "Borussia Dortmund",
  "Dortmund": "Borussia Dortmund",
  "Bayer 04 Leverkusen": "Bayer Leverkusen",
  "Bayer Leverkusen": "Bayer Leverkusen",
  "Paris Saint-Germain": "Paris Saint-Germain",
  "PSG": "Paris Saint-Germain",
  "Inter": "Inter",
  "AC Milan": "AC Milan",
  "Milan": "AC Milan",
  "Juventus": "Juventus",
  "Napoli": "Napoli",
  "SL Benfica": "Benfica",
  "Benfica": "Benfica",
  "Sporting CP": "Sporting CP",
};

export async function importElitePlayers(options: { dryRun?: boolean } = {}): Promise<{
  totalImported: number;
  clubCounts: Record<string, number>;
  ratingDistribution: { "90+": number; "85-89": number; "80-84": number; "<80": number };
}> {
  console.log(`Starting Elite League player import (dryRun=${Boolean(options.dryRun)})...`);
  const database = createDatabaseClient(loadConfig());
  const provider = new Fc26Provider();

  // 1. Get competition and clubs
  const { data: comp } = await database
    .from("competitions")
    .select("id")
    .eq("code", "ELITE")
    .single();

  if (!comp) throw new Error("ELITE competition not found");

  const { data: clubs, error: clubsErr } = await database
    .from("clubs")
    .select("id, name")
    .eq("competition_id", comp.id);

  if (clubsErr) throw clubsErr;
  const clubIdByName = new Map((clubs ?? []).map((c) => [c.name, c.id]));

  console.log(`Found ${clubIdByName.size} Elite clubs in DB.`);

  // 2. Fetch CSV
  console.log(`Fetching CSV from ${SOURCE_URL}...`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`CSV fetch failed: ${response.status}`);
  const csvText = await response.text();

  const allPlayers = provider.load(csvText);
  console.log(`Total players in CSV: ${allPlayers.length}`);

  // 3. Filter for Elite clubs
  const elitePlayers: ImportedPlayer[] = [];
  const clubCounts: Record<string, number> = {};
  const ratingDistribution = { "90+": 0, "85-89": 0, "80-84": 0, "<80": 0 };

  for (const p of allPlayers) {
    const targetClubName = ELITE_CSV_CLUB_MAP[p.clubName];
    if (!targetClubName) continue;
    const targetClubId = clubIdByName.get(targetClubName);
    if (!targetClubId) continue;

    // Clone player with canonical club name
    elitePlayers.push({
      ...p,
      clubName: targetClubName,
    });

    clubCounts[targetClubName] = (clubCounts[targetClubName] ?? 0) + 1;
    if (p.overall >= 90) ratingDistribution["90+"]++;
    else if (p.overall >= 85) ratingDistribution["85-89"]++;
    else if (p.overall >= 80) ratingDistribution["80-84"]++;
    else ratingDistribution["<80"]++;
  }

  console.log(`Filtered ${elitePlayers.length} players across 20 Elite clubs:`);
  for (const [club, count] of Object.entries(clubCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`- ${club}: ${count} players`);
  }
  console.log("Rating Distribution:", ratingDistribution);

  if (options.dryRun) {
    return { totalImported: elitePlayers.length, clubCounts, ratingDistribution };
  }

  // 4. Upsert data source
  let { data: source } = await database
    .from("data_sources")
    .select("id")
    .eq("code", provider.code)
    .maybeSingle();

  if (!source) {
    const { data: created, error: sourceErr } = await database
      .from("data_sources")
      .insert({
        code: provider.code,
        name: "FC 26 Player Data",
        version: "2026-v1",
      })
      .select("id")
      .single();
    if (sourceErr) throw sourceErr;
    source = created;
  }

  // 5. Batch upsert players
  for (let i = 0; i < elitePlayers.length; i += BATCH_SIZE) {
    const batch = elitePlayers.slice(i, i + BATCH_SIZE);
    const { data: saved, error } = await database
      .from("players")
      .upsert(
        batch.map((p) => ({
          data_source_id: source.id,
          source_player_id: p.sourcePlayerId,
          club_id: clubIdByName.get(p.clubName)!,
          name: p.name,
          short_name: p.shortName,
          age: p.age,
          nationality: p.nationality,
          primary_position: p.positions[0],
          secondary_position: p.positions[1] ?? null,
          market_value: p.marketValue,
        })),
        { onConflict: "data_source_id,source_player_id" }
      )
      .select("id, source_player_id");

    if (error) throw error;

    const playerIds = new Map((saved ?? []).map((row) => [row.source_player_id, row.id]));

    // Attributes
    const { error: ae } = await database.from("player_attributes").upsert(
      batch.map((p) => ({
        player_id: playerIds.get(p.sourcePlayerId)!,
        overall: p.overall,
        pace: p.pace,
        shooting: p.shooting,
        passing: p.passing,
        dribbling: p.dribbling,
        defending: p.defending,
        physical: p.physical,
      })),
      { onConflict: "player_id" }
    );
    if (ae) throw ae;

    // Positions
    const { error: pe } = await database.from("player_positions").upsert(
      batch.flatMap((p) =>
        p.positions.map((position, index) => ({
          player_id: playerIds.get(p.sourcePlayerId)!,
          position,
          priority: index + 1,
        }))
      ),
      { onConflict: "player_id,position" }
    );
    if (pe) throw pe;
  }

  console.log(`Elite League import completed: ${elitePlayers.length} players inserted/updated.`);
  return { totalImported: elitePlayers.length, clubCounts, ratingDistribution };
}

if (process.argv[1]?.endsWith("import-elite-players.ts")) {
  const isDryRun = process.argv.includes("--dry-run");
  importElitePlayers({ dryRun: isDryRun }).catch(console.error);
}
