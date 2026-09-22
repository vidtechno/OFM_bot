import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const SOFIFA_SOURCE = "f54021ee-1775-4a0f-b842-a3614bed9bb1";
  const { data: rmClub } = await db.from("clubs").select("id").eq("name", "Real Madrid").single();
  const { data: rmLeagueClub } = await db.from("league_clubs").select("id").eq("club_id", rmClub!.id).single();

  const { data: cps } = await db.from("club_players")
    .select("id, player_id, players!inner(name, short_name, source_player_id, data_source_id)")
    .eq("league_club_id", rmLeagueClub!.id)
    .eq("players.data_source_id", SOFIFA_SOURCE);

  console.log(`Real Madrid SOFIFA club_players count: ${cps?.length}`);
  for (const cp of cps || []) {
    const p = (cp as any).players;
    console.log(`- cp_id=${cp.id}, source_id=${p.source_player_id}, name=${p.name}`);
  }
}

main().catch(console.error);
