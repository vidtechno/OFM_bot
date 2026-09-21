import type { SupabaseClient } from "@supabase/supabase-js";

export interface SquadPlayer {
  id: string;
  clubPlayerId: string;
  shortName: string;
  age: number;
  primaryPosition: string;
  secondaryPosition: string | null;
  overall: number;
  fitness: number;
  form: number;
  morale: number;
}

function one<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] as T : value;
}

export class SquadRepository {
  constructor(private readonly database: SupabaseClient) {}

  async listOwnedClubSquad(userId: string, leagueClubId: string): Promise<SquadPlayer[]> {
    const { data, error } = await this.database
      .from("club_players")
      .select("id, players!inner(id, short_name, age, primary_position, secondary_position, fitness, form, morale, player_attributes!inner(overall)), league_clubs!inner(manager_user_id)")
      .eq("league_club_id", leagueClubId)
      .eq("league_clubs.manager_user_id", userId);
    if (error) throw new Error(`Tarkibni olishda xato: ${error.message}`);

    return (data ?? []).map((row: any) => {
      const player = one<any>(row.players);
      const attributes = one<any>(player.player_attributes);
      return {
        id: player.id,
        clubPlayerId: row.id,
        shortName: player.short_name,
        age: player.age,
        primaryPosition: player.primary_position,
        secondaryPosition: player.secondary_position,
        overall: attributes.overall,
        fitness: player.fitness,
        form: player.form,
        morale: player.morale,
      };
    }).sort((a: SquadPlayer, b: SquadPlayer) => b.overall - a.overall || a.shortName.localeCompare(b.shortName));
  }
}
