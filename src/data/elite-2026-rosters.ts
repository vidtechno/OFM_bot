import fs from "node:fs";
import path from "node:path";

/**
 * Authoritative 2026/27 European Elite Clubs Roster Definitions (20 Clubs).
 * Loaded directly from ofm_elite_2026_27_full_squads.json.
 * Snapshot Date: 2026-09-23.
 */

export interface SquadPlayerJson {
  id: string;
  name: string;
  primary_position: string;
  secondary_positions: string[];
  age: number;
  overall: number;
  potential: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  game_value_eur: number;
}

export interface ClubSquadJson {
  code: string;
  name: string;
  country: string;
  starting_transfer_budget_eur: number;
  source_url: string;
  players: SquadPlayerJson[];
}

export interface EliteSquadsJsonFile {
  meta: {
    snapshot_date: string;
    competition: string;
    season: string;
    rating_edition: string;
    primary_source: string;
    validation_sources: string[];
    value_semantics: string;
    nationality_policy: string;
    player_fields: string[];
  };
  clubs: ClubSquadJson[];
}

export const CLUB_CODE_TO_DB_NAME: Record<string, string> = {
  RMA: "Real Madrid",
  FCB: "Barcelona",
  ATM: "Atlético Madrid",
  MCI: "Manchester City",
  LIV: "Liverpool",
  ARS: "Arsenal",
  MUN: "Manchester United",
  CHE: "Chelsea",
  TOT: "Tottenham Hotspur",
  NEW: "Newcastle United",
  BAY: "Bayern München",
  BVB: "Borussia Dortmund",
  B04: "Bayer Leverkusen",
  PSG: "Paris Saint-Germain",
  INT: "Inter",
  MIL: "AC Milan",
  JUV: "Juventus",
  NAP: "Napoli",
  SLB: "Benfica",
  SCP: "Sporting CP",
};

export interface ClubRosterDef {
  clubName: string;
  code: string;
  sourceDomain: string;
  sourceUrl: string;
  snapshotDate: string;
  players: string[];
  fullPlayers: SquadPlayerJson[];
}

// Load JSON file
const jsonPath = path.resolve(process.cwd(), "ofm_elite_2026_27_full_squads.json");
export const OFM_ELITE_JSON_DATA: EliteSquadsJsonFile = JSON.parse(
  fs.readFileSync(jsonPath, "utf-8")
);

export const ELITE_2026_ROSTERS: ClubRosterDef[] = OFM_ELITE_JSON_DATA.clubs.map((c) => {
  const dbName = CLUB_CODE_TO_DB_NAME[c.code] ?? c.name;
  let domain = "futship.com";
  try {
    domain = new URL(c.source_url).hostname;
  } catch {
    // fallback domain
  }

  return {
    clubName: dbName,
    code: c.code,
    sourceDomain: domain,
    sourceUrl: c.source_url,
    snapshotDate: OFM_ELITE_JSON_DATA.meta.snapshot_date,
    players: c.players.map((p) => p.name),
    fullPlayers: c.players,
  };
});
