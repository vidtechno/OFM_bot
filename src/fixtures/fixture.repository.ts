import type { SupabaseClient } from "@supabase/supabase-js";

type Relation<T> = T | T[];
const one = <T>(value: Relation<T>): T => Array.isArray(value) ? value[0] as T : value;

export interface ClubFixture {
  id: string;
  round: number;
  scheduledAt: string;
  status: "SCHEDULED" | "PLAYED" | "POSTPONED" | "CANCELLED";
  isHome: boolean;
  homeClub: string;
  awayClub: string;
}

export class FixtureRepository {
  constructor(private readonly database: SupabaseClient) {}

  private async assertOwnership(userId: string, leagueClubId: string): Promise<void> {
    const { data, error } = await this.database.from("league_clubs").select("id").eq("id", leagueClubId).eq("manager_user_id", userId).maybeSingle();
    if (error) throw new Error(`Klubni tekshirishda xato: ${error.message}`);
    if (!data) throw new Error("CLUB_NOT_OWNED");
  }

  async listUpcoming(userId: string, leagueClubId: string, limit = 10, skipOwnershipCheck = false): Promise<ClubFixture[]> {
    if (!skipOwnershipCheck) {
      await this.assertOwnership(userId, leagueClubId);
    }
    const { data, error } = await this.database.from("fixtures")
      .select("id,round_number,scheduled_at,status,home_club_id,home:league_clubs!fixtures_home_club_id_fkey(clubs!inner(name)),away:league_clubs!fixtures_away_club_id_fkey(clubs!inner(name))")
      .or(`home_club_id.eq.${leagueClubId},away_club_id.eq.${leagueClubId}`)
      .in("status", ["SCHEDULED", "POSTPONED"])
      .order("scheduled_at", { ascending: true }).limit(limit);
    if (error) throw new Error(`Fixturelarni olishda xato: ${error.message}`);
    return (data ?? []).map((row: any) => ({
      id: row.id, round: row.round_number, scheduledAt: row.scheduled_at, status: row.status,
      isHome: row.home_club_id === leagueClubId,
      homeClub: one<any>(one<any>(row.home).clubs).name,
      awayClub: one<any>(one<any>(row.away).clubs).name,
    }));
  }
}
