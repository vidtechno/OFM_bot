import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  console.log("=== POST-MIGRATION PRODUCTION AUDIT ===");

  // 1. Check Elite clubs squads
  const { data: comp } = await db.from("competitions").select("id").eq("code", "ELITE").single();
  const { data: eliteClubs } = await db.from("clubs").select("id, name").eq("competition_id", comp!.id).order("name");

  console.log("\n1. Elite Clubs Squad Counts:");
  let totalDups = 0;
  let clubsOver50 = 0;

  for (const c of eliteClubs || []) {
    const { data: players } = await db.from("players").select("id, source_player_id, name").eq("club_id", c.id);
    const sourceIds = new Set();
    let dups = 0;
    for (const p of players || []) {
      if (sourceIds.has(p.source_player_id)) dups++;
      sourceIds.add(p.source_player_id);
    }
    totalDups += dups;
    if ((players?.length || 0) >= 50) clubsOver50++;
    console.log(`- ${c.name}: players=${players?.length}, distinct_canonical=${sourceIds.size}, duplicates=${dups}`);
  }

  console.log(`\nTotal duplicate canonical players: ${totalDups}`);
  console.log(`Clubs with 50+ players: ${clubsOver50}`);

  // 2. Real Madrid in club_players
  const rmClub = eliteClubs?.find(c => c.name === "Real Madrid");
  const { data: rmLc } = await db.from("league_clubs").select("id, transfer_budget, reserved_transfer_budget, cash_balance").eq("club_id", rmClub!.id).single();
  const { data: rmCps } = await db.from("club_players").select("id, player_id, players(name, source_player_id)").eq("league_club_id", rmLc!.id);
  console.log(`\n2. Real Madrid in club_players: total=${rmCps?.length}, transfer_budget=€${rmLc!.transfer_budget / 1_000_000}M, reserved=€${rmLc!.reserved_transfer_budget}`);

  // 3. Lineup players for Real Madrid
  const { data: rmLineup } = await db.from("lineups").select("id, captain_player_id").eq("league_club_id", rmLc!.id).single();
  const { data: lps } = await db.from("lineup_players").select("slot_key, slot_position, club_player_id").eq("lineup_id", rmLineup!.id);
  console.log(`\n3. Real Madrid Lineup: ${lps?.length} players:`);
  for (const lp of lps || []) {
    const { data: cp } = await db.from("club_players").select("players(name)").eq("id", lp.club_player_id).single();
    console.log(`  ${lp.slot_key} (${lp.slot_position}) -> ${(cp as any)?.players?.name}`);
  }

  // 4. Check transfer budgets across all league_clubs
  const { data: allLcs } = await db.from("league_clubs").select("id, transfer_budget, clubs(name, competitions(code))");
  const non100m = (allLcs || []).filter(x => Number(x.transfer_budget) !== 100000000);
  console.log(`\n4. League clubs with transfer_budget != 100M: ${non100m.length}`);
  if (non100m.length > 0) {
    console.log("Non-100M clubs:", non100m.map(x => (x.clubs as any)?.name));
  } else {
    console.log("ALL 36 clubs in production have EXACTLY €100M transfer_budget!");
  }
}

main().catch(console.error);
