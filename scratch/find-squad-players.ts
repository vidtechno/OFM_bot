import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const { data: nonEliteClubs } = await db.from("clubs")
    .select("id, name, competitions(code)")
    .not("competitions.code", "in", '("ELITE","UZB")');

  console.log("Non-Elite, non-UZB clubs count:", nonEliteClubs?.length);
  for (const c of nonEliteClubs || []) {
    const { data: players } = await db.from("players").select("short_name, primary_position, player_attributes(overall)").eq("club_id", c.id);
    if (players && players.length > 0) {
      console.log(`Club ${c.name} (${players.length} players):`, players.slice(0, 5).map(p => p.short_name));
    }
  }
}

main().catch(console.error);
