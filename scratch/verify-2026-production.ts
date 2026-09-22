import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function verify() {
  console.log("=== 1. VERIFYING UZBEKISTAN SUPERLIGA (DAXLSIZLIK) ===");
  const { data: uzbComp } = await db.from("competitions").select("id").eq("code", "UZB").single();
  const { data: uzbClubs } = await db.from("clubs").select("id, name").eq("competition_id", uzbComp?.id);
  console.log(`Uzbek clubs count: ${uzbClubs?.length} (expected 16)`);

  let totalUzbPlayers = 0;
  for (const c of uzbClubs || []) {
    const { count } = await db.from("players").select("*", { count: "exact", head: true }).eq("club_id", c.id);
    totalUzbPlayers += count || 0;
  }
  console.log(`Total Uzbek players: ${totalUzbPlayers}`);

  console.log("\n=== 2. VERIFYING EUROPEAN ELITE SQUADS 2026/27 ===");
  const { data: eliteComp } = await db.from("competitions").select("id").eq("code", "ELITE").single();
  const { data: eliteClubs } = await db.from("clubs").select("id, name").eq("competition_id", eliteComp?.id).order("name");

  let allValid = true;
  for (const c of eliteClubs || []) {
    const { data: players } = await db.from("players").select("id, short_name").eq("club_id", c.id);
    const count = players?.length || 0;
    const valid = count >= 18 && count <= 35;
    if (!valid) allValid = false;
    console.log(`${c.name.padEnd(22)}: ${count} players ${valid ? "✅" : "❌ INVALID SQUAD SIZE"}`);
  }
  console.log(`All 20 Elite clubs have valid squads (>= 18): ${allValid}`);

  console.log("\n=== 3. VERIFYING SPECIFIC STAR TRANSFERS ===");
  const checks = [
    { name: "L. Modrić", expected: "Real Madrid" },
    { name: "T. Alexander-Arnold", expected: "Liverpool" },
    { name: "Palhinha", expected: "Bayern München" },
    { name: "R. Sterling", expected: "Arsenal" },
    { name: "T. Tomiyasu", expected: "Arsenal" },
    { name: "T. Hernández", expected: "AC Milan" },
    { name: "I. Bennacer", expected: "AC Milan" },
    { name: "M. Thiaw", expected: "AC Milan" },
    { name: "M. Akanji", expected: "Manchester City" },
    { name: "F. Chiesa", expected: "Liverpool" },
    { name: "G. Raspadori", expected: "Napoli" },
    { name: "J. Gittens", expected: "Borussia Dortmund" },
  ];

  for (const check of checks) {
    const { data: p } = await db.from("players").select("short_name, clubs(name)").ilike("short_name", `%${check.name}%`).limit(1).single();
    const actual = (p?.clubs as any)?.name ?? "FREE";
    const match = actual === check.expected;
    console.log(`${check.name.padEnd(20)} -> ${actual.padEnd(20)} (expected: ${check.expected}) ${match ? "✅" : "❌"}`);
  }

  console.log("\n=== 4. VERIFYING ADMIN STATS (LEAGUES) ===");
  const { count: activeCount } = await db.from("league_instances").select("*", { count: "exact", head: true }).eq("status", "ACTIVE");
  const { count: openCount } = await db.from("league_instances").select("*", { count: "exact", head: true }).eq("status", "OPEN");
  console.log(`Active leagues in DB: ${activeCount}`);
  console.log(`Open lobbies in DB: ${openCount}`);
}

verify().catch(console.error);
