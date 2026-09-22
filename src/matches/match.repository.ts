import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchSimulation, MatchTeamInput } from "./match-engine.js";
import type { ClubSeasonStats, MatchPreviewData, PlayerSeasonStats } from "./presentation.js";

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
      .select("id, manager_user_id, points, goals_for, goals_against, league_instances!inner(instance_number, competitions!inner(code, name))")
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

    // Record Honours in manager_honours
    const firstInstance = (ordered[0] as any)?.league_instances;
    const comp = first<any>(firstInstance?.competitions);
    const compCode = comp?.code ?? "ELITE";
    const compName = comp?.name ?? "OFM Elite League";
    const instanceNum = firstInstance?.instance_number ?? 1;

    for (let i = 0; i < Math.min(3, ordered.length); i++) {
      const club = ordered[i];
      if (club?.manager_user_id) {
        const type = i === 0 ? "CHAMPION" : i === 1 ? "RUNNER_UP" : "THIRD_PLACE";
        const title = i === 0 ? `${compName} #${String(instanceNum).padStart(4, "0")} — Chempion`
                    : i === 1 ? `${compName} #${String(instanceNum).padStart(4, "0")} — 2-o‘rin`
                    : `${compName} #${String(instanceNum).padStart(4, "0")} — 3-o‘rin`;
        await this.database
          .from("manager_honours")
          .upsert({
            manager_user_id: club.manager_user_id,
            league_instance_id: instanceId,
            competition_code: compCode,
            season: 1,
            honour_type: type,
            title,
          }, { onConflict: "manager_user_id,league_instance_id,honour_type", ignoreDuplicates: true });
      }
    }

    // Best Attack Honour
    const bestAttackClub = [...table].sort((a: any, b: any) => b.goals_for - a.goals_for)[0];
    if (bestAttackClub?.manager_user_id) {
      await this.database
        .from("manager_honours")
        .upsert({
          manager_user_id: bestAttackClub.manager_user_id,
          league_instance_id: instanceId,
          competition_code: compCode,
          season: 1,
          honour_type: "BEST_ATTACK",
          title: `${compName} #${String(instanceNum).padStart(4, "0")} — Eng yaxshi hujum`,
        }, { onConflict: "manager_user_id,league_instance_id,honour_type", ignoreDuplicates: true });
    }

    // Best Defense Honour
    const bestDefenseClub = [...table].sort((a: any, b: any) => a.goals_against - b.goals_against)[0];
    if (bestDefenseClub?.manager_user_id) {
      await this.database
        .from("manager_honours")
        .upsert({
          manager_user_id: bestDefenseClub.manager_user_id,
          league_instance_id: instanceId,
          competition_code: compCode,
          season: 1,
          honour_type: "BEST_DEFENSE",
          title: `${compName} #${String(instanceNum).padStart(4, "0")} — Eng yaxshi himoya`,
        }, { onConflict: "manager_user_id,league_instance_id,honour_type", ignoreDuplicates: true });
    }
  }

  private async recordPlayerStats(matchId: string): Promise<void> {
    const { data: match, error: matchError } = await this.database
      .from("matches")
      .select("home_club_id, away_club_id, home_goals, away_goals")
      .eq("id", matchId)
      .single();
    if (matchError) throw matchError;

    const assign = async (clubId: string, goals: number) => {
      if (!goals) return;
      const [{ data, error }, { data: events, error: eventError }, { data: lineup }] = await Promise.all([
        this.database
          .from("club_players")
          .select("id, player_id, players!inner(id, primary_position, player_attributes!inner(overall))")
          .eq("league_club_id", clubId),
        this.database
          .from("match_events")
          .select("id, is_penalty")
          .eq("match_id", matchId)
          .eq("club_id", clubId)
          .eq("event_type", "GOAL")
          .order("minute"),
        this.database
          .from("lineups")
          .select("penalty_taker_player_id")
          .eq("league_club_id", clubId)
          .maybeSingle(),
      ]);

      if (error) throw error;
      if (eventError) throw eventError;

      const players = (data ?? []).map((row: any) => {
        const player = first<any>(row.players);
        return {
          id: player.id,
          clubPlayerId: row.id,
          position: player.primary_position,
          overall: Number(first<any>(player.player_attributes).overall),
        };
      }).sort((a, b) => {
        const weight = (p: string) => p === "ST" ? 4 : p === "LW" || p === "RW" || p === "CAM" ? 3 : p === "CM" || p === "LM" || p === "RM" ? 2 : 1;
        return weight(b.position) * 100 + b.overall - (weight(a.position) * 100 + a.overall);
      });

      if (!players.length) return;

      const penaltyTaker = lineup?.penalty_taker_player_id
        ? players.find(p => p.clubPlayerId === lineup.penalty_taker_player_id)
        : null;

      const rows = new Map<string, { match_id: string; player_id: string; club_id: string; minutes: number; goals: number; assists: number; rating: number }>();

      for (let index = 0; index < goals; index += 1) {
        const isPen = Boolean((events?.[index] as any)?.is_penalty);
        const scorer = (isPen && penaltyTaker) ? penaltyTaker : players[index % Math.min(3, players.length)]!;
        const assistant = players.find(
          player => player.id !== scorer.id && ["LW", "RW", "CAM", "CM", "LM", "RM"].includes(player.position)
        ) ?? players[(index + 1) % players.length]!;

        const scorerRow = rows.get(scorer.id) ?? {
          match_id: matchId,
          player_id: scorer.id,
          club_id: clubId,
          minutes: 90,
          goals: 0,
          assists: 0,
          rating: 6.5,
        };
        scorerRow.goals++;
        rows.set(scorer.id, scorerRow);

        if (assistant.id !== scorer.id && !isPen) {
          const assistantRow = rows.get(assistant.id) ?? {
            match_id: matchId,
            player_id: assistant.id,
            club_id: clubId,
            minutes: 90,
            goals: 0,
            assists: 0,
            rating: 6.5,
          };
          assistantRow.assists++;
          rows.set(assistant.id, assistantRow);
        }

        const event = events?.[index];
        if (event) {
          await this.database
            .from("match_events")
            .update({
              player_id: scorer.id,
              metadata: { assist_player_id: !isPen && assistant.id !== scorer.id ? assistant.id : null },
            })
            .eq("id", event.id);
        }
      }

      for (const row of rows.values()) {
        row.rating = Math.min(10.0, Math.max(5.0, Number((6.5 + row.goals * 1.2 + row.assists * 0.7).toFixed(1))));
      }

      const { error: insertError } = await this.database
        .from("player_match_stats")
        .upsert([...rows.values()], { onConflict: "match_id,player_id" });

      if (insertError) throw insertError;
    };

    await Promise.all([assign(match.home_club_id, match.home_goals), assign(match.away_club_id, match.away_goals)]);
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

  async clubSeasonStats(userId: string, leagueClubId: string): Promise<ClubSeasonStats> {
    const { data: club, error: clubErr } = await this.database
      .from("league_clubs")
      .select("id, league_instance_id, played, wins, draws, losses, goals_for, goals_against, clubs!inner(name)")
      .eq("id", leagueClubId)
      .eq("manager_user_id", userId)
      .maybeSingle();

    if (clubErr || !club) throw new Error("CLUB_NOT_OWNED");
    const clubName = first<any>(club.clubs).name;

    const { data: matches, error: mErr } = await this.database
      .from("matches")
      .select("home_club_id, away_club_id, home_goals, away_goals")
      .or(`home_club_id.eq.${leagueClubId},away_club_id.eq.${leagueClubId}`);

    if (mErr) throw mErr;

    let homeWins = 0, homeDraws = 0, homeLosses = 0;
    let awayWins = 0, awayDraws = 0, awayLosses = 0;

    for (const m of matches || []) {
      if (m.home_club_id === leagueClubId) {
        if (m.home_goals > m.away_goals) homeWins++;
        else if (m.home_goals === m.away_goals) homeDraws++;
        else homeLosses++;
      } else {
        if (m.away_goals > m.home_goals) awayWins++;
        else if (m.away_goals === m.home_goals) awayDraws++;
        else awayLosses++;
      }
    }

    const gf = Number(club.goals_for);
    const ga = Number(club.goals_against);

    return {
      clubName,
      games: Number(club.played),
      wins: Number(club.wins),
      draws: Number(club.draws),
      losses: Number(club.losses),
      goalsFor: gf,
      goalsAgainst: ga,
      goalDifference: gf - ga,
      homeWins,
      homeDraws,
      homeLosses,
      awayWins,
      awayDraws,
      awayLosses,
    };
  }

  async playerSeasonStats(playerIdOrClubPlayerId: string, leagueClubId?: string): Promise<PlayerSeasonStats> {
    let resolvedPlayerId = playerIdOrClubPlayerId;
    let resolvedClubId = leagueClubId;
    let playerName = "Futbolchi";

    const { data: cp } = await this.database
      .from("club_players")
      .select("id, player_id, league_club_id, players(id, short_name, name)")
      .eq("id", playerIdOrClubPlayerId)
      .maybeSingle();

    if (cp) {
      resolvedPlayerId = cp.player_id;
      if (!resolvedClubId) resolvedClubId = cp.league_club_id;
      const p = first<any>(cp.players);
      playerName = p?.short_name ?? p?.name ?? "Futbolchi";
    } else {
      const { data: p } = await this.database
        .from("players")
        .select("short_name, name")
        .eq("id", playerIdOrClubPlayerId)
        .maybeSingle();
      playerName = p?.short_name ?? p?.name ?? "Futbolchi";
    }

    let query = this.database
      .from("player_match_stats")
      .select("minutes, rating, goals, assists, yellow_cards, red_cards")
      .eq("player_id", resolvedPlayerId);

    if (resolvedClubId) {
      query = query.eq("club_id", resolvedClubId);
    }

    const { data: rows, error } = await query;

    if (error) throw error;

    let games = 0, goals = 0, assists = 0, yellowCards = 0, redCards = 0;
    let ratingSum = 0, ratingCount = 0;

    for (const r of rows || []) {
      games++;
      goals += Number(r.goals ?? 0);
      assists += Number(r.assists ?? 0);
      yellowCards += Number(r.yellow_cards ?? 0);
      redCards += Number(r.red_cards ?? 0);
      if (r.rating !== null && r.rating !== undefined) {
        ratingSum += Number(r.rating);
        ratingCount++;
      }
    }

    const averageRating = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(1)) : null;

    return {
      playerName,
      games,
      matchesPlayed: games,
      goals,
      assists,
      yellowCards,
      redCards,
      averageRating,
    };
  }

  async matchPreview(fixtureId: string): Promise<MatchPreviewData> {
    const { data: fixture, error: fErr } = await this.database
      .from("fixtures")
      .select("id, home_club_id, away_club_id, scheduled_at, league_instance_id")
      .eq("id", fixtureId)
      .single();

    if (fErr || !fixture) throw new Error("FIXTURE_NOT_FOUND");

    const [{ data: homeClub }, { data: awayClub }] = await Promise.all([
      this.database.from("league_clubs").select("id, clubs!inner(name)").eq("id", fixture.home_club_id).single(),
      this.database.from("league_clubs").select("id, clubs!inner(name)").eq("id", fixture.away_club_id).single(),
    ]);

    const homeClubName = first<any>(homeClub?.clubs)?.name ?? "Home";
    const awayClubName = first<any>(awayClub?.clubs)?.name ?? "Away";

    const { data: table } = await this.database
      .from("league_clubs")
      .select("id, points, goals_for, goals_against")
      .eq("league_instance_id", fixture.league_instance_id);

    const ordered = (table ?? []).sort(
      (a: any, b: any) =>
        b.points - a.points ||
        b.goals_for - b.goals_against - (a.goals_for - a.goals_against) ||
        b.goals_for - a.goals_for
    );

    const homeRank = ordered.findIndex((c) => c.id === fixture.home_club_id) + 1;
    const awayRank = ordered.findIndex((c) => c.id === fixture.away_club_id) + 1;

    const [homeOvr, awayOvr] = await Promise.all([
      this.getTeamOvr(fixture.home_club_id),
      this.getTeamOvr(fixture.away_club_id),
    ]);

    const [homeForm, awayForm] = await Promise.all([
      this.getLast5Form(fixture.home_club_id),
      this.getLast5Form(fixture.away_club_id),
    ]);

    const { data: h2hMatches } = await this.database
      .from("matches")
      .select("home_club_id, away_club_id, home_goals, away_goals")
      .or(
        `and(home_club_id.eq.${fixture.home_club_id},away_club_id.eq.${fixture.away_club_id}),and(home_club_id.eq.${fixture.away_club_id},away_club_id.eq.${fixture.home_club_id})`
      );

    let homeWins = 0, draws = 0, awayWins = 0;
    const hasHistory = Boolean(h2hMatches && h2hMatches.length > 0);

    for (const m of h2hMatches || []) {
      if (m.home_club_id === fixture.home_club_id) {
        if (m.home_goals > m.away_goals) homeWins++;
        else if (m.home_goals === m.away_goals) draws++;
        else awayWins++;
      } else {
        if (m.away_goals > m.home_goals) homeWins++;
        else if (m.away_goals === m.home_goals) draws++;
        else awayWins++;
      }
    }

    const date = new Date(fixture.scheduled_at);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const scheduledAt = `${day} ${month} · ${hours}:${minutes}`;

    return {
      homeClubName,
      awayClubName,
      homeRank: homeRank || 1,
      awayRank: awayRank || 2,
      homeOvr,
      awayOvr,
      homeForm,
      awayForm,
      h2h: { homeWins, draws, awayWins, hasHistory },
      scheduledAt,
    };
  }

  private async getTeamOvr(clubId: string): Promise<number> {
    const { data: lp } = await this.database
      .from("lineup_players")
      .select("effective_rating, lineups!inner(league_club_id)")
      .eq("lineups.league_club_id", clubId);

    if (lp && lp.length >= 11) {
      const avg = lp.reduce((sum, p) => sum + Number(p.effective_rating), 0) / lp.length;
      return Math.round(avg);
    }

    const { data: squad } = await this.database
      .from("club_players")
      .select("players!inner(player_attributes!inner(overall))")
      .eq("league_club_id", clubId);

    if (squad && squad.length > 0) {
      const avg = squad.reduce((sum: number, cp: any) => {
        const p = first<any>(cp.players);
        const attr = first<any>(p.player_attributes);
        return sum + Number(attr?.overall ?? 75);
      }, 0) / squad.length;
      return Math.round(avg);
    }
    return 75;
  }

  private async getLast5Form(clubId: string): Promise<string> {
    const { data: matches } = await this.database
      .from("matches")
      .select("home_club_id, away_club_id, home_goals, away_goals, played_at")
      .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
      .order("played_at", { ascending: false })
      .limit(5);

    if (!matches || !matches.length) return "";

    return matches.reverse().map((m) => {
      const isHome = m.home_club_id === clubId;
      const myGoals = isHome ? m.home_goals : m.away_goals;
      const oppGoals = isHome ? m.away_goals : m.home_goals;
      if (myGoals > oppGoals) return "W";
      if (myGoals === oppGoals) return "D";
      return "L";
    }).join("");
  }
}
