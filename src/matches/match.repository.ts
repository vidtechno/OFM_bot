import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchSimulation, MatchTeamInput } from "./match-engine.js";

export interface DueMatch { fixtureId: string; home: MatchTeamInput; away: MatchTeamInput; }
export interface MatchResult { id: string; round: number; playedAt: string; homeClub: string; awayClub: string; homeGoals: number; awayGoals: number; }
export interface TableRow { position: number; club: string; played: number; wins: number; draws: number; losses: number; goalDifference: number; points: number; }
export interface FinanceSummary { cashBalance: number; transferBudget: number; reservedTransferBudget?: number; transactions: { kind: string; amount: number; description: string; createdAt: string }[]; }
export interface PlayerLeader { name:string; club:string; total:number; }
export interface MatchOwnerReport { telegramId:number;clubId:string;club:string;opponent:string;isHome:boolean;homeGoals:number;awayGoals:number;goals:Array<{minute:number;player:string;assist:string|null}>;possession:[number,number];shots:[number,number];onTarget:[number,number];corners:[number,number];position:number;points:number;played:number;wins:number;draws:number;losses:number;income:number;balance:number;next:{home:string;away:string;scheduledAt:string}|null;leagueName:string; }

const first = <T>(value: T | T[]): T => Array.isArray(value) ? value[0] as T : value;

export class MatchRepository {
  constructor(private readonly database: SupabaseClient) {}

  private async team(clubId: string): Promise<MatchTeamInput> {
    const [{ data: tactic, error: tacticError }, { data: lineup, error: lineupError }] = await Promise.all([
      this.database
        .from("tactics")
        .select("mentality,pressing,tempo,defensive_line,width,passing_style,attack_focus,tackling")
        .eq("league_club_id", clubId)
        .single(),
      this.database.from("lineups").select("lineup_players(effective_rating)").eq("league_club_id", clubId).single(),
    ]);
    if (tacticError) throw tacticError;
    if (lineupError) throw lineupError;
    let ratings = ((lineup as any).lineup_players ?? []).map((row: any) => Number(row.effective_rating));
    if (ratings.length < 11) {
      const { data, error } = await this.database.from("club_players").select("players!inner(player_attributes!inner(overall))").eq("league_club_id", clubId);
      if (error) throw error;
      ratings = (data ?? []).map((row: any) => Number(first<any>(first<any>(row.players).player_attributes).overall)).sort((a: number, b: number) => b - a).slice(0, 11);
    }
    return {
      clubId,
      strength: ratings.reduce((sum: number, rating: number) => sum + rating, 0) / Math.max(1, ratings.length),
      mentality: tactic.mentality,
      pressing: tactic.pressing,
      tempo: tactic.tempo,
      defensiveLine: tactic.defensive_line,
      width: tactic.width,
      passingStyle: tactic.passing_style,
      attackFocus: tactic.attack_focus,
      tackling: tactic.tackling,
    };
  }

  async due(limit = 20): Promise<DueMatch[]> {
    const { data, error } = await this.database.from("fixtures").select("id,home_club_id,away_club_id").eq("status", "SCHEDULED").lte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(limit);
    if (error) throw error;
    return Promise.all((data ?? []).map(async (fixture) => ({ fixtureId: fixture.id, home: await this.team(fixture.home_club_id), away: await this.team(fixture.away_club_id) })));
  }

  async complete(fixtureId: string, simulation: MatchSimulation): Promise<string> {
    const { data, error } = await this.database.rpc("complete_match", {
      p_fixture_id: fixtureId,
      p_home_goals: simulation.homeGoals,
      p_away_goals: simulation.awayGoals,
      p_stats: simulation.stats,
      p_events: simulation.events,
      p_engine_version: "v2",
    });
    if (error) throw error;
    const matchId = data as string;
    await this.recordPlayerStats(matchId);
    await this.checkSeasonCompletion(matchId);
    return matchId;
  }

