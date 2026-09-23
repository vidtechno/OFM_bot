import type { GlobalLeaderboardEntry, LeaderboardPeriod, ManagerHonour, ManagerProfile, SeasonHistoryEntry, Sponsor, TrophySummary } from "./progression.repository.js";
import type { ManagedClub } from "../leagues/types.js";
import { escapeHtml, formatMoney } from "../lib/html.js";

export function formatProfile(p: ManagerProfile, clubs: ManagedClub[] = []): string {
  const displayName = p.username ? `@${p.username}` : (p.name || "Manager");
  const xp = p.xp ?? 0;
  const globalRank = p.globalRank ?? 1;
  const winRate = p.matches > 0 ? Math.round((p.wins / p.matches) * 100) : 0;

  const lines: string[] = [
    "👤 <b>MANAGER PROFILI</b>",
    "",
    `<b>${escapeHtml(displayName)}</b>`,
    "",
    `⭐ XP: <b>${xp.toLocaleString("en-US")}</b>`,
    `🌍 Global reyting: <b>#${globalRank}</b>`,
  ];

  if (p.rating !== undefined) {
    lines.push(`⭐ Reyting: <b>${p.rating.toLocaleString("en-US")}</b>`);
  }
  if (p.seasons !== undefined) {
    lines.push(`🎮 Mavsumlar: ${p.seasons}`);
  }

  lines.push(
    "",
    "📊 <b>KARYERA</b>",
    `W ${p.wins} · D ${p.draws} · L ${p.losses}`,
    `Win rate: <b>${winRate}%</b>`,
    "",
    `🔥 G‘alaba seriyasi: <b>${p.currentWinStreak ?? 0}</b>`,
    `🛡 Mag‘lubiyatsiz: <b>${p.currentUnbeatenStreak ?? 0}</b>`,
    `🏅 Rekord seriya: <b>${p.bestWinStreak ?? 0}</b>`,
    "",
    `🏆 Chempionlik: <b>${p.titles}</b>`
  );

  if (clubs.length > 0) {
    lines.push("", "🏟 <b>KLUBLARIM</b>");
    for (const club of clubs) {
      lines.push(
        `⚽ <b>${escapeHtml(club.clubName)}</b>`,
        `<i>${escapeHtml(club.leagueName)} · ${club.points} ochko</i>`
      );
    }
  }

  return lines.join("\n");
}

