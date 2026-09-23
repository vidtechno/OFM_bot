import type { FinanceSummary, MatchOwnerReport, MatchResult, PlayerLeader, TableRow } from "./match.repository.js";
import { escapeHtml, formatMoney, formatDateTime } from "../lib/html.js";

export interface ClubSeasonStats {
  clubName: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  homeWins: number;
  homeDraws: number;
  homeLosses: number;
  awayWins: number;
  awayDraws: number;
  awayLosses: number;
}

export interface PlayerSeasonStats {
  playerName: string;
  games: number;
  matchesPlayed?: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  averageRating: number | null;
}

export interface MatchPreviewData {
  homeClubName: string;
  awayClubName: string;
  homeRank: number;
  awayRank: number;
  homeOvr: number;
  awayOvr: number;
  homeForm: string;
  awayForm: string;
  h2h: {
    homeWins: number;
    draws: number;
    awayWins: number;
    hasHistory: boolean;
  };
  scheduledAt: string;
}

export function formatResults(results: MatchResult[]): string {
  if (!results.length) {
    return "⚽ <b>NATIJALAR</b>\n\n<i>Hali o‘yin o‘tkazilmagan.</i>";
  }
  return [
    "⚽ <b>SO‘NGGI NATIJALAR</b>",
    "",
    ...results.map(
      (r) =>
        `<b>${r.round}-tur</b> · ${escapeHtml(r.homeClub)} <b>${r.homeGoals}:${r.awayGoals}</b> ${escapeHtml(r.awayClub)}`
    ),
  ].join("\n");
}

export function formatTable(rows: TableRow[], userClubName?: string, leagueTitle = "LALIGA — JADVAL"): string {
  if (!rows.length) {
    return `🏆 <b>${escapeHtml(leagueTitle)}</b>\n\n<i>Hali o‘yinlar o‘tkazilmagan.</i>`;
  }

  const lines: string[] = [`🏆 <b>${escapeHtml(leagueTitle)}</b>`, ""];
  for (const r of rows) {
    const isUser = userClubName && r.club.toLowerCase().trim() === userClubName.toLowerCase().trim();
    const prefix = isUser ? "👉 " : "";
    lines.push(`${prefix}${r.position}. ${escapeHtml(r.club)} — <b>${r.points}</b>`);
  }
  return lines.join("\n");
}

