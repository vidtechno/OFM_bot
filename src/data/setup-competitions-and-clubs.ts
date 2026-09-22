import { loadConfig } from "../config/env.js";
import { createDatabaseClient } from "../db/client.js";

interface ClubDefinition {
  name: string;
  aliases?: string[];
  code: string;
  city: string;
  startingBudget: number;
}

const ELITE_CLUBS: ClubDefinition[] = [
  { name: "Real Madrid", code: "RMA", city: "Madrid", startingBudget: 120_000_000 },
  { name: "Barcelona", aliases: ["FC Barcelona"], code: "BAR", city: "Barcelona", startingBudget: 90_000_000 },
  { name: "Atlético Madrid", aliases: ["Atlético de Madrid"], code: "ATM", city: "Madrid", startingBudget: 75_000_000 },
  { name: "Manchester City", code: "MCI", city: "Manchester", startingBudget: 130_000_000 },
  { name: "Liverpool", code: "LIV", city: "Liverpool", startingBudget: 100_000_000 },
  { name: "Arsenal", code: "ARS", city: "London", startingBudget: 100_000_000 },
  { name: "Manchester United", aliases: ["Manchester Utd", "Man Utd"], code: "MUN", city: "Manchester", startingBudget: 90_000_000 },
  { name: "Chelsea", code: "CHE", city: "London", startingBudget: 90_000_000 },
  { name: "Tottenham Hotspur", aliases: ["Tottenham", "Spurs"], code: "TOT", city: "London", startingBudget: 75_000_000 },
  { name: "Newcastle United", aliases: ["Newcastle Utd"], code: "NEW", city: "Newcastle", startingBudget: 75_000_000 },
  { name: "Bayern München", aliases: ["FC Bayern München", "Bayern Munich"], code: "BAY", city: "Munich", startingBudget: 110_000_000 },
  { name: "Borussia Dortmund", aliases: ["Dortmund"], code: "BVB", city: "Dortmund", startingBudget: 65_000_000 },
  { name: "Bayer Leverkusen", aliases: ["Bayer 04 Leverkusen"], code: "B04", city: "Leverkusen", startingBudget: 65_000_000 },
  { name: "Paris Saint-Germain", aliases: ["PSG"], code: "PSG", city: "Paris", startingBudget: 120_000_000 },
  { name: "Inter", aliases: ["Internazionale"], code: "INT", city: "Milan", startingBudget: 70_000_000 },
  { name: "AC Milan", aliases: ["Milan"], code: "ACM", city: "Milan", startingBudget: 65_000_000 },
  { name: "Juventus", code: "JUV", city: "Turin", startingBudget: 70_000_000 },
  { name: "Napoli", code: "NAP", city: "Naples", startingBudget: 65_000_000 },
  { name: "Benfica", aliases: ["SL Benfica"], code: "BEN", city: "Lisbon", startingBudget: 50_000_000 },
  { name: "Sporting CP", aliases: ["Sporting"], code: "SCP", city: "Lisbon", startingBudget: 50_000_000 },
];

const UZBEK_CLUBS: ClubDefinition[] = [
  { name: "Neftchi Fergana", aliases: ["Neftchi", "FK Neftchi Fergana"], code: "NEF", city: "Fergana", startingBudget: 10_000_000 },
  { name: "Pakhtakor Tashkent", aliases: ["Pakhtakor", "Pakhtakor FC"], code: "PAK", city: "Tashkent", startingBudget: 15_000_000 },
  { name: "Navbahor Namangan", aliases: ["Navbahor", "PFC Navbahor Namangan"], code: "NAV", city: "Namangan", startingBudget: 12_000_000 },
  { name: "Nasaf Qarshi", aliases: ["Nasaf", "FC Nasaf"], code: "NAS", city: "Qarshi", startingBudget: 12_000_000 },
  { name: "Dinamo Samarqand", aliases: ["Dinamo", "FC Dinamo Samarqand"], code: "DIN", city: "Samarkand", startingBudget: 5_000_000 },
  { name: "FC Andijon", aliases: ["Andijon", "FK Andijon"], code: "AND", city: "Andijon", startingBudget: 6_000_000 },
  { name: "Sogdiana Jizzakh", aliases: ["Sogdiana", "FC Sogdiana Jizzakh"], code: "SOG", city: "Jizzakh", startingBudget: 6_000_000 },
  { name: "FC OKMK Olmaliq", aliases: ["AGMK", "FC AGMK", "OKMK"], code: "AGMK", city: "Olmaliq", startingBudget: 8_000_000 },
  { name: "FC Buxoro", aliases: ["Buxoro", "FK Buxoro"], code: "BUX", city: "Bukhara", startingBudget: 4_000_000 },
  { name: "Lokomotiv Tashkent", aliases: ["Lokomotiv"], code: "LOK", city: "Tashkent", startingBudget: 5_000_000 },
  { name: "Xorazm Urganch", aliases: ["Xorazm", "Xorazm FK"], code: "XOR", city: "Urgench", startingBudget: 3_000_000 },
  { name: "FC Qizilqum", aliases: ["Qizilqum", "FC Qizilqum Zarafshon"], code: "QIZ", city: "Zarafshan", startingBudget: 4_000_000 },
  { name: "Bunyodkor Tashkent", aliases: ["Bunyodkor", "FC Bunyodkor"], code: "BUN", city: "Tashkent", startingBudget: 4_000_000 },
  { name: "FC Kokand 1912", aliases: ["Kokand 1912", "FC Kokand"], code: "KOK", city: "Kokand", startingBudget: 3_500_000 },
  { name: "Surkhon Termiz", aliases: ["Surkhon", "FC Surkhon Termez"], code: "SUR", city: "Termiz", startingBudget: 3_500_000 },
  { name: "Mash'al Mubarek", aliases: ["Mashal", "FK Mash'al Mubarek"], code: "MAS", city: "Mubarek", startingBudget: 3_000_000 },
];

