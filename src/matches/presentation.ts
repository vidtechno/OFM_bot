import type { FinanceSummary, MatchOwnerReport, MatchResult, PlayerLeader, TableRow } from "./match.repository.js";
import { escapeHtml, formatMoney, formatDateTime } from "../lib/html.js";

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
    lines.push(`${medal} ${escapeHtml(l.name)} — <b>${l.total}</b>`);
  });
  return lines.join("\n");
}

export function formatFinances(summary: FinanceSummary): string {
  return [
    "💰 <b>KLUB MOLIYASI</b>",
    "",
    `🏦 Hisobdagi mablag‘: <b>${formatMoney(summary.cashBalance)}</b>`,
    `💰 Transfer budjeti: <b>${formatMoney(summary.transferBudget)}</b>`,
    "",
    "🧾 <b>SO‘NGGI OPERATSIYALAR</b>",
    ...(summary.transactions.length
      ? summary.transactions.map(
          (t) =>
            `${t.amount >= 0 ? "🟢 +" : "🔴 -"}${formatMoney(Math.abs(t.amount))} · <i>${escapeHtml(t.description)}</i>`
        )
      : ["<i>Hozircha moliyaviy operatsiya yo‘q.</i>"]),
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
        .map((g) => `${g.minute}' ${escapeHtml(g.player)}${g.assist ? ` <i>(${escapeHtml(g.assist)})</i>` : ""}`)
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

  const leagueBlock = [
    "📈 <b>LIGA</b>",
    `<b>${report.position}-o‘rin</b>`,
    `${report.points} ochko · ${report.wins}W ${report.draws}D ${report.losses}L`,
  ].join("\n");

  const incomeBlock = [
    "💰 <b>DAROMAD</b>",
    `Match: ${formatMoney(report.income)}`,
    `Jami: <b>${formatMoney(report.income)}</b>`,
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
