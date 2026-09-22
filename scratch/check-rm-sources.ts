import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const { data: rmClub } = await db.from("clubs").select("id, name").eq("name", "Real Madrid").single();
  const { data: players } = await db.from("players").select("id, name, short_name, source_player_id, data_source_id, created_at").eq("club_id", rmClub!.id);

  console.log(`Total RM players: ${players?.length}`);
  const bySourceId = new Map<string, any[]>();
  for (const p of players || []) {
    const l = bySourceId.get(p.source_player_id) || [];
    l.push(p);
    bySourceId.set(p.source_player_id, l);
  }

  console.log(`Distinct source_player_id: ${bySourceId.size}`);
  const dupes = [...bySourceId.entries()].filter(([_, l]) => l.length > 1);
  console.log(`Duplicates sharing same source_player_id: ${dupes.length}`);
  for (const [srcId, list] of dupes) {
    console.log(`- source_id ${srcId}:`);
    for (const item of list) {
      console.log(`    id: ${item.id}, name: "${item.name}", data_source: ${item.data_source_id}, created_at: ${item.created_at}`);
    }
  }

  const singles = [...bySourceId.entries()].filter(([_, l]) => l.length === 1);
  console.log(`\nSingles count: ${singles.length}`);
  for (const [srcId, list] of singles) {
    console.log(`- single source_id ${srcId}: name: "${list[0].name}", data_source: ${list[0].data_source_id}`);
  }
}

main().catch(console.error);
