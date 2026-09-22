import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const { data: samplePlayer } = await db.from("players").select("*").limit(1).single();
  console.log("Sample player columns:", Object.keys(samplePlayer || {}));
  console.log("Sample player:", samplePlayer);

  const { data: eliteComp } = await db.from("competitions").select("id, code, name").eq("code", "ELITE").single();
  const { data: clubs } = await db.from("clubs").select("id, name, code").eq("competition_id", eliteComp!.id);
  console.log(`Elite clubs (${clubs?.length}):`);

  for (const c of clubs || []) {
    const { data: players, count: pCount } = await db.from("players").select("id, name, short_name, club_id", { count: "exact" }).eq("club_id", c.id);
    const byName = new Map<string, any[]>();
    for (const p of players || []) {
      const nl = byName.get(p.name) || [];
      nl.push(p);
      byName.set(p.name, nl);
    }
    const dupName = [...byName.entries()].filter(([_, l]) => l.length > 1);
    console.log(`Club ${c.name}: total_players=${pCount}, distinct_names=${byName.size}, dup_names_count=${dupName.length}`);
  }

  // Check Real Madrid
  const rmClub = clubs?.find(c => c.name === "Real Madrid");
  if (rmClub) {
    const { data: rmPlayers } = await db.from("players").select("id, name, short_name, club_id").eq("club_id", rmClub.id);
    console.log(`\nReal Madrid in 'players' table: total=${rmPlayers?.length}`);
    const byName = new Map<string, any[]>();
    for (const p of rmPlayers || []) {
      const nl = byName.get(p.name) || [];
      nl.push(p);
      byName.set(p.name, nl);
    }
    for (const [name, list] of byName.entries()) {
      if (list.length > 1) {
        console.log(`  DUPE in players: ${name} (x${list.length}): ids=${list.map(x => x.id).join(", ")}`);
      }
    }

    // Now check in club_players for Real Madrid in league_clubs
    const { data: lcs } = await db.from("league_clubs").select("id, league_instance_id, club_id, league_instances(instance_number, status)").eq("club_id", rmClub.id);
    for (const lc of lcs || []) {
      const { data: cps } = await db.from("club_players").select("id, player_id, players(id, name)").eq("league_club_id", lc.id);
      console.log(`\nRM in instance ${lc.league_instance_id} (${(lc.league_instances as any)?.status}): club_players count=${cps?.length}`);
      const cpByName = new Map<string, any[]>();
      for (const cp of cps || []) {
        const p = (cp as any).players;
        const name = p?.name ?? "Unknown";
        const l = cpByName.get(name) || [];
        l.push(cp);
        cpByName.set(name, l);
      }
      for (const [name, list] of cpByName.entries()) {
        if (list.length > 1) {
          console.log(`  DUPE in club_players: ${name} (x${list.length}): cp_ids=${list.map(x => x.id).join(", ")}`);
        }
      }
    }
  }
}

main().catch(console.error);
