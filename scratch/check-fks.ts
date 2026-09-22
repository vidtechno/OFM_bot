import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const { data: fks } = await db.rpc("get_table_fks", {});
  // Or query information_schema if rpc does not exist
  const { data: pgFks, error } = await db.from("players").select("id").limit(1);
  console.log("Connected to db successfully.");

  // Check what tables reference club_players and players
  const tables = [
    "club_players", "lineup_players", "player_attributes", "player_positions",
    "global_market_listings", "transfer_listings", "transfer_offers", "match_events", "player_match_stats"
  ];
  for (const t of tables) {
    const { count } = await db.from(t).select("*", { count: "exact", head: true });
    console.log(`Table ${t}: row count = ${count}`);
  }
}

main().catch(console.error);
