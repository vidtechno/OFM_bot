import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const EA_FC27_SOURCE = "f5b2dbc7-0eeb-47c5-b338-32f1c61a5413";
  const SOFIFA_SOURCE = "f54021ee-1775-4a0f-b842-a3614bed9bb1";

  // Check how many players belong to EA_FC27_SOURCE for Elite clubs
  const { data: eliteComp } = await db.from("competitions").select("id").eq("code", "ELITE").single();
  const { data: eliteClubs } = await db.from("clubs").select("id, name").eq("competition_id", eliteComp!.id);
  const eliteClubIds = eliteClubs!.map(c => c.id);

  const { data: legacyPlayers } = await db.from("players")
    .select("id, club_id, name, source_player_id")
    .in("club_id", eliteClubIds)
    .eq("data_source_id", EA_FC27_SOURCE);

  console.log(`Legacy players for Elite clubs to be removed: ${legacyPlayers?.length}`);

  const legacyPlayerIds = (legacyPlayers || []).map(p => p.id);
  const { data: legacyCps } = await db.from("club_players")
    .select("id, league_club_id, player_id")
    .in("player_id", legacyPlayerIds);

  console.log(`Legacy club_players for Elite clubs to be removed: ${legacyCps?.length}`);

  // Check remaining SOFIFA players for each Elite club
  console.log("\nPredicted squad sizes after removing legacy rows:");
  for (const c of eliteClubs || []) {
    const { count } = await db.from("players")
      .select("id", { count: "exact", head: true })
      .eq("club_id", c.id)
      .eq("data_source_id", SOFIFA_SOURCE);
    console.log(`- ${c.name}: ${count} players`);
  }
}

main().catch(console.error);
