import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const { data: eliteComp } = await db.from("competitions").select("id").eq("code", "ELITE").single();
  const { data: clubs } = await db.from("clubs").select("id, name").eq("competition_id", eliteComp!.id);

  console.log("Elite Clubs breakdown by data_source:");
  for (const c of clubs || []) {
    const { data: players } = await db.from("players").select("id, data_source_id, source_player_id").eq("club_id", c.id);
    const bySource = new Map<string, number>();
    for (const p of players || []) {
      bySource.set(p.data_source_id, (bySource.get(p.data_source_id) || 0) + 1);
    }
    console.log(`- ${c.name}: total=${players?.length}, sources:`, Object.fromEntries(bySource));
  }
}

main().catch(console.error);
