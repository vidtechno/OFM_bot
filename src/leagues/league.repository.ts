import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvailableClub, ClaimResult, CompetitionSummary, LeagueSummary, ManagedClub } from "./types.js";

export interface PrivateLeague { leagueId:string; inviteCode:string; }
export interface OpenLobbySummary {
  leagueId: string;
  competitionCode: string;
  competitionName: string;
  instanceNumber: number;
  humanCount: number;
  maxClubs: number;
  registrationClosesAt: string | null;
  status: string;
}

type Relation<T> = T | T[];
function one<T>(value: Relation<T>): T {
  return Array.isArray(value) ? value[0] as T : value;
}

let globalCompetitionsCache: { data: CompetitionSummary[]; expiresAt: number } | null = null;

export class LeagueRepository {
  constructor(private readonly database: SupabaseClient) {}

  async listCompetitions(forceRefresh = false): Promise<CompetitionSummary[]> {
    if (!forceRefresh && globalCompetitionsCache && Date.now() < globalCompetitionsCache.expiresAt) {
      return globalCompetitionsCache.data;
    }
    const { data, error } = await this.database.from("competitions").select("id, code, name").eq("is_active", true).order("name");
    if (error) throw new Error(`Competitionlarni olishda xato: ${error.message}`);
    const list = data as CompetitionSummary[];
    globalCompetitionsCache = { data: list, expiresAt: Date.now() + 60_000 };
    return list;
  }