  private async checkSeasonCompletion(matchId: string): Promise<void> {
    const { data: match } = await this.database
      .from("matches")
      .select("league_instance_id")
      .eq("id", matchId)
      .maybeSingle();

    if (!match?.league_instance_id) return;
    const instanceId = match.league_instance_id;

    // Check if any fixtures are left scheduled
    const { count, error: countErr } = await this.database
      .from("fixtures")
      .select("id", { count: "exact", head: true })
      .eq("league_instance_id", instanceId)
      .eq("status", "SCHEDULED");

    if (countErr || (count ?? 0) > 0) return;

    // All fixtures played! Mark league completed
    await this.database
      .from("league_instances")
      .update({ status: "COMPLETED" })
      .eq("id", instanceId)
      .neq("status", "COMPLETED");

    // Crown champion and update manager profiles
    const { data: table } = await this.database
      .from("league_clubs")
      .select("id, manager_user_id, points, goals_for, goals_against")
      .eq("league_instance_id", instanceId);

    if (!table || !table.length) return;

    const ordered = table.sort(
      (a: any, b: any) =>
        b.points - a.points ||
        (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against) ||
        b.goals_for - a.goals_for
    );

    const champion = ordered[0];
    if (champion?.manager_user_id) {
      try {
        const { error } = await this.database.rpc("award_championship", {
          p_user_id: champion.manager_user_id,
          p_league_instance_id: instanceId,
        });
        if (error) throw error;
      } catch {
        // Fallback update direct
        const { data: prof } = await this.database
          .from("manager_profiles")
          .select("titles, seasons, manager_rating")
          .eq("user_id", champion.manager_user_id)
          .maybeSingle();

        if (prof) {
          await this.database
            .from("manager_profiles")
            .update({
              titles: (prof.titles ?? 0) + 1,
              seasons: (prof.seasons ?? 0) + 1,
              manager_rating: (prof.manager_rating ?? 1500) + 100,
            })
            .eq("user_id", champion.manager_user_id);
        }
      }
    }
  }

  private async recordPlayerStats(matchId: string): Promise<void> {
    const {data:match,error:matchError}=await this.database.from("matches").select("home_club_id,away_club_id,home_goals,away_goals").eq("id",matchId).single();if(matchError)throw matchError;
    const assign=async(clubId:string,goals:number)=>{if(!goals)return;const[{data,error},{data:events,error:eventError}]=await Promise.all([this.database.from("club_players").select("players!inner(id,primary_position,player_attributes!inner(overall))").eq("league_club_id",clubId),this.database.from("match_events").select("id").eq("match_id",matchId).eq("club_id",clubId).eq("event_type","GOAL").order("minute")]);if(error)throw error;if(eventError)throw eventError;const players=(data??[]).map((row:any)=>{const player=first<any>(row.players);return{id:player.id,position:player.primary_position,overall:Number(first<any>(player.player_attributes).overall)}}).sort((a,b)=>{const weight=(p:string)=>p==="ST"?4:p==="LW"||p==="RW"||p==="CAM"?3:p==="CM"||p==="LM"||p==="RM"?2:1;return weight(b.position)*100+b.overall-(weight(a.position)*100+a.overall);});if(!players.length)return;const rows=new Map<string,{match_id:string;player_id:string;club_id:string;minutes:number;goals:number;assists:number}>();for(let index=0;index<goals;index+=1){const scorer=players[index%Math.min(3,players.length)]!,assistant=players.find(player=>player.id!==scorer.id&&["LW","RW","CAM","CM","LM","RM"].includes(player.position))??players[(index+1)%players.length]!;const scorerRow=rows.get(scorer.id)??{match_id:matchId,player_id:scorer.id,club_id:clubId,minutes:90,goals:0,assists:0};scorerRow.goals++;rows.set(scorer.id,scorerRow);if(assistant.id!==scorer.id){const assistantRow=rows.get(assistant.id)??{match_id:matchId,player_id:assistant.id,club_id:clubId,minutes:90,goals:0,assists:0};assistantRow.assists++;rows.set(assistant.id,assistantRow);}const event=events?.[index];if(event){const{error:updateError}=await this.database.from("match_events").update({player_id:scorer.id,metadata:{assist_player_id:assistant.id}}).eq("id",event.id);if(updateError)throw updateError;}}const{error:insertError}=await this.database.from("player_match_stats").upsert([...rows.values()],{onConflict:"match_id,player_id"});if(insertError)throw insertError;};await Promise.all([assign(match.home_club_id,match.home_goals),assign(match.away_club_id,match.away_goals)]);
  }

