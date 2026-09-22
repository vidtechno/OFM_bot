import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml } from "../lib/html.js";

export interface SeasonSummaryData {
  managerName: string;
  finalPosition: number;
  totalGames: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  seasonXpEarned: number;
  bestPlayer?: {
    name: string;
    goals: number;
    assists: number;
  } | null;
  topScorer?: {
    name: string;
    goals: number;
  } | null;
  topAssist?: {
    name: string;
    assists: number;
  } | null;
  bestWinStreak: number;
  honours: string[];
}

export class SeasonSummaryService {
  constructor(private readonly database: SupabaseClient) {}

  formatSeasonSummary(summary: SeasonSummaryData): string {
    const lines = [
      "🏁 <b>MAVSUM YAKUNI</b>",
      "",
      `🏆 Yakuniy o‘rin: <b>${summary.finalPosition}-o‘rin</b>`,
      "",
      `🎮 ${summary.totalGames} o‘yin`,
      `✅ ${summary.wins} g‘alaba`,
      `🤝 ${summary.draws} durang`,
      `❌ ${summary.losses} mag‘lubiyat`,
      "",
      `⚽ Urilgan gol: <b>${summary.goalsFor}</b>`,
      `🥅 O‘tkazilgan gol: <b>${summary.goalsAgainst}</b>`,
      "",
      `⭐ Mavsumda olingan XP: <b>+${summary.seasonXpEarned}</b>`,
    ];

    if (summary.bestPlayer) {
      lines.push(
        "",
        "👑 <b>Eng yaxshi futbolchi</b>",
        `<b>${escapeHtml(summary.bestPlayer.name)}</b>`,
        `${summary.bestPlayer.goals} gol · ${summary.bestPlayer.assists} assist`
      );
    }

    if (summary.bestWinStreak > 0) {
      lines.push("", `🔥 Eng yaxshi seriya: <b>${summary.bestWinStreak}</b>`);
    }

    if (summary.honours.length > 0) {
      lines.push("", "🎖 <b>Qo‘lga kiritilgan sovrinlar:</b>");
      for (const h of summary.honours) {
        lines.push(`• ${escapeHtml(h)}`);
      }
    }

    return lines.join("\n");
  }

  async buildSummaryForManager(
    leagueInstanceId: string,
    managerUserId: string,
    leagueClubId: string
  ): Promise<SeasonSummaryData | null> {
    // 1. Get standings position and record
    const { data: table } = await this.database
      .from("league_clubs")
      .select("id, manager_user_id, points, played, wins, draws, losses, goals_for, goals_against")
      .eq("league_instance_id", leagueInstanceId);

    if (!table || !table.length) return null;

    const ordered = table.sort(
      (a: any, b: any) =>
        b.points - a.points ||
        b.goals_for - b.goals_against - (a.goals_for - a.goals_against) ||
        b.goals_for - a.goals_for
    );

    const pos = ordered.findIndex((c) => c.id === leagueClubId) + 1;
    const myClub = ordered.find((c) => c.id === leagueClubId);
    if (!myClub) return null;

    // 2. Sum season XP
    const { data: xpRows } = await this.database
      .from("manager_xp_events")
      .select("xp_amount, matches!inner(league_instance_id)")
      .eq("user_id", managerUserId)
      .eq("matches.league_instance_id", leagueInstanceId);

    const seasonXp = (xpRows ?? []).reduce((sum, r) => sum + Number(r.xp_amount), 0);

    // 3. Manager name & streaks
    const { data: prof } = await this.database
      .from("manager_profiles")
      .select("best_win_streak, users!inner(first_name)")
      .eq("user_id", managerUserId)
      .maybeSingle();

    const u = prof ? (Array.isArray(prof.users) ? prof.users[0] : prof.users) : null;
    const managerName = u?.first_name ?? "Manager";

    // 4. Best player from player_match_stats
    const { data: pStats } = await this.database
      .from("player_match_stats")
      .select("player_id, goals, assists, players!inner(short_name)")
      .eq("club_id", leagueClubId);

    const playerAgg = new Map<string, { name: string; goals: number; assists: number; score: number }>();
    for (const r of pStats || []) {
      const p = Array.isArray(r.players) ? r.players[0] : r.players;
      const cur = playerAgg.get(r.player_id) ?? { name: p?.short_name ?? "Player", goals: 0, assists: 0, score: 0 };
      cur.goals += Number(r.goals ?? 0);
      cur.assists += Number(r.assists ?? 0);
      cur.score = cur.goals * 2 + cur.assists;
      playerAgg.set(r.player_id, cur);
    }

    const sortedPlayers = [...playerAgg.values()].sort((a, b) => b.score - a.score);
    const bestPlayer = sortedPlayers[0] ?? null;

    // 5. Honours earned
    const { data: honours } = await this.database
      .from("manager_honours")
      .select("title")
      .eq("manager_user_id", managerUserId)
      .eq("league_instance_id", leagueInstanceId);

    return {
      managerName,
      finalPosition: pos,
      totalGames: myClub.played,
      wins: myClub.wins,
      draws: myClub.draws,
      losses: myClub.losses,
      goalsFor: myClub.goals_for,
      goalsAgainst: myClub.goals_against,
      seasonXpEarned: seasonXp,
      bestPlayer,
      bestWinStreak: prof?.best_win_streak ?? 0,
      honours: (honours ?? []).map((h: any) => h.title),
    };
  }
}