  async listOpenLobbies(): Promise<OpenLobbySummary[]> {
    try { await this.database.rpc("ensure_open_lobby_available"); } catch {}
    try { await this.database.rpc("activate_due_open_leagues"); } catch {}

    const { data, error } = await this.database
      .from("league_instances")
      .select("id, instance_number, status, registration_closes_at, competitions!inner(code, name, club_limit), league_clubs(manager_type)")
      .eq("access_mode", "GLOBAL")
      .in("status", ["OPEN", "ACTIVE"])
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Lobbylarni olishda xato: ${error.message}`);

    const result: OpenLobbySummary[] = [];
    const seenComp = new Set<string>();

    for (const row of (data ?? [])) {
      const comp = one<any>(row.competitions);
      if (seenComp.has(comp.code)) continue;

      const humanCount = (row.league_clubs ?? []).filter((c: any) => c.manager_type === "HUMAN").length;
      if (row.status === "OPEN" || humanCount < comp.club_limit) {
        seenComp.add(comp.code);
        result.push({
          leagueId: row.id,
          competitionCode: comp.code,
          competitionName: comp.name,
          instanceNumber: row.instance_number,
          humanCount,
          maxClubs: comp.club_limit,
          registrationClosesAt: row.registration_closes_at,
          status: row.status,
        });
      }
    }

    return result.sort((a, b) => a.competitionName.localeCompare(b.competitionName));
  }

  async listJoinableLeagues(competitionId: string): Promise<LeagueSummary[]> {
    const { data, error } = await this.database
      .from("league_instances")
      .select("id, instance_number, competitions!inner(name), league_clubs(manager_type)")
      .eq("competition_id", competitionId)
      .in("status", ["ACTIVE", "OPEN"])
      .eq("access_mode", "GLOBAL")
      .or(`registration_closes_at.is.null,registration_closes_at.gt.${new Date().toISOString()}`)
      .order("instance_number");
    if (error) throw new Error(`Ligalarni olishda xato: ${error.message}`);

    return (data ?? []).map((row: any) => ({
      id: row.id,
      name: `${one(row.competitions).name} #${String(row.instance_number).padStart(4, "0")}`,
      availableClubs: row.league_clubs.filter((club: { manager_type: string }) => club.manager_type === "AI").length,
    })).filter((league: LeagueSummary) => league.availableClubs > 0);
  }

  async listAvailableClubs(leagueId: string): Promise<AvailableClub[]> {
    const { data, error } = await this.database
      .from("league_clubs")
      .select("id, clubs!inner(name, code)")
      .eq("league_instance_id", leagueId)
      .eq("manager_type", "AI")
      .order("club_id");
    if (error) throw new Error(`Bo‘sh klublarni olishda xato: ${error.message}`);

    return (data ?? []).map((row: any) => ({
      leagueClubId: row.id,
      clubName: one(row.clubs).name,
      clubCode: one(row.clubs).code,
    })).sort((a: AvailableClub, b: AvailableClub) => a.clubName.localeCompare(b.clubName));
  }

  async getAvailableClub(leagueClubId: string): Promise<AvailableClub | null> {
    const { data, error } = await this.database
      .from("league_clubs")
      .select("id, clubs!inner(name, code)")
      .eq("id", leagueClubId)
      .eq("manager_type", "AI")
      .maybeSingle();
    if (error) throw new Error(`Klubni olishda xato: ${error.message}`);
    if (!data) return null;
    const club: any = one((data as any).clubs);
    return { leagueClubId: data.id, clubName: club.name, clubCode: club.code };
  }

  async claimClub(userId: string, leagueClubId: string): Promise<ClaimResult> {
    const { data, error } = await this.database.rpc("claim_league_club", { p_user_id: userId, p_league_club_id: leagueClubId });
    if (error) throw new Error(error.message);
    const result = data?.[0];
    if (!result) throw new Error("CLAIM_RESULT_MISSING");
    return { leagueClubId: result.league_club_id, clubName: result.club_name, leagueName: result.league_name };
  }

  async listManagedClubs(userId: string): Promise<ManagedClub[]> {
    const { data, error } = await this.database
      .from("league_clubs")
      .select("id, points, cash_balance, clubs!inner(name, starting_budget), league_instances!inner(instance_number, competitions!inner(name))")
      .eq("manager_user_id", userId)
      .order("created_at");
    if (error) throw new Error(`Manager klublarini olishda xato: ${error.message}`);

    return (data ?? []).map((row: any) => {
      const club = one<any>(row.clubs);
      const league = one<any>(row.league_instances);
      const competition = one<any>(league.competitions);
      return {
        leagueClubId: row.id,
        clubName: club.name,
        competitionName: competition.name,
        leagueName: `${competition.name} #${String(league.instance_number).padStart(4, "0")}`,
        position: 1,
        points: row.points,
        budget: Number(row.cash_balance ?? club.starting_budget),
      };
    });
  }

  async releaseScheduledGlobalLeagues(now=new Date()):Promise<number>{
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tashkent",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(now).reduce<Record<string,string>>((result,part)=>{result[part.type]=part.value;return result;},{});
    const hour=Number(parts.hour);if(hour!==7&&hour!==19)return 0;
    const runKey=`${parts.year}-${parts.month}-${parts.day}-${String(hour).padStart(2,"0")}`;
    const startAt=new Date(`${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2,"0")}:00:00+05:00`);
    const {data,error}=await this.database.rpc("release_global_leagues",{p_run_key:runKey,p_start_at:startAt.toISOString()});if(error)throw error;return Number(data??0);
  }

  async maintainLobbies(): Promise<{ activated: number; created: number }> {
    const [{ data: activated }, { data: created }] = await Promise.all([
      this.database.rpc("activate_due_open_leagues"),
      this.database.rpc("ensure_open_lobby_available"),
    ]);
    return {
      activated: Number(activated ?? 0),
      created: Number(created ?? 0),
    };
  }

  async createPrivateLeague(userId:string,competitionId:string):Promise<PrivateLeague>{const{data,error}=await this.database.rpc("create_private_league",{p_user_id:userId,p_competition_id:competitionId});if(error)throw new Error(error.message);const row=data?.[0];if(!row)throw new Error("PRIVATE_LEAGUE_CREATE_FAILED");return{leagueId:row.league_id,inviteCode:row.invite_code};}
  async privateLeagueByCode(code:string):Promise<PrivateLeague|null>{const{data,error}=await this.database.from("league_instances").select("id,join_code").eq("access_mode","PRIVATE").eq("join_code",code.toUpperCase()).maybeSingle();if(error)throw error;return data?{leagueId:data.id,inviteCode:data.join_code}:null;}
  async listPrivateAvailableClubs(leagueId:string):Promise<AvailableClub[]>{const{data,error}=await this.database.from("league_clubs").select("id,clubs!inner(name,code)").eq("league_instance_id",leagueId).eq("manager_type","AI").order("club_id");if(error)throw error;return(data??[]).map((row:any)=>({leagueClubId:row.id,clubName:one<any>(row.clubs).name,clubCode:one<any>(row.clubs).code})).sort((a,b)=>a.clubName.localeCompare(b.clubName));}
  async claimPrivateClub(userId:string,inviteCode:string,leagueClubId:string):Promise<ClaimResult>{const{data,error}=await this.database.rpc("claim_private_league_club",{p_user_id:userId,p_join_code:inviteCode.toUpperCase(),p_league_club_id:leagueClubId});if(error)throw new Error(error.message);const row=data?.[0];if(!row)throw new Error("PRIVATE_CLAIM_RESULT_MISSING");return{leagueClubId:row.league_club_id,clubName:row.club_name,leagueName:row.league_name};}
}