  async ownerReports(matchId:string):Promise<MatchOwnerReport[]>{
    const {data:match,error:matchError}=await this.database.from("matches").select("league_instance_id,home_club_id,away_club_id,home_goals,away_goals,fixtures!inner(round_number),match_stats(*)").eq("id",matchId).single();if(matchError)throw matchError;
    const [{data:clubs,error:clubError},{data:events,error:eventError}]=await Promise.all([this.database.from("league_clubs").select("id,manager_type,manager_user_id,points,played,wins,draws,losses,cash_balance,clubs!inner(name),league_instances!inner(instance_number,competitions!inner(name)),users(telegram_id)").in("id",[match.home_club_id,match.away_club_id]),this.database.from("match_events").select("minute,club_id,player_id,metadata,players(short_name)").eq("match_id",matchId).eq("event_type","GOAL").order("minute")]);if(clubError)throw clubError;if(eventError)throw eventError;
    const assistantIds=(events??[]).map((event:any)=>event.metadata?.assist_player_id).filter(Boolean);const{data:assistants,error:assistError}=assistantIds.length?await this.database.from("players").select("id,short_name").in("id",assistantIds):{data:[],error:null};if(assistError)throw assistError;const assistantName=new Map((assistants??[]).map((player:any)=>[player.id,player.short_name]));
    const allTable=await this.database.from("league_clubs").select("id,points,goals_for,goals_against,clubs!inner(name)").eq("league_instance_id",match.league_instance_id);if(allTable.error)throw allTable.error;const ordered=(allTable.data??[]).sort((a:any,b:any)=>b.points-a.points||((b.goals_for-b.goals_against)-(a.goals_for-a.goals_against))||b.goals_for-a.goals_for);
    const stats=first<any>((match as any).match_stats);const clubMap=new Map((clubs??[]).map((club:any)=>[club.id,club]));const home=clubMap.get(match.home_club_id),away=clubMap.get(match.away_club_id);if(!home||!away)return[];
    const result:MatchOwnerReport[]=[];for(const club of [home,away]){if(club.manager_type!=="HUMAN")continue;const user=first<any>(club.users);if(!user?.telegram_id)continue;const isHome=club.id===match.home_club_id,opponent=isHome?away:home;const {data:incomeRows,error:incomeError}=await this.database.from("finance_transactions").select("amount").eq("match_id",matchId).eq("league_club_id",club.id);if(incomeError)throw incomeError;const {data:next,error:nextError}=await this.database.from("fixtures").select("scheduled_at,home:league_clubs!fixtures_home_club_id_fkey(clubs!inner(name)),away:league_clubs!fixtures_away_club_id_fkey(clubs!inner(name))").or(`home_club_id.eq.${club.id},away_club_id.eq.${club.id}`).eq("status","SCHEDULED").gt("scheduled_at",new Date().toISOString()).order("scheduled_at").limit(1).maybeSingle();if(nextError)throw nextError;const league=first<any>(club.league_instances),competition=first<any>(league.competitions);result.push({telegramId:Number(user.telegram_id),clubId:club.id,club:first<any>(club.clubs).name,opponent:first<any>(opponent.clubs).name,isHome,homeGoals:match.home_goals,awayGoals:match.away_goals,goals:(events??[]).map((event:any)=>({minute:event.minute,player:first<any>(event.players)?.short_name??"Noma’lum",assist:assistantName.get(event.metadata?.assist_player_id)??null})),possession:[stats.possession_home,100-stats.possession_home],shots:[stats.shots_home,stats.shots_away],onTarget:[stats.shots_on_target_home,stats.shots_on_target_away],corners:[stats.corners_home,stats.corners_away],position:ordered.findIndex((row:any)=>row.id===club.id)+1,points:club.points,played:club.played,wins:club.wins,draws:club.draws,losses:club.losses,income:(incomeRows??[]).reduce((sum:number,row:any)=>sum+Number(row.amount),0),balance:Number(club.cash_balance),next:next?{home:first<any>(first<any>((next as any).home).clubs).name,away:first<any>(first<any>((next as any).away).clubs).name,scheduledAt:next.scheduled_at}:null,leagueName:`${competition.name} #${String(league.instance_number).padStart(4,"0")}`});}return result;
  }

