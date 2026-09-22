import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const { data: rmClub } = await db.from("clubs").select("id, name").eq("name", "Real Madrid").single();
  const { data: players } = await db.from("players").select("id, name, short_name, source_player_id, data_source_id, created_at").eq("club_id", rmClub!.id).order("name");
  console.log(`Real Madrid players (${players?.length}):`);
  for (const p of players || []) {
    console.log(`- ${p.name} | short: ${p.short_name} | source_id: ${p.source_player_id} | data_source: ${p.data_source_id} | created_at: ${p.created_at}`);
  }

  // Also check data_sources
  const { data: sources } = await db.from("data_sources").select("*");
  console.log("\nData sources:", sources);
}

main().catch(console.error);
