import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const { data: lp } = await db.from("lineup_players").select("slot_key, club_player_id");
  const cpIds = lp!.map(x => x.club_player_id);
  const { data: cps } = await db.from("club_players").select("id, player_id, players(name, source_player_id, data_source_id)").in("id", cpIds);
  console.log("Current lineup players:");
  for (const c of cps || []) {
    const p = (c as any).players;
    console.log(`- ${c.id}: ${p?.name} (source_id: ${p?.source_player_id}, data_source: ${p?.data_source_id})`);
  }
}

main().catch(console.error);
