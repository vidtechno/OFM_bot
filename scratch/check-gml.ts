import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const { data: gml } = await db.from("global_market_listings").select("id, club_player_id, player_id, league_instance_id, status");
  const withCp = gml!.filter(x => x.club_player_id);
  console.log(`Global market listings total: ${gml?.length}, with club_player_id: ${withCp.length}`);
  if (withCp.length > 0) {
    console.log("Sample with club_player_id:", withCp);
  }
}

main().catch(console.error);
