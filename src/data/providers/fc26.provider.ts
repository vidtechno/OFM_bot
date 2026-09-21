import { parse } from "csv-parse/sync";
import { z } from "zod";
import type { ImportedPlayer, PlayerDataProvider } from "./player-provider.js";

const optionalRating = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.coerce.number().int().min(1).max(99).optional(),
);

const rowSchema = z.object({
  player_id: z.coerce.string(),
  short_name: z.string().min(1),
  long_name: z.string().min(1),
  player_positions: z.string().min(1),
  overall: z.coerce.number().int().min(1).max(99),
  value_eur: z.coerce.number().nonnegative().default(0),
  age: z.coerce.number().int().min(15).max(50),
  nationality_name: z.string().min(1),
  club_name: z.string().min(1),
  pace: optionalRating,
  shooting: optionalRating,
  passing: optionalRating,
  dribbling: optionalRating,
  defending: optionalRating,
  physic: optionalRating,
  goalkeeping_diving: optionalRating,
  goalkeeping_handling: optionalRating,
  goalkeeping_kicking: optionalRating,
  goalkeeping_positioning: optionalRating,
  goalkeeping_reflexes: optionalRating,
  goalkeeping_speed: optionalRating,
});

const positionMap: Record<string, string> = {
  LDM: "CDM", RDM: "CDM", LCM: "CM", RCM: "CM", LAM: "CAM", RAM: "CAM",
  LF: "CF", RF: "CF", LS: "ST", RS: "ST",
};

function normalizePosition(position: string): string {
  const trimmed = position.trim().toUpperCase();
  return positionMap[trimmed] ?? trimmed;
}

export class Fc26Provider implements PlayerDataProvider {
  readonly code = "FC26_SOFIFA";

  load(csv: string): ImportedPlayer[] {
    const rows = parse(csv, { columns: true, skip_empty_lines: true, bom: true }) as unknown[];
    const players: ImportedPlayer[] = [];
    for (const raw of rows) {
      const result = rowSchema.safeParse(raw);
      if (!result.success) continue;
      const row = result.data;
      const positions = [...new Set(row.player_positions.split(",").map(normalizePosition))];
      const isGoalkeeper = positions[0] === "GK";
      const fallback = row.overall;
      players.push({
        sourcePlayerId: row.player_id, clubName: row.club_name, name: row.long_name,
        shortName: row.short_name, age: row.age, nationality: row.nationality_name,
        positions, marketValue: row.value_eur, overall: row.overall,
        pace: row.pace ?? (isGoalkeeper ? row.goalkeeping_speed ?? row.goalkeeping_diving : fallback) ?? fallback,
        shooting: row.shooting ?? (isGoalkeeper ? row.goalkeeping_kicking : fallback) ?? fallback,
        passing: row.passing ?? (isGoalkeeper ? row.goalkeeping_kicking : fallback) ?? fallback,
        dribbling: row.dribbling ?? (isGoalkeeper ? row.goalkeeping_handling : fallback) ?? fallback,
        defending: row.defending ?? (isGoalkeeper ? row.goalkeeping_positioning : fallback) ?? fallback,
        physical: row.physic ?? (isGoalkeeper ? row.goalkeeping_reflexes : fallback) ?? fallback,
      });
    }
    return players;
  }
}
