import { loadConfig } from "../config/env.js";
import { createDatabaseClient } from "../db/client.js";

export const SNAPSHOT_DATE = "2026-09-22";

export interface RosterMove {
  playerNamePattern: string;
  targetClubName: string | null; // null means external/unassigned
  reason: string;
}

/**
 * Verified 2026/27 Europe real club ownership moves.
 * Moves misplaced players to their real clubs or external pool.
 */
export const VERIFIED_MOVES: RosterMove[] = [
  // Bayern München
  { playerNamePattern: "H. Kane", targetClubName: "Bayern München", reason: "Current star striker at Bayern München" },
  { playerNamePattern: "J. Kimmich", targetClubName: "Bayern München", reason: "Bayern München captain/midfielder" },

  // Manchester City
  { playerNamePattern: "K. De Bruyne", targetClubName: "Manchester City", reason: "Manchester City vice-captain" },
  { playerNamePattern: "İ. Gündoğan", targetClubName: "Manchester City", reason: "Returned to Man City 2024/25+" },
  { playerNamePattern: "I. Gündoğan", targetClubName: "Manchester City", reason: "Returned to Man City 2024/25+" },

  // Paris Saint-Germain
  { playerNamePattern: "G. Donnarumma", targetClubName: "Paris Saint-Germain", reason: "PSG starting goalkeeper" },

  // Napoli
  { playerNamePattern: "K. Kvaratskhelia", targetClubName: "Napoli", reason: "Napoli winger" },
  { playerNamePattern: "S. McTominay", targetClubName: "Napoli", reason: "Napoli midfielder" },
  { playerNamePattern: "R. Lukaku", targetClubName: "Napoli", reason: "Napoli striker" },

  // AC Milan
  { playerNamePattern: "T. Reijnders", targetClubName: "AC Milan", reason: "AC Milan midfielder" },

  // Manchester United
  { playerNamePattern: "M. Rashford", targetClubName: "Manchester United", reason: "Manchester United forward" },
  { playerNamePattern: "A. Garnacho", targetClubName: "Manchester United", reason: "Manchester United winger" },
  { playerNamePattern: "R. Højlund", targetClubName: "Manchester United", reason: "Manchester United striker" },

  // Liverpool
  { playerNamePattern: "L. Díaz", targetClubName: "Liverpool", reason: "Liverpool winger" },

  // Bayer Leverkusen
  { playerNamePattern: "F. Wirtz", targetClubName: "Bayer Leverkusen", reason: "Bayer Leverkusen playmaker" },
  { playerNamePattern: "J. Frimpong", targetClubName: "Bayer Leverkusen", reason: "Bayer Leverkusen wing-back" },

  // Newcastle United
  { playerNamePattern: "A. Isak", targetClubName: "Newcastle United", reason: "Newcastle United striker" },

  // Sporting CP
  { playerNamePattern: "V. Gyökeres", targetClubName: "Sporting CP", reason: "Sporting CP star striker" },

  // Chelsea
  { playerNamePattern: "N. Jackson", targetClubName: "Chelsea", reason: "Chelsea striker" },
  { playerNamePattern: "N. Madueke", targetClubName: "Chelsea", reason: "Chelsea winger" },
  { playerNamePattern: "C. Nkunku", targetClubName: "Chelsea", reason: "Chelsea attacker" },

  // Atlético Madrid
  { playerNamePattern: "J. Alvarez", targetClubName: "Atlético Madrid", reason: "Atlético Madrid marquee signing" },

  // 2026/27 European Elite Roster Reconciliation
  // Real Madrid
  { playerNamePattern: "L. Modrić", targetClubName: "Real Madrid", reason: "Real Madrid club captain" },
  { playerNamePattern: "T. Alexander-Arnold", targetClubName: "Liverpool", reason: "Liverpool vice-captain / right-back" },
  { playerNamePattern: "D. Huijsen", targetClubName: null, reason: "Bournemouth defender (external pool)" },
  { playerNamePattern: "Álvaro Carreras", targetClubName: "Benfica", reason: "SL Benfica left-back" },
  { playerNamePattern: "Alvaro Carreras", targetClubName: "Benfica", reason: "SL Benfica left-back" },
  { playerNamePattern: "F. Mastantuono", targetClubName: null, reason: "River Plate (external pool)" },

  // Liverpool
  { playerNamePattern: "F. Chiesa", targetClubName: "Liverpool", reason: "Liverpool winger" },

  // Manchester City
  { playerNamePattern: "M. Akanji", targetClubName: "Manchester City", reason: "Manchester City defender" },
  { playerNamePattern: "O. Marmoush", targetClubName: null, reason: "Eintracht Frankfurt striker (external pool)" },
  { playerNamePattern: "Nico González", targetClubName: null, reason: "Porto / Juventus (external pool)" },

  // Bayern München
  { playerNamePattern: "Palhinha", targetClubName: "Bayern München", reason: "Bayern München midfielder" },
  { playerNamePattern: "M. Tel", targetClubName: "Bayern München", reason: "Bayern München forward" },
  { playerNamePattern: "J. Tah", targetClubName: "Bayer Leverkusen", reason: "Bayer Leverkusen defender" },
  { playerNamePattern: "David Santos Daiber", targetClubName: null, reason: "Youth / fictitious" },
  { playerNamePattern: "J. Bärtl", targetClubName: null, reason: "Youth / fictitious" },
  { playerNamePattern: "L. Klanac", targetClubName: null, reason: "Youth / fictitious" },

  // Arsenal
  { playerNamePattern: "Kepa", targetClubName: null, reason: "Bournemouth goalkeeper (external pool)" },
  { playerNamePattern: "P. Hincapié", targetClubName: "Bayer Leverkusen", reason: "Bayer Leverkusen defender" },
  { playerNamePattern: "R. Sterling", targetClubName: "Arsenal", reason: "Arsenal winger (loan from Chelsea)" },
  { playerNamePattern: "T. Tomiyasu", targetClubName: "Arsenal", reason: "Arsenal defender" },

  // AC Milan
  { playerNamePattern: "A. Rabiot", targetClubName: null, reason: "Olympique Marseille midfielder (external pool)" },
  { playerNamePattern: "P. Estupiñán", targetClubName: null, reason: "Brighton defender (external pool)" },
  { playerNamePattern: "P. Terracciano", targetClubName: null, reason: "Fiorentina goalkeeper (external pool)" },
  { playerNamePattern: "S. Ricci", targetClubName: null, reason: "Torino midfielder (external pool)" },
  { playerNamePattern: "A. Jashari", targetClubName: null, reason: "Club Brugge midfielder (external pool)" },
  { playerNamePattern: "K. De Winter", targetClubName: null, reason: "Genoa defender (external pool)" },
  { playerNamePattern: "M. Thiaw", targetClubName: "AC Milan", reason: "AC Milan defender" },
  { playerNamePattern: "T. Hernández", targetClubName: "AC Milan", reason: "AC Milan left-back" },
  { playerNamePattern: "T. Abraham", targetClubName: "AC Milan", reason: "AC Milan striker" },
  { playerNamePattern: "I. Bennacer", targetClubName: "AC Milan", reason: "AC Milan midfielder" },
  { playerNamePattern: "N. Okafor", targetClubName: "AC Milan", reason: "AC Milan forward" },

  // Tottenham Hotspur
  { playerNamePattern: "X. Simons", targetClubName: null, reason: "RB Leipzig playmaker (external pool)" },
  { playerNamePattern: "R. Kolo Muani", targetClubName: "Paris Saint-Germain", reason: "PSG striker" },
  { playerNamePattern: "M. Kudus", targetClubName: null, reason: "West Ham United winger (external pool)" },

  // Manchester United
  { playerNamePattern: "B. Mbeumo", targetClubName: null, reason: "Brentford winger (external pool)" },
  { playerNamePattern: "Matheus Cunha", targetClubName: null, reason: "Wolves forward (external pool)" },
  { playerNamePattern: "B. Šeško", targetClubName: null, reason: "RB Leipzig striker (external pool)" },
  { playerNamePattern: "P. Dorgu", targetClubName: null, reason: "Lecce defender (external pool)" },

  // Newcastle United
  { playerNamePattern: "Y. Wissa", targetClubName: null, reason: "Brentford striker (external pool)" },
  { playerNamePattern: "A. Elanga", targetClubName: null, reason: "Nottingham Forest winger (external pool)" },
  { playerNamePattern: "N. Woltemade", targetClubName: null, reason: "Stuttgart striker (external pool)" },
  { playerNamePattern: "J. Ramsey", targetClubName: null, reason: "Aston Villa midfielder (external pool)" },
  { playerNamePattern: "A. Ramsdale", targetClubName: null, reason: "Southampton goalkeeper (external pool)" },

  // Juventus
  { playerNamePattern: "J. David", targetClubName: null, reason: "Lille striker (external pool)" },
  { playerNamePattern: "E. Zhegrova", targetClubName: null, reason: "Lille winger (external pool)" },

  // Chelsea
  { playerNamePattern: "J. Gittens", targetClubName: "Borussia Dortmund", reason: "Borussia Dortmund winger" },
  { playerNamePattern: "C. Chukwuemeka", targetClubName: "Chelsea", reason: "Chelsea midfielder" },
  { playerNamePattern: "João Pedro", targetClubName: null, reason: "Brighton forward (external pool)" },
  { playerNamePattern: "L. Delap", targetClubName: null, reason: "Ipswich Town striker (external pool)" },
  { playerNamePattern: "J. Hato", targetClubName: null, reason: "Ajax defender (external pool)" },
  { playerNamePattern: "F. Buonanotte", targetClubName: null, reason: "Leicester City winger (external pool)" },

  // Atlético Madrid
  { playerNamePattern: "G. Raspadori", targetClubName: "Napoli", reason: "Napoli forward" },
  { playerNamePattern: "Álex Baena", targetClubName: null, reason: "Villarreal playmaker (external pool)" },
  { playerNamePattern: "D. Hancko", targetClubName: null, reason: "Feyenoord defender (external pool)" },
  { playerNamePattern: "Johnny Cardoso", targetClubName: null, reason: "Real Betis midfielder (external pool)" },
  { playerNamePattern: "T. Almada", targetClubName: null, reason: "Botafogo midfielder (external pool)" },
  { playerNamePattern: "M. Ruggeri", targetClubName: null, reason: "Atalanta defender (external pool)" },
  { playerNamePattern: "Pubill", targetClubName: null, reason: "Almeria defender (external pool)" },

  // Napoli
  { playerNamePattern: "Miguel Gutiérrez", targetClubName: null, reason: "Girona left-back (external pool)" },
  { playerNamePattern: "N. Lang", targetClubName: null, reason: "PSV winger (external pool)" },
  { playerNamePattern: "V. Milinković-Savić", targetClubName: null, reason: "Torino goalkeeper (external pool)" },
  { playerNamePattern: "S. Beukema", targetClubName: null, reason: "Bologna defender (external pool)" },
  { playerNamePattern: "L. Lucca", targetClubName: null, reason: "Udinese striker (external pool)" },

  // Inter
  { playerNamePattern: "Luis Henrique", targetClubName: null, reason: "Marseille winger (external pool)" },
  { playerNamePattern: "Y. Bonny", targetClubName: null, reason: "Parma forward (external pool)" },
  { playerNamePattern: "A. Diouf", targetClubName: null, reason: "Lens midfielder (external pool)" },
  { playerNamePattern: "P. Sučić", targetClubName: null, reason: "Dinamo Zagreb midfielder (external pool)" },
  { playerNamePattern: "F. Esposito", targetClubName: null, reason: "Spezia forward loan (external pool)" },

  // Borussia Dortmund
  { playerNamePattern: "D. Svensson", targetClubName: null, reason: "Nordsjaelland defender (external pool)" },
  { playerNamePattern: "A. Anselmino", targetClubName: null, reason: "Boca / Chelsea loan (external pool)" },
  { playerNamePattern: "J. Bellingham", targetClubName: null, reason: "Sunderland midfielder (external pool)" },

  // Barcelona
  { playerNamePattern: "R. Bardghji", targetClubName: null, reason: "FC Copenhagen winger (external pool)" },

  // Players who belong to external clubs (NOT in the 20 Elite clubs):
  // Lens:
  { playerNamePattern: "A. Khusanov", targetClubName: null, reason: "RC Lens defender (external pool)" },
  // Wolves:
  { playerNamePattern: "R. Aït-Nouri", targetClubName: null, reason: "Wolverhampton Wanderers defender (external pool)" },
  // Lyon:
  { playerNamePattern: "R. Cherki", targetClubName: null, reason: "Olympique Lyonnais playmaker (external pool)" },
  // Lille:
  { playerNamePattern: "L. Chevalier", targetClubName: null, reason: "Lille goalkeeper (external pool)" },
  // Real Sociedad:
  { playerNamePattern: "Zubimendi", targetClubName: null, reason: "Real Sociedad midfielder (external pool)" },
  // Crystal Palace:
  { playerNamePattern: "E. Eze", targetClubName: null, reason: "Crystal Palace midfielder (external pool)" },
  // Eintracht Frankfurt:
  { playerNamePattern: "H. Ekitiké", targetClubName: null, reason: "Eintracht Frankfurt striker (external pool)" },
  // Bournemouth:
  { playerNamePattern: "M. Kerkez", targetClubName: null, reason: "AFC Bournemouth defender (external pool)" },
  // RB Leipzig:
  { playerNamePattern: "L. Openda", targetClubName: null, reason: "RB Leipzig striker (external pool)" },
  // Brentford:
  { playerNamePattern: "C. Nørgaard", targetClubName: null, reason: "Brentford midfielder (external pool)" },
  // Valencia:
  { playerNamePattern: "Mosquera", targetClubName: null, reason: "Valencia defender (external pool)" },
  // Fictitious / ultra-low youth:
  { playerNamePattern: "Dro", targetClubName: null, reason: "Youth player (external pool)" },
];

