import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const { data: lps } = await db.from("lineup_players").select("lineup_id, slot_key, slot_position, club_player_id");
  for (const lp of lps || []) {
    const { data: cp } = await db.from("club_players").select("id, players(name, source_player_id, data_source_id)").eq("id", lp.club_player_id).single();
    console.log(`${lp.slot_key} (${lp.slot_position}) -> ${(cp as any)?.players?.name} [${(cp as any)?.players?.source_player_id}] [${(cp as any)?.players?.data_source_id}]`);
  }
}

main().catch(console.error);
