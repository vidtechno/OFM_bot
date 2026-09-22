import type { SupabaseClient } from "@supabase/supabase-js";

const first = <T>(value: T | T[]): T => (Array.isArray(value) ? value[0] as T : value);

const GK_POSITIONS = new Set(["GK"]);
const DEF_POSITIONS = new Set(["CB", "LB", "RB", "RWB", "LWB"]);
const MID_POSITIONS = new Set(["CM", "CDM", "CAM", "LM", "RM"]);
const ATT_POSITIONS = new Set(["ST", "CF", "LW", "RW"]);

export interface PlayerOvrRecord {
  id: string;
  position: string;
  overall: number;
}

/**
 * Calculates the dynamic Team OVR of a club.
 * - If Starting XI has 11 valid players in lineup_players, calculates the exact average of those 11 players.
 * - If Starting XI has < 11 players (e.g. AI club, or newly claimed human club before lineup is customized),
 *   it deterministically selects the best 11 starting players from the squad (1 GK, 4 DEF, 3 MID, 3 ATT)
 *   and calculates their average OVR.
 * - Never averages all 30 squad players; strictly reflects on-pitch starting team strength.
 */
export async function calculateTeamOvr(database: SupabaseClient, leagueClubId: string): Promise<number> {
  // 1. Check active lineup_players
  const { data: lpData } = await database
    .from("lineup_players")
    .select("club_player_id, club_players!inner(players!inner(player_attributes!inner(overall))), lineups!inner(league_club_id)")
    .eq("lineups.league_club_id", leagueClubId);

  if (lpData && lpData.length === 11) {
    const ratings = lpData.map((row: any) => {
      const cp = first<any>(row.club_players);
      const p = first<any>(cp.players);
      const attr = first<any>(p.player_attributes);
      return Number(attr?.overall ?? 75);
    });
    const avg = ratings.reduce((sum, r) => sum + r, 0) / 11;
    return Math.round(avg);
  }

  // 2. Fallback: Select best valid XI from club_players
  const { data: squadData } = await database
    .from("club_players")
    .select("id, players!inner(primary_position, player_attributes!inner(overall))")
    .eq("league_club_id", leagueClubId);

  if (!squadData || squadData.length === 0) {
    return 75;
  }

  const players: PlayerOvrRecord[] = squadData.map((row: any) => {
    const p = first<any>(row.players);
    const attr = first<any>(p.player_attributes);
    return {
      id: row.id,
      position: p.primary_position ?? "CM",
      overall: Number(attr?.overall ?? 70),
    };
  });

  return selectBestStartingOvr(players);
}

/**
 * Pure function to deterministically select the best 11 starting players from a squad
 * and return their rounded average OVR.
 */
export function selectBestStartingOvr(players: PlayerOvrRecord[]): number {
  if (players.length === 0) return 75;
  if (players.length <= 11) {
    const avg = players.reduce((sum, p) => sum + p.overall, 0) / players.length;
    return Math.round(avg);
  }

  const gks = players.filter((p) => GK_POSITIONS.has(p.position)).sort((a, b) => b.overall - a.overall);
  const defs = players.filter((p) => DEF_POSITIONS.has(p.position)).sort((a, b) => b.overall - a.overall);
  const mids = players.filter((p) => MID_POSITIONS.has(p.position)).sort((a, b) => b.overall - a.overall);
  const atts = players.filter((p) => ATT_POSITIONS.has(p.position)).sort((a, b) => b.overall - a.overall);

  const picked = new Set<string>();
  const starting11: PlayerOvrRecord[] = [];

  const pick = (list: PlayerOvrRecord[], count: number) => {
    let chosen = 0;
    for (const player of list) {
      if (chosen >= count) break;
      if (!picked.has(player.id)) {
        picked.add(player.id);
        starting11.push(player);
        chosen++;
      }
    }
  };

  // Standard 4-3-3 formation targets: 1 GK, 4 DEF, 3 MID, 3 ATT
  pick(gks, 1);
  pick(defs, 4);
  pick(mids, 3);
  pick(atts, 3);

  // If any position was short, fill up to 11 with highest remaining OVR players
  if (starting11.length < 11) {
    const remaining = players
      .filter((p) => !picked.has(p.id))
      .sort((a, b) => b.overall - a.overall);
    pick(remaining, 11 - starting11.length);
  }

  const avg = starting11.reduce((sum, p) => sum + p.overall, 0) / starting11.length;
  return Math.round(avg);
}