export function formatLeaders(title: string, leaders: PlayerLeader[], unit: string): string {
  const icon = unit === "gol" || unit === "goals" ? "⚽" : "🎯";
  const cleanTitle = title.replace(/[🥅🎯⚽]/g, "").trim();
  const header = `${icon} <b>${escapeHtml(cleanTitle)}</b>`;

  if (!leaders.length) {
    return `${header}\n\n<i>Hali o‘yin statistikasi shakllanmagan.</i>`;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines: string[] = [header, ""];
  leaders.slice(0, 10).forEach((l, index) => {
    const medal = medals[index] ?? `${index + 1}.`;
    lines.push(`${medal} ${escapeHtml(l.name)} <i>(${escapeHtml(l.club)})</i> — <b>${l.total}</b>`);
  });
  return lines.join("\n");
}

export function formatFinances(summary: FinanceSummary): string {
  const available = summary.transferBudget - (summary.reservedTransferBudget ?? 0);
  const lines = [
    "💰 <b>KLUB MOLIYASI</b>",
    "",
    `💰 Transfer budjeti: <b>${formatMoney(summary.transferBudget)}</b>`,
  ];

  if ((summary.reservedTransferBudget ?? 0) > 0) {
    lines.push(
      `🔒 Band qilingan: <b>${formatMoney(summary.reservedTransferBudget ?? 0)}</b>`,
      `💵 Mavjud budjet: <b>${formatMoney(available)}</b>`
    );
  }

  lines.push(
    "",
    "🧾 <b>SO‘NGGI OPERATSIYALAR</b>",
    ...(summary.transactions.length
      ? summary.transactions.map(
          (t) =>
            `${t.amount >= 0 ? "🟢 +" : "🔴 -"}${formatMoney(Math.abs(t.amount))} · <i>${escapeHtml(t.description)}</i>`
        )
      : ["<i>Hozircha moliyaviy operatsiya yo‘q.</i>"])
  );

  return lines.join("\n");
}

export function formatClubSeasonStats(stats: ClubSeasonStats): string {
  const gdStr = stats.goalDifference >= 0 ? `+${stats.goalDifference}` : `${stats.goalDifference}`;

  return [
    "📊 <b>MAVSUM STATISTIKASI</b>",
    "",
    `🎮 O‘yinlar: <b>${stats.games}</b>`,
    `✅ G‘alaba: <b>${stats.wins}</b>`,
    `🤝 Durang: <b>${stats.draws}</b>`,
    `❌ Mag‘lubiyat: <b>${stats.losses}</b>`,
    "",
    `⚽ Urilgan gollar: <b>${stats.goalsFor}</b>`,
    `🥅 O‘tkazilgan gollar: <b>${stats.goalsAgainst}</b>`,
    `📈 To‘plar farqi: <b>${gdStr}</b>`,
    "",
    "🏠 Uyda:",
    `${stats.homeWins}W · ${stats.homeDraws}D · ${stats.homeLosses}L`,
    "",
    "✈️ Safarda:",
    `${stats.awayWins}W · ${stats.awayDraws}D · ${stats.awayLosses}L`,
  ].join("\n");
}

export function formatPlayerSeasonStats(stats: PlayerSeasonStats): string {
  const ratingStr = stats.averageRating !== null ? stats.averageRating.toFixed(1) : "—";

  return [
    "📊 <b>MAVSUM</b>",
    "",
    `🎮 O‘yin: <b>${stats.games}</b>`,
    `⚽ Gol: <b>${stats.goals}</b>`,
    `🎯 Assist: <b>${stats.assists}</b>`,
    `🟨 Sariq: <b>${stats.yellowCards}</b>`,
    `🟥 Qizil: <b>${stats.redCards}</b>`,
    `⭐ O‘rtacha baho: <b>${ratingStr}</b>`,
  ].join("\n");
}

export function formatMatchPreview(preview: MatchPreviewData): string {
  const h2hText = preview.h2h.hasHistory
    ? `${preview.h2h.homeWins}W · ${preview.h2h.draws}D · ${preview.h2h.awayWins}L`
    : "<i>Hali o‘zaro uchrashuv bo‘lmagan.</i>";

  return [
    "⚔️ <b>KEYINGI O‘YIN</b>",
    "",
    `<b>${escapeHtml(preview.homeClubName)} vs ${escapeHtml(preview.awayClubName)}</b>`,
    "",
    "📊 <b>Liga holati</b>",
    `${escapeHtml(preview.homeClubName)} — ${preview.homeRank}-o‘rin`,
    `${escapeHtml(preview.awayClubName)} — ${preview.awayRank}-o‘rin`,
    "",
    "⭐ <b>Jamoa OVR</b>",
    `${preview.homeOvr} vs ${preview.awayOvr}`,
    "",
    "🔥 <b>So‘nggi forma</b>",
    `${preview.homeForm || "—"} vs ${preview.awayForm || "—"}`,
    "",
    "⚔️ <b>O‘zaro o‘yinlar</b>",
    h2hText,
    "",
    `🗓 <i>${escapeHtml(preview.scheduledAt)}</i>`,
  ].join("\n");
}

export function formatMatchReport(report: MatchOwnerReport): string {
  const won = report.isHome ? report.homeGoals > report.awayGoals : report.awayGoals > report.homeGoals;
  const draw = report.homeGoals === report.awayGoals;
  const statusLine = won
    ? "🟢 <b>G‘ALABA</b>"
    : draw
    ? "🟡 <b>DURANG</b>"
    : "🔴 <b>MAG‘LUBIYAT</b>";

  const homeTeam = report.isHome ? report.club : report.opponent;
  const awayTeam = report.isHome ? report.opponent : report.club;
  const scoreLine = `<b>${escapeHtml(homeTeam.toUpperCase())} ${report.homeGoals}–${report.awayGoals} ${escapeHtml(awayTeam.toUpperCase())}</b>`;

  const goalsList = report.goals.length
    ? report.goals
        .map((g) => {
          const assist = g.assist ? ` <i>(${escapeHtml(g.assist)})</i>` : "";
          const club = g.club ? ` · ${escapeHtml(g.club)}` : "";
          return `${g.minute}' ${escapeHtml(g.player)}${assist}${club}`;
        })
        .join("\n")
    : "<i>Gol bo‘lmadi</i>";

  const [homePoss, awayPoss] = report.possession;
  const [homeShots, awayShots] = report.shots;
  const [homeOnTarget, awayOnTarget] = report.onTarget;
  const [homeCorners, awayCorners] = report.corners;

  const userPoss = report.isHome ? homePoss : awayPoss;
  const oppPoss = report.isHome ? awayPoss : homePoss;
  const userShots = report.isHome ? homeShots : awayShots;
  const oppShots = report.isHome ? awayShots : homeShots;
  const userOnTarget = report.isHome ? homeOnTarget : awayOnTarget;
  const oppOnTarget = report.isHome ? awayOnTarget : homeOnTarget;
  const userCorners = report.isHome ? homeCorners : awayCorners;
  const oppCorners = report.isHome ? awayCorners : homeCorners;

  const statsBlock = [
    "📊 <b>STATISTIKA</b>",
    `To‘p nazorati: <b>${userPoss}%</b> — ${oppPoss}%`,
    `Zarbalar: <b>${userShots}</b> — ${oppShots}`,
    `Aniq zarbalar: <b>${userOnTarget}</b> — ${oppOnTarget}`,
    `Burchaklar: <b>${userCorners}</b> — ${oppCorners}`,
  ].join("\n");

  const tableRows = (report.leagueTable ?? []).map((row) => {
    const marker = row.club === report.club ? "👉 " : "";
    const difference = row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference);
    return `${marker}${row.position}. ${escapeHtml(row.club)} · ${row.played}O · ${difference} · <b>${row.points}</b>`;
  });
  const leagueBlock = [
    "📈 <b>LIGA</b>",
    `🏆 <b>${escapeHtml(report.leagueName)}</b>`,
    `<b>${report.position}-o‘rin</b>`,
    `${report.points} ochko · ${report.wins}W ${report.draws}D ${report.losses}L`,
    ...(tableRows.length ? ["", ...tableRows] : []),
  ].join("\n");

  const incomeBlock = [
    "💰 <b>DAROMAD</b>",
    `Match: ${formatMoney(report.income)}`,
    `Balans: <b>${formatMoney(report.balance)}</b>`,
  ].join("\n");

  let nextBlock = "⏭ <b>KEYINGI O‘YIN</b>\n<i>Rejalashtirilgan o‘yin yo‘q.</i>";
  if (report.next) {
    const opp = report.isHome
      ? (report.next.home === report.club ? report.next.away : report.next.home)
      : (report.next.away === report.club ? report.next.home : report.next.away);
    const dateStr = formatDateTime(report.next.scheduledAt);
    nextBlock = `⏭ <b>KEYINGI O‘YIN</b>\nvs <b>${escapeHtml(opp)}</b>\n<i>${dateStr}</i>`;
  }

  return [
    statusLine,
    "",
    scoreLine,
    "",
    "⚽ <b>GOLLAR</b>",
    goalsList,
    "",
    statsBlock,
    "",
    leagueBlock,
    "",
    incomeBlock,
    "",
    nextBlock,
  ].join("\n");
}
