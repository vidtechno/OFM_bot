import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const { data: lineups, error } = await db.from("lineups").select("id, league_club_id, formation_id, is_active");
  console.log("Error:", error);
  console.log("Lineups count:", lineups?.length);
  for (const l of lineups || []) {
    const { data: lps } = await db.from("lineup_players").select("slot_key, club_player_id").eq("lineup_id", l.id);
    console.log(`Lineup ${l.id} (club ${l.league_club_id}): ${lps?.length} players`);
  }
}

main().catch(console.error);
