import { createClient } from "@supabase/supabase-js";
import { Fc26Provider } from "./providers/fc26.provider.js";
import * as dotenv from "dotenv";
import { ELITE_CSV_CLUB_MAP } from "./import-elite-players.js";

dotenv.config();

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key);

const EXCLUDED_NAMES = new Set([
  "Lionel Messi", "Cristiano Ronaldo", "L. Messi", "C. Ronaldo", "Messi", "Ronaldo"
]);

export async function seedGlobalMarket(targetInstanceId?: string): Promise<number> {
  process.stdout.write("Fetching FC26 CSV for Global Market pools...\n");
  const csvUrl = "https://raw.githubusercontent.com/ismailoksuz/EAFC26-DataHub/main/data/players.csv";
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
  const text = await res.text();
  const provider = new Fc26Provider();
  const allPlayers = provider.load(text);

  const eliteClubNamesInCsv = new Set(Object.keys(ELITE_CSV_CLUB_MAP));

  // 1. Get or create external clubs
  const { data: existingClubs } = await db.from("clubs").select("id, name");
  const clubMap = new Map((existingClubs ?? []).map((c) => [c.name, c.id]));

  const { data: source } = await db.from("data_sources").select("id").eq("code", provider.code).maybeSingle();
  let sourceId = source?.id;
  if (!sourceId) {
    const { data: newSource, error } = await db.from("data_sources").insert({
      code: provider.code,
      name: "EA Sports FC 26 SoFIFA DataHub",
    }).select("id").single();
    if (error) throw error;
    sourceId = newSource.id;
  }

  // 2. Fetch league instances to seed
  let query = db.from("league_instances").select("id, status, competitions!inner(id, code)");
  if (targetInstanceId) {
    query = query.eq("id", targetInstanceId);
  } else {
    query = query.in("status", ["OPEN", "ACTIVE"]);
  }

  const { data: instances, error: instErr } = await query;
  if (instErr) throw instErr;
  if (!instances || instances.length === 0) {
    process.stdout.write("No active or open league instances found to seed.\n");
    return 0;
  }

  // 3. Prepare pools:
  // Pool A (Elite Global Market): External players NOT in 20 Elite clubs, OVR >= 82, no Messi/Ronaldo
  const eliteCandidates = allPlayers.filter((p) =>
    !eliteClubNamesInCsv.has(p.clubName) &&
    !EXCLUDED_NAMES.has(p.name) &&
    !EXCLUDED_NAMES.has(p.shortName) &&
    p.overall >= 82
  ).sort((a, b) => b.overall - a.overall);

  // Pool B (Uzbek Global Market): External or rotation players with OVR between 75 and 80 (CAPPED at 80!)
  const uzbekCandidates = allPlayers.filter((p) =>
    !EXCLUDED_NAMES.has(p.name) &&
    !EXCLUDED_NAMES.has(p.shortName) &&
    p.overall >= 75 &&
    p.overall <= 80
  ).sort((a, b) => b.overall - a.overall);

  // Select balanced 40 players for Elite (10 GK, 10 DEF, 10 MID, 10 ATT)
  const elitePool = selectBalancedPool(eliteCandidates, 10, 10, 10, 10);
  // Select balanced 40 players for Uzbek with diverse rating spread between 75 and 80
  const uzbekPool = selectSpreadPool(uzbekCandidates, 10, 10, 10, 10);

  console.log(`Prepared pools: Elite pool=${elitePool.length}, Uzbek pool=${uzbekPool.length}`);

  // Ensure all pool players are in DB
  const allPoolPlayers = [...elitePool, ...uzbekPool];
  for (const p of allPoolPlayers) {
    if (!clubMap.has(p.clubName)) {
      const code = p.clubName.replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase();
      const { data: newClub, error } = await db.from("clubs").insert({
        name: p.clubName,
        code,
        city: p.clubName,
        is_external: true,
      }).select("id").single();
      if (!error && newClub) clubMap.set(p.clubName, newClub.id);
    }

    const clubId = clubMap.get(p.clubName);
    const { data: savedPlayer } = await db.from("players").upsert({
      data_source_id: sourceId,
      source_player_id: `EXT_${p.sourcePlayerId}`,
      club_id: clubId,
      name: p.name,
      short_name: p.shortName,
      age: p.age,
      nationality: p.nationality,
      primary_position: p.positions[0]!,
      secondary_position: p.positions[1] ?? null,
      market_value: p.marketValue,
    }, { onConflict: "data_source_id,source_player_id" }).select("id").single();

    if (savedPlayer) {
      (p as any).dbId = savedPlayer.id;

      await db.from("player_attributes").upsert({
        player_id: savedPlayer.id,
        overall: p.overall,
        pace: p.pace ?? p.overall,
        shooting: p.shooting ?? p.overall,
        passing: p.passing ?? p.overall,
        dribbling: p.dribbling ?? p.overall,
        defending: p.defending ?? p.overall,
        physical: p.physical ?? p.overall,
      }, { onConflict: "player_id" });

      const posRows = p.positions.map((pos: string, idx: number) => ({
        player_id: savedPlayer.id,
        position: pos,
        priority: idx + 1,
      }));
      await db.from("player_positions").upsert(posRows, { onConflict: "player_id,position" });
    }
  }

  // 4. Seed listings per instance
  let totalListings = 0;
  const availableUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  for (const inst of instances) {
    const comp = (inst as any).competitions;
    const isUzbek = comp.code === "UZB";
    const pool = isUzbek ? uzbekPool : elitePool;

    for (const p of pool) {
      const playerId = (p as any).dbId;
      if (!playerId) continue;

      // Price calculation
      let askingPrice: number;
      if (isUzbek) {
        // Balanced asking price calibrated for €7M Uzbek clubs (€2.2M to €5.4M)
        // 75 OVR: €2.2M, 76: €2.8M, 77: €3.5M, 78: €4.1M, 79: €4.8M, 80: €5.4M
        askingPrice = Math.round((1_500_000 + (p.overall - 74) * 650_000) / 100_000) * 100_000;
      } else {
        // Elite clubs standard price (1.15x market value, rounded to 100k)
        askingPrice = Math.max(1_000_000, Math.round((p.marketValue * 1.15) / 100_000) * 100_000);
      }

      const { error: listErr } = await db.from("global_market_listings").upsert({
        league_instance_id: inst.id,
        player_id: playerId,
        seller_name: p.clubName,
        asking_price: askingPrice,
        demand_multiplier: 1.0,
        rarity_multiplier: p.overall >= 86 ? 1.3 : 1.0,
        status: "ACTIVE",
        available_until: availableUntil,
      }, { onConflict: "league_instance_id,player_id" });

      if (!listErr) {
        totalListings++;
      }
    }
    console.log(`Seeded ${pool.length} global listings for instance ${inst.id} (${comp.code})`);
  }

  process.stdout.write(`Successfully seeded ${totalListings} total listings across ${instances.length} instances.\n`);
  return totalListings;
}