export function formatGlobalLeaderboard(
  rows: GlobalLeaderboardEntry[],
  userRank: number,
  userXp: number
): string {
  if (!rows.length) {
    return "🌍 <b>GLOBAL REYTING</b>\n\n<i>Reyting yozuvlari topilmadi.</i>";
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines: string[] = ["🌍 <b>GLOBAL REYTING</b>", ""];

  rows.slice(0, 10).forEach((entry, idx) => {
    const medal = medals[idx] ?? `${idx + 1}.`;
    const label = entry.username ? `@${entry.username}` : entry.name;
    lines.push(`${medal} ${escapeHtml(label)} — ⭐ <b>${entry.xp.toLocaleString("en-US")} XP</b>`);
  });

  lines.push("", "────────────────", "");
  lines.push(`📍 Siz: <b>#${userRank}</b>`);
  lines.push(`⭐ <b>${userXp.toLocaleString("en-US")} XP</b>`);

  return lines.join("\n");
}

export function formatLeaderboardHub(): string {
  return "🌍 <b>MANAGER REYTINGI</b>\n\n<i>Davrni tanlang:</i>";
}

export function formatPeriodLeaderboard(
  period: LeaderboardPeriod,
  rows: GlobalLeaderboardEntry[],
  userRank: number,
  userXp: number
): string {
  const title = period === "DAILY" ? "📅 BUGUNGI TOP" : period === "WEEKLY" ? "📆 HAFTALIK TOP" : "🌍 ALL-TIME TOP";
  const lines = [`${title.split(" ")[0]} <b>${title.slice(title.indexOf(" ") + 1)}</b>`, ""];
  const medals = ["🥇", "🥈", "🥉"];
  rows.forEach((entry, idx) => {
    const label = entry.username ? `@${entry.username}` : entry.name;
    lines.push(`${medals[idx] ?? `${entry.rank}.`} ${escapeHtml(label)} — <b>+${entry.xp} XP</b>`);
  });
  if (!rows.length) lines.push("<i>Hozircha natija yo‘q.</i>");
  if (userRank > 0 && !rows.some((row) => row.rank === userRank)) lines.push("", `Siz: <b>#${userRank}</b> · +${userXp} XP`);
  return lines.join("\n");
}

export function formatTrophyCabinet(summary: TrophySummary): string {
  const lines = ["🏆 <b>SOVRINLARIM</b>", ""];
  for (const item of summary.byCompetition) lines.push(`🥇 ${escapeHtml(item.competitionName)} Champion ×${item.champions}`);
  if (summary.runnerUps) lines.push(`🥈 Runner-up ×${summary.runnerUps}`);
  if (summary.thirdPlaces) lines.push(`🥉 3-o‘rin ×${summary.thirdPlaces}`);
  if (!summary.champions && !summary.runnerUps && !summary.thirdPlaces) lines.push("<i>Hozircha sovrin yo‘q.</i>");
  lines.push("", `Jami mavsumlar: <b>${summary.seasons}</b>`);
  return lines.join("\n");
}

export function formatSeasonHistory(rows: SeasonHistoryEntry[]): string {
  if (!rows.length) return "📚 <b>MAVSUMLAR TARIXI</b>\n\n<i>Hozircha yakunlangan mavsum yo‘q.</i>";
  const lines = ["📚 <b>MAVSUMLAR TARIXI</b>", ""];
  rows.forEach((row, i) => {
    const medal = row.finalPosition === 1 ? "🥇" : row.finalPosition === 2 ? "🥈" : row.finalPosition === 3 ? "🥉" : "⚽";
    lines.push(`${i + 1}. ${medal} <b>${escapeHtml(row.clubName)}</b>`, `   ${escapeHtml(row.competitionName)} #${String(row.instanceNumber).padStart(4, "0")}`, `   ${row.finalPosition}-o‘rin · ${row.points} pts · ${row.wins}-${row.draws}-${row.losses}`, "");
  });
  return lines.join("\n").trim();
}

export function formatSeasonDetail(row: SeasonHistoryEntry): string {
  return [
    "📚 <b>MAVSUM NATIJASI</b>", "",
    `🏟 <b>${escapeHtml(row.clubName)}</b>`,
    `${escapeHtml(row.competitionName)} #${String(row.instanceNumber).padStart(4, "0")}`, "",
    `🏅 Yakuniy o‘rin: <b>${row.finalPosition}</b>`,
    `🎮 O‘yinlar: ${row.played}`,
    `✅ ${row.wins} · 🤝 ${row.draws} · ❌ ${row.losses}`,
    `⚽ Gollar: ${row.goalsFor}–${row.goalsAgainst} (${row.goalDifference >= 0 ? "+" : ""}${row.goalDifference})`,
    `📊 Ochko: <b>${row.points}</b>`,
    `⭐ Mavsum XP: <b>+${row.seasonXpEarned}</b>`,
  ].join("\n");
}

// Backward compatibility alias for existing tests
export function formatLeaderboard(rows: ManagerProfile[]): string {
  if (!rows.length) {
    return "🏆 <b>GLOBAL REYTING</b>\n\n<i>Reyting yozuvlari topilmadi.</i>";
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines: string[] = ["🏆 <b>GLOBAL REYTING</b>", ""];
  rows.slice(0, 10).forEach((p, i) => {
    const medal = medals[i] ?? `${i + 1}.`;
    const name = p.username ? `@${p.username}` : p.name;
    const xpOrRating = p.xp !== undefined && p.xp > 0 ? `${p.xp} XP` : `${p.rating}`;
    lines.push(`${medal} <b>${escapeHtml(name)}</b> — ⭐<b>${xpOrRating}</b> <i>(${p.wins}W)</i>`);
  });
  return lines.join("\n");
}

export function formatHonours(honours: ManagerHonour[]): string {
  if (!honours.length) {
    return "🏆 <b>MANAGER SOVRINLARI</b>\n\n<i>Hozircha sovrinlar mavjud emas.</i>";
  }

  const lines: string[] = ["🏆 <b>MANAGER SOVRINLARI</b>", ""];
  for (const h of honours) {
    const icon =
      h.honourType === "CHAMPION"
        ? "🏆"
        : h.honourType === "RUNNER_UP"
        ? "🥈"
        : h.honourType === "THIRD_PLACE"
        ? "🥉"
        : h.honourType === "BEST_ATTACK"
        ? "⚔️"
        : h.honourType === "BEST_DEFENSE"
        ? "🛡"
        : "🏅";
    lines.push(`${icon} ${escapeHtml(h.title)}`);
  }
  return lines.join("\n");
}

export function formatSponsors(rows: Sponsor[]): string {
  if (!rows.length) {
    return "💰 <b>HOMIYLAR</b>\n\n<i>Mavjud homiylar yo‘q.</i>";
  }

  const lines: string[] = ["💰 <b>HOMIYLAR</b>", ""];
  rows.forEach((s, i) => {
    lines.push(
      `${i + 1}. <b>${escapeHtml(s.name)}</b> — <b>${formatMoney(s.payment)}</b>/o‘yin`,
      s.channelId ? "   <i>Kanal a’zoligi talab qilinadi</i>" : "",
      ""
    );
  });
  return lines.join("\n").trim();
}