  async history(userId: string, leagueClubId: string, limit = 10): Promise<MatchResult[]> {
    const { data: owned } = await this.database.from("league_clubs").select("league_instance_id").eq("id",leagueClubId).eq("manager_user_id",userId).maybeSingle();
    if (!owned) throw new Error("CLUB_NOT_OWNED");
    const { data, error } = await this.database.from("matches").select("id,played_at,home_goals,away_goals,fixtures!inner(round_number),home:league_clubs!matches_home_club_id_fkey(clubs!inner(name)),away:league_clubs!matches_away_club_id_fkey(clubs!inner(name))").or(`home_club_id.eq.${leagueClubId},away_club_id.eq.${leagueClubId}`).order("played_at",{ascending:false}).limit(limit);
    if(error)throw error;
    return (data??[]).map((row:any)=>({id:row.id,round:first<any>(row.fixtures).round_number,playedAt:row.played_at,homeClub:first<any>(first<any>(row.home).clubs).name,awayClub:first<any>(first<any>(row.away).clubs).name,homeGoals:row.home_goals,awayGoals:row.away_goals}));
  }

  async table(userId:string,leagueClubId:string):Promise<TableRow[]>{
    const {data:owned}=await this.database.from("league_clubs").select("league_instance_id").eq("id",leagueClubId).eq("manager_user_id",userId).maybeSingle();if(!owned)throw new Error("CLUB_NOT_OWNED");
    const {data,error}=await this.database.from("league_clubs").select("played,wins,draws,losses,goals_for,goals_against,points,clubs!inner(name)").eq("league_instance_id",owned.league_instance_id).order("points",{ascending:false}).order("goals_for",{ascending:false});if(error)throw error;
    return (data??[]).sort((a:any,b:any)=>b.points-a.points-((a.goals_for-a.goals_against)-(b.goals_for-b.goals_against))).map((r:any,i)=>({position:i+1,club:first<any>(r.clubs).name,played:r.played,wins:r.wins,draws:r.draws,losses:r.losses,goalDifference:r.goals_for-r.goals_against,points:r.points}));
  }

  async leaders(userId:string,leagueClubId:string,kind:"goals"|"assists"):Promise<PlayerLeader[]>{
    const {data:owned,error:ownedError}=await this.database.from("league_clubs").select("league_instance_id").eq("id",leagueClubId).eq("manager_user_id",userId).maybeSingle();if(ownedError||!owned)throw new Error("CLUB_NOT_OWNED");
    const {data,error}=await this.database.from("player_match_stats").select("player_id,club_id,goals,assists,players!inner(short_name),league_clubs!inner(league_instance_id,clubs!inner(name))").eq("league_clubs.league_instance_id",owned.league_instance_id).gt(kind,0);if(error)throw error;
    const totals=new Map<string,PlayerLeader>();for(const row of data??[]){const player=first<any>((row as any).players),club=first<any>(first<any>((row as any).league_clubs).clubs),current=totals.get(row.player_id)??{name:player.short_name,club:club.name,total:0};current.total+=Number((row as any)[kind]);totals.set(row.player_id,current);}return[...totals.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name)).slice(0,10);
  }

  async finances(userId:string,leagueClubId:string):Promise<FinanceSummary>{
    const {data:club,error:clubError}=await this.database.from("league_clubs").select("cash_balance,transfer_budget,reserved_transfer_budget").eq("id",leagueClubId).eq("manager_user_id",userId).maybeSingle();if(clubError)throw clubError;if(!club)throw new Error("CLUB_NOT_OWNED");
    const {data,error}=await this.database.from("finance_transactions").select("kind,amount,description,created_at").eq("league_club_id",leagueClubId).order("created_at",{ascending:false}).limit(10);if(error)throw error;
    return {cashBalance:Number(club.cash_balance),transferBudget:Number(club.transfer_budget),reservedTransferBudget:Number(club.reserved_transfer_budget??0),transactions:(data??[]).map((row:any)=>({kind:row.kind,amount:Number(row.amount),description:row.description,createdAt:row.created_at}))};
  }
}