function selectBalancedPool(candidates: any[], gkCount: number, defCount: number, midCount: number, attCount: number): any[] {
  const gks = candidates.filter((p) => p.positions[0] === "GK").slice(0, gkCount);
  const defs = candidates.filter((p) => ["CB", "LB", "RB", "LWB", "RWB"].includes(p.positions[0])).slice(0, defCount);
  const mids = candidates.filter((p) => ["CM", "CDM", "CAM", "LM", "RM"].includes(p.positions[0])).slice(0, midCount);
  const atts = candidates.filter((p) => ["ST", "CF", "LW", "RW"].includes(p.positions[0])).slice(0, attCount);
  return [...gks, ...defs, ...mids, ...atts];
}

function selectSpreadPool(candidates: any[], gkCount: number, defCount: number, midCount: number, attCount: number): any[] {
  const pickSpread = (posFilter: (p: any) => boolean, count: number) => {
    const list = candidates.filter(posFilter);
    const selected: any[] = [];
    const ratings = [80, 79, 78, 77, 76, 75];
    let ratingIdx = 0;
    while (selected.length < count && list.length > 0) {
      const targetRating = ratings[ratingIdx % ratings.length];
      const matchIdx = list.findIndex((p) => p.overall === targetRating);
      if (matchIdx !== -1) {
        selected.push(list.splice(matchIdx, 1)[0]);
      } else {
        selected.push(list.shift()!);
      }
      ratingIdx++;
    }
    return selected;
  };

  const gks = pickSpread((p) => p.positions[0] === "GK", gkCount);
  const defs = pickSpread((p) => ["CB", "LB", "RB", "LWB", "RWB"].includes(p.positions[0]), defCount);
  const mids = pickSpread((p) => ["CM", "CDM", "CAM", "LM", "RM"].includes(p.positions[0]), midCount);
  const atts = pickSpread((p) => ["ST", "CF", "LW", "RW"].includes(p.positions[0]), attCount);
  return [...gks, ...defs, ...mids, ...atts];
}

if (process.argv[1]?.endsWith("seed-global-market.ts")) {
  seedGlobalMarket().catch((err) => {
    process.stderr.write(JSON.stringify(err, null, 2) + "\n");
    process.exit(1);
  });
}