export async function setupCompetitionsAndClubs(): Promise<void> {
  const database = createDatabaseClient(loadConfig());

  // 1. Get active competitions
  const { data: competitions, error: compErr } = await database
    .from("competitions")
    .select("id, code, name, club_limit")
    .eq("is_active", true);

  if (compErr) throw compErr;
  const eliteComp = competitions?.find((c) => c.code === "ELITE");
  const uzbComp = competitions?.find((c) => c.code === "UZB");

  if (!eliteComp || !uzbComp) {
    throw new Error(`Active competitions not found: ELITE=${Boolean(eliteComp)}, UZB=${Boolean(uzbComp)}`);
  }

  // 2. Fetch existing clubs
  const { data: existingClubs, error: clubsErr } = await database
    .from("clubs")
    .select("id, name, code, competition_id");

  if (clubsErr) throw clubsErr;
  const clubByLowerName = new Map<string, any>();
  for (const c of existingClubs ?? []) {
    clubByLowerName.set(c.name.toLowerCase().trim(), c);
  }

  // Set all current clubs' competition_id to null first to reassign cleanly
  await database.from("clubs").update({ competition_id: null }).neq("id", "00000000-0000-0000-0000-000000000000");

  // 3. Configure 20 Elite Clubs
  console.log(`Setting up ${ELITE_CLUBS.length} Elite Clubs...`);
  for (const def of ELITE_CLUBS) {
    let matched = clubByLowerName.get(def.name.toLowerCase().trim());
    if (!matched && def.aliases) {
      for (const alias of def.aliases) {
        matched = clubByLowerName.get(alias.toLowerCase().trim());
        if (matched) break;
      }
    }

    if (matched) {
      await database
        .from("clubs")
        .update({
          name: def.name,
          code: def.code,
          city: def.city,
          competition_id: eliteComp.id,
          starting_budget: def.startingBudget,
          is_external: false,
        })
        .eq("id", matched.id);
      console.log(`- Updated Elite Club: ${def.name} (${def.code}) -> ID: ${matched.id}`);
    } else {
      const { data: inserted, error: insertErr } = await database
        .from("clubs")
        .insert({
          name: def.name,
          code: def.code,
          city: def.city,
          competition_id: eliteComp.id,
          starting_budget: def.startingBudget,
          is_external: false,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      console.log(`- Inserted Elite Club: ${def.name} (${def.code}) -> ID: ${inserted.id}`);
    }
  }

  // 4. Configure 16 Uzbek Clubs
  console.log(`Setting up ${UZBEK_CLUBS.length} Uzbek Clubs...`);
  for (const def of UZBEK_CLUBS) {
    let matched = clubByLowerName.get(def.name.toLowerCase().trim());
    if (!matched && def.aliases) {
      for (const alias of def.aliases) {
        matched = clubByLowerName.get(alias.toLowerCase().trim());
        if (matched) break;
      }
    }

    if (matched) {
      await database
        .from("clubs")
        .update({
          name: def.name,
          code: def.code,
          city: def.city,
          competition_id: uzbComp.id,
          starting_budget: def.startingBudget,
          is_external: false,
        })
        .eq("id", matched.id);
      console.log(`- Updated Uzbek Club: ${def.name} (${def.code}) -> ID: ${matched.id}`);
    } else {
      const { data: inserted, error: insertErr } = await database
        .from("clubs")
        .insert({
          name: def.name,
          code: def.code,
          city: def.city,
          competition_id: uzbComp.id,
          starting_budget: def.startingBudget,
          is_external: false,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      console.log(`- Inserted Uzbek Club: ${def.name} (${def.code}) -> ID: ${inserted.id}`);
    }
  }

  // 5. Verification
  const { count: eliteCount } = await database
    .from("clubs")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", eliteComp.id);

  const { count: uzbCount } = await database
    .from("clubs")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", uzbComp.id);

  console.log(`Setup complete! Elite clubs count: ${eliteCount}/20, Uzbek clubs count: ${uzbCount}/16`);
}

if (process.argv[1]?.endsWith("setup-competitions-and-clubs.ts")) {
  setupCompetitionsAndClubs().catch(console.error);
}