export async function reconcileEliteRosters(dryRun = false): Promise<{
  movedCount: number;
  unassignedCount: number;
  auditLog: Array<{ player: string; from: string; to: string | null; reason: string }>;
}> {
  const db = createDatabaseClient(loadConfig());
  const auditLog: Array<{ player: string; from: string; to: string | null; reason: string }> = [];

  const { data: clubs } = await db.from("clubs").select("id, name, competitions!inner(code)");
  const clubIdByName = new Map((clubs ?? []).map((c) => [c.name, c.id]));
  const clubNameById = new Map((clubs ?? []).map((c) => [c.id, c.name]));

  let movedCount = 0;
  let unassignedCount = 0;

  for (const move of VERIFIED_MOVES) {
    const { data: matchedPlayers } = await db
      .from("players")
      .select("id, short_name, club_id")
      .ilike("short_name", move.playerNamePattern);

    for (const player of matchedPlayers ?? []) {
      const currentClubName = player.club_id ? clubNameById.get(player.club_id) ?? "Unknown" : "External";
      const targetClubId = move.targetClubName ? clubIdByName.get(move.targetClubName) ?? null : null;

      if (player.club_id !== targetClubId) {
        auditLog.push({
          player: player.short_name,
          from: currentClubName,
          to: move.targetClubName,
          reason: move.reason,
        });

        if (!dryRun) {
          await db
            .from("players")
            .update({ club_id: targetClubId })
            .eq("id", player.id);
        }

        if (targetClubId) movedCount++;
        else unassignedCount++;
      }
    }
  }

  return { movedCount, unassignedCount, auditLog };
}
