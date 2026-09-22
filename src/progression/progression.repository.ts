import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManagedClub } from "../leagues/types.js";

export interface ManagerProfile {
  userId?: string;
  name: string;
  username: string | null;
  rating: number;
  xp?: number;
  globalRank?: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  titles: number;
  seasons: number;
  currentWinStreak?: number;
  currentUnbeatenStreak?: number;
  bestWinStreak?: number;
  bestUnbeatenStreak?: number;
  spend: number;
  income: number;
  biggest: number;
}

export interface GlobalLeaderboardEntry {
  userId: string;
  name: string;
  username: string | null;
  xp: number;
  wins: number;
  matches: number;
  rank: number;
}

export interface ManagerHonour {
  id: string;
  managerUserId: string;
  leagueInstanceId: string;
  competitionCode: string;
  season: number;
  honourType: "CHAMPION" | "RUNNER_UP" | "THIRD_PLACE" | "BEST_ATTACK" | "BEST_DEFENSE" | string;
  title: string;
  createdAt: string;
}

export interface Sponsor {
  id: string;
  name: string;
  payment: number;
  channelId: number | null;
  channelUsername: string | null;
  joinUrl: string | null;
}

const one = <T>(value: T | T[]): T => (Array.isArray(value) ? (value[0] as T) : value);

export class ProgressionRepository {
  constructor(private readonly database: SupabaseClient) {}

