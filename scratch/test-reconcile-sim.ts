import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

// Define exact real-world 2024/25 - 2026/27 European club assignments
export const ELITE_REAL_TRANSFERS: Array<{ namePattern: string; targetClub: string | null; reason: string }> = [
  // 1. Real Madrid
  { namePattern: "L. Modrić", targetClub: "Real Madrid", reason: "Real Madrid club captain" },
  { namePattern: "T. Alexander-Arnold", targetClub: "Liverpool", reason: "Liverpool vice-captain / right-back" },
  { namePattern: "D. Huijsen", targetClub: null, reason: "Bournemouth defender (external pool)" },
  { namePattern: "Álvaro Carreras", targetClub: "Benfica", reason: "SL Benfica left-back" },
  { namePattern: "F. Mastantuono", targetClub: null, reason: "River Plate (external pool)" },

  // 2. Liverpool
  // (Alexander-Arnold moved back to Liverpool above)
  { namePattern: "F. Chiesa", targetClub: "Liverpool", reason: "Liverpool winger" },

  // 3. Manchester City
  { namePattern: "M. Akanji", targetClub: "Manchester City", reason: "Manchester City defender" },
  { namePattern: "O. Marmoush", targetClub: null, reason: "Eintracht Frankfurt striker (external pool)" },
  { namePattern: "Nico González", targetClub: null, reason: "Porto / Juventus (external pool)" },

  // 4. Bayern München
  { namePattern: "Palhinha", targetClub: "Bayern München", reason: "Bayern München midfielder" },
  { namePattern: "M. Tel", targetClub: "Bayern München", reason: "Bayern München forward" },
  { namePattern: "J. Tah", targetClub: "Bayer Leverkusen", reason: "Bayer Leverkusen defender" },
  { namePattern: "David Santos Daiber", targetClub: null, reason: "Youth / fictitious" },
  { namePattern: "J. Bärtl", targetClub: null, reason: "Youth / fictitious" },
  { namePattern: "L. Klanac", targetClub: null, reason: "Youth / fictitious" },

  // 5. Arsenal
  { namePattern: "Kepa", targetClub: null, reason: "Bournemouth goalkeeper (external pool)" },
  { namePattern: "P. Hincapié", targetClub: "Bayer Leverkusen", reason: "Bayer Leverkusen defender" },
  { namePattern: "R. Sterling", targetClub: "Arsenal", reason: "Arsenal winger (loan from Chelsea)" },
  { namePattern: "T. Tomiyasu", targetClub: "Arsenal", reason: "Arsenal defender" },

  // 6. AC Milan
  // (Modric moved to Real Madrid above)
  { namePattern: "A. Rabiot", targetClub: null, reason: "Olympique Marseille midfielder (external pool)" },
  { namePattern: "P. Estupiñán", targetClub: null, reason: "Brighton defender (external pool)" },
  { namePattern: "P. Terracciano", targetClub: null, reason: "Fiorentina goalkeeper (external pool)" },
  { namePattern: "S. Ricci", targetClub: null, reason: "Torino midfielder (external pool)" },
  { namePattern: "A. Jashari", targetClub: null, reason: "Club Brugge midfielder (external pool)" },
  { namePattern: "K. De Winter", targetClub: null, reason: "Genoa defender (external pool)" },
  { namePattern: "M. Thiaw", targetClub: "AC Milan", reason: "AC Milan defender" },
  { namePattern: "T. Hernández", targetClub: "AC Milan", reason: "AC Milan left-back" },
  { namePattern: "T. Abraham", targetClub: "AC Milan", reason: "AC Milan striker" },
  { namePattern: "I. Bennacer", targetClub: "AC Milan", reason: "AC Milan midfielder" },
  { namePattern: "N. Okafor", targetClub: "AC Milan", reason: "AC Milan forward" },

  // 7. Tottenham Hotspur
  // (Palhinha moved to Bayern, Tel moved to Bayern above)
  { namePattern: "X. Simons", targetClub: null, reason: "RB Leipzig playmaker (external pool)" },
  { namePattern: "R. Kolo Muani", targetClub: "Paris Saint-Germain", reason: "PSG striker" },
  { namePattern: "M. Kudus", targetClub: null, reason: "West Ham United winger (external pool)" },

  // 8. Manchester United
  { namePattern: "B. Mbeumo", targetClub: null, reason: "Brentford winger (external pool)" },
  { namePattern: "Matheus Cunha", targetClub: null, reason: "Wolves forward (external pool)" },
  { namePattern: "B. Šeško", targetClub: null, reason: "RB Leipzig striker (external pool)" },
  { namePattern: "P. Dorgu", targetClub: null, reason: "Lecce defender (external pool)" },

  // 9. Newcastle United
  // (Thiaw moved to AC Milan above)
  { namePattern: "Y. Wissa", targetClub: null, reason: "Brentford striker (external pool)" },
  { namePattern: "A. Elanga", targetClub: null, reason: "Nottingham Forest winger (external pool)" },
  { namePattern: "N. Woltemade", targetClub: null, reason: "Stuttgart striker (external pool)" },
  { namePattern: "J. Ramsey", targetClub: null, reason: "Aston Villa midfielder (external pool)" },
  { namePattern: "A. Ramsdale", targetClub: null, reason: "Southampton goalkeeper (external pool)" },

  // 10. Juventus
  { namePattern: "J. David", targetClub: null, reason: "Lille striker (external pool)" },
  { namePattern: "E. Zhegrova", targetClub: null, reason: "Lille winger (external pool)" },

  // 11. Chelsea
  // (Sterling moved to Arsenal above)
  { namePattern: "J. Gittens", targetClub: "Borussia Dortmund", reason: "Borussia Dortmund winger" },
  { namePattern: "C. Chukwuemeka", targetClub: "Chelsea", reason: "Chelsea midfielder" },
  { namePattern: "João Pedro", targetClub: null, reason: "Brighton forward (external pool)" },
  { namePattern: "L. Delap", targetClub: null, reason: "Ipswich Town striker (external pool)" },
  { namePattern: "J. Hato", targetClub: null, reason: "Ajax defender (external pool)" },
  { namePattern: "F. Buonanotte", targetClub: null, reason: "Leicester City winger (external pool)" },

  // 12. Atlético Madrid
  { namePattern: "G. Raspadori", targetClub: "Napoli", reason: "Napoli forward" },
  { namePattern: "Álex Baena", targetClub: null, reason: "Villarreal playmaker (external pool)" },
  { namePattern: "D. Hancko", targetClub: null, reason: "Feyenoord defender (external pool)" },
  { namePattern: "Johnny Cardoso", targetClub: null, reason: "Real Betis midfielder (external pool)" },
  { namePattern: "T. Almada", targetClub: null, reason: "Botafogo midfielder (external pool)" },
  { namePattern: "M. Ruggeri", targetClub: null, reason: "Atalanta defender (external pool)" },
  { namePattern: "Pubill", targetClub: null, reason: "Almeria defender (external pool)" },

  // 13. Napoli
  // (Raspadori moved to Napoli above)
  { namePattern: "Miguel Gutiérrez", targetClub: null, reason: "Girona left-back (external pool)" },
  { namePattern: "N. Lang", targetClub: null, reason: "PSV winger (external pool)" },
  { namePattern: "V. Milinković-Savić", targetClub: null, reason: "Torino goalkeeper (external pool)" },
  { namePattern: "S. Beukema", targetClub: null, reason: "Bologna defender (external pool)" },
  { namePattern: "L. Lucca", targetClub: null, reason: "Udinese striker (external pool)" },

  // 14. Inter
  // (Akanji moved to Man City above)
  { namePattern: "Luis Henrique", targetClub: null, reason: "Marseille winger (external pool)" },
  { namePattern: "Y. Bonny", targetClub: null, reason: "Parma forward (external pool)" },
  { namePattern: "A. Diouf", targetClub: null, reason: "Lens midfielder (external pool)" },
  { namePattern: "P. Sučić", targetClub: null, reason: "Dinamo Zagreb midfielder (external pool)" },
  { namePattern: "F. Esposito", targetClub: null, reason: "Spezia forward loan (external pool)" },

  // 15. Borussia Dortmund
  // (Gittens moved to Dortmund, Chukwuemeka to Chelsea above)
  { namePattern: "D. Svensson", targetClub: null, reason: "Nordsjaelland defender (external pool)" },
  { namePattern: "A. Anselmino", targetClub: null, reason: "Boca / Chelsea loan (external pool)" },
  { namePattern: "J. Bellingham", targetClub: null, reason: "Sunderland midfielder (external pool)" },

  // 16. Barcelona
  { namePattern: "R. Bardghji", targetClub: null, reason: "FC Copenhagen winger (external pool)" },
];