  async profile(userId: string): Promise<ManagerProfile> {
    // Ensure manager_profile exists
    await this.database
      .from("manager_profiles")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });

    const { data, error } = await this.database
      .from("manager_profiles")
      .select(`
        user_id, manager_rating, matches, wins, draws, losses, titles, seasons,
        xp, current_win_streak, current_unbeaten_streak, best_win_streak, best_unbeaten_streak,
        total_transfer_spend, total_transfer_income, biggest_transfer,
        users!inner(first_name, username)
      `)
      .eq("user_id", userId)
      .single();

    if (error) throw error;
    const u = one<any>(data.users);

    const userXp = Number(data.xp ?? 0);
    const userWins = Number(data.wins ?? 0);
    const userMatches = Number(data.matches ?? 0);

    const { count: aheadCount } = await this.database
      .from("manager_profiles")
      .select("user_id", { count: "exact", head: true })
      .or(
        `xp.gt.${userXp},and(xp.eq.${userXp},wins.gt.${userWins}),and(xp.eq.${userXp},wins.eq.${userWins},matches.lt.${userMatches}),and(xp.eq.${userXp},wins.eq.${userWins},matches.eq.${userMatches},user_id.lt.${userId})`
      );

    const globalRank = (aheadCount ?? 0) + 1;

    return {
      userId: data.user_id,
      name: u.first_name,
      username: u.username,
      rating: data.manager_rating,
      xp: userXp,
      globalRank,
      matches: userMatches,
      wins: userWins,
      draws: Number(data.draws ?? 0),
      losses: Number(data.losses ?? 0),
      titles: Number(data.titles ?? 0),
      seasons: Number(data.seasons ?? 0),
      currentWinStreak: Number(data.current_win_streak ?? 0),
      currentUnbeatenStreak: Number(data.current_unbeaten_streak ?? 0),
      bestWinStreak: Number(data.best_win_streak ?? 0),
      bestUnbeatenStreak: Number(data.best_unbeaten_streak ?? 0),
      spend: Number(data.total_transfer_spend ?? 0),
      income: Number(data.total_transfer_income ?? 0),
      biggest: Number(data.biggest_transfer ?? 0),
    };
  }

  async globalLeaderboard(
    limit = 10,
    currentUserId?: string
  ): Promise<{ entries: GlobalLeaderboardEntry[]; userRank: number; userXp: number }> {
    const { data, error } = await this.database
      .from("manager_profiles")
      .select(`
        user_id, xp, wins, matches,
        users!inner(first_name, username)
      `)
      .order("xp", { ascending: false })
      .order("wins", { ascending: false })
      .order("matches", { ascending: true })
      .order("user_id", { ascending: true })
      .limit(limit);

    if (error) throw error;

    const entries: GlobalLeaderboardEntry[] = (data ?? []).map((r: any, idx: number) => {
      const u = one<any>(r.users);
      return {
        userId: r.user_id,
        name: u.first_name,
        username: u.username,
        xp: Number(r.xp ?? 0),
        wins: Number(r.wins ?? 0),
        matches: Number(r.matches ?? 0),
        rank: idx + 1,
      };
    });

    let userRank = 1;
    let userXp = 0;

    if (currentUserId) {
      const userProf = await this.profile(currentUserId);
      userRank = userProf.globalRank ?? 1;
      userXp = userProf.xp ?? 0;
    }

    return { entries, userRank, userXp };
  }

  // Legacy method compatibility
  async leaderboard(limit = 20): Promise<ManagerProfile[]> {
    const { data, error } = await this.database
      .from("manager_profiles")
      .select(`
        user_id, manager_rating, matches, wins, draws, losses, titles, seasons,
        xp, current_win_streak, current_unbeaten_streak, best_win_streak, best_unbeaten_streak,
        total_transfer_spend, total_transfer_income, biggest_transfer,
        users!inner(first_name, username)
      `)
      .order("manager_rating", { ascending: false })
      .order("wins", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data ?? []).map((r: any) => {
      const u = one<any>(r.users);
      return {
        userId: r.user_id,
        name: u.first_name,
        username: u.username,
        rating: r.manager_rating,
        xp: Number(r.xp ?? 0),
        matches: r.matches,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        titles: r.titles,
        seasons: r.seasons,
        currentWinStreak: Number(r.current_win_streak ?? 0),
        currentUnbeatenStreak: Number(r.current_unbeaten_streak ?? 0),
        bestWinStreak: Number(r.best_win_streak ?? 0),
        bestUnbeatenStreak: Number(r.best_unbeaten_streak ?? 0),
        spend: Number(r.total_transfer_spend),
        income: Number(r.total_transfer_income),
        biggest: Number(r.biggest_transfer),
      };
    });
  }

  async listHonours(userId: string): Promise<ManagerHonour[]> {
    const { data, error } = await this.database
      .from("manager_honours")
      .select("id, manager_user_id, league_instance_id, competition_code, season, honour_type, title, created_at")
      .eq("manager_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      id: row.id,
      managerUserId: row.manager_user_id,
      leagueInstanceId: row.league_instance_id,
      competitionCode: row.competition_code,
      season: row.season,
      honourType: row.honour_type,
      title: row.title,
      createdAt: row.created_at,
    }));
  }

  async recordHonour(
    userId: string,
    leagueInstanceId: string,
    competitionCode: string,
    season: number,
    honourType: string,
    title: string
  ): Promise<void> {
    const { error } = await this.database
      .from("manager_honours")
      .upsert(
        {
          manager_user_id: userId,
          league_instance_id: leagueInstanceId,
          competition_code: competitionCode,
          season,
          honour_type: honourType,
          title,
        },
        { onConflict: "manager_user_id,league_instance_id,honour_type", ignoreDuplicates: true }
      );

    if (error) throw error;
  }

  async sponsors(): Promise<Sponsor[]> {
    const { data, error } = await this.database
      .from("sponsors")
      .select("id, name, payment_per_match, required_channel_id, required_channel_username, join_url")
      .eq("is_active", true)
      .order("payment_per_match");
    if (error) throw error;
    return (data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      payment: Number(s.payment_per_match),
      channelId: s.required_channel_id ? Number(s.required_channel_id) : null,
      channelUsername: s.required_channel_username,
      joinUrl: s.join_url,
    }));
  }

  async acceptSponsor(userId: string, clubId: string, sponsorId: string): Promise<void> {
    const { error } = await this.database.rpc("accept_sponsor", {
      p_user_id: userId,
      p_league_club_id: clubId,
      p_sponsor_id: sponsorId,
    });
    if (error) throw error;
  }

  async setEligibility(userId: string, clubId: string, eligible: boolean): Promise<void> {
    const { error } = await this.database.rpc("update_sponsor_eligibility", {
      p_user_id: userId,
      p_league_club_id: clubId,
      p_eligible: eligible,
    });
    if (error) throw error;
  }
}