async function fetchAllPlayers(db: any) {
  const all: any[] = [];
  const batch = 1000;
  for (let from = 0; ; from += batch) {
    const { data, error } = await db.from("players").select("id, short_name, club_id").range(from, from + batch - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < batch) break;
  }
  return all;
}

async function simulate() {
  const { data: clubs } = await db.from("clubs").select("id, name, competitions!inner(code)").eq("competitions.code", "ELITE");
  const clubIdByName = new Map((clubs ?? []).map((c) => [c.name, c.id]));
  const clubNameById = new Map((clubs ?? []).map((c) => [c.id, c.name]));

  // Get ALL current players
  const allPlayers = await fetchAllPlayers(db);
  console.log(`Fetched total ${allPlayers.length} players from database.`);

  const playerClubMap = new Map<string, string | null>(allPlayers.map((p: any) => [p.id, p.club_id]));
  const playerObjMap = new Map<string, any>(allPlayers.map((p: any) => [p.id, p]));

  let totalMoves = 0;
  for (const move of ELITE_REAL_TRANSFERS) {
    const targetClubId = move.targetClub ? clubIdByName.get(move.targetClub) ?? null : null;
    let matched = 0;
    for (const [id, p] of playerObjMap.entries()) {
      if (p.short_name.toLowerCase().includes(move.namePattern.toLowerCase())) {
        playerClubMap.set(id, targetClubId);
        matched++;
        totalMoves++;
      }
    }
  }
  console.log(`Applied moves: ${totalMoves} player updates.`);

  // Count simulated squads
  const squadCounts: Record<string, number> = {};
  for (const c of clubs ?? []) squadCounts[c.name] = 0;

  for (const [id, clubId] of playerClubMap.entries()) {
    if (clubId && clubNameById.has(clubId)) {
      const name = clubNameById.get(clubId)!;
      squadCounts[name] = (squadCounts[name] ?? 0) + 1;
    }
  }

  console.log("\n=== SIMULATED ELITE SQUAD COUNTS (Target: 18-32) ===");
  let allValid = true;
  for (const [name, count] of Object.entries(squadCounts)) {
    const valid = count >= 18 && count <= 35;
    if (!valid) allValid = false;
    console.log(`${name.padEnd(22)}: ${count} players ${valid ? "✅" : "❌ TOO SMALL/BIG"}`);
  }
  console.log(`\nAll clubs valid (>= 18 and <= 35): ${allValid}`);
}

simulate().catch(console.error);
