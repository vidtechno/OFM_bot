import type { ManagerProfile, Sponsor } from "./progression.repository.js";
import type { ManagedClub } from "../leagues/types.js";
import { escapeHtml, formatMoney } from "../lib/html.js";

export function formatProfile(p: ManagerProfile, clubs: ManagedClub[] = []): string {
  const managerName = p.username ? `@${p.username}` : p.name;
  const totalMatches = p.matches || (p.wins + p.draws + p.losses);
  const winRate = totalMatches > 0 ? Math.round((p.wins / totalMatches) * 100) : 0;

  const lines: string[] = [
    "👤 <b>MANAGER PROFILI</b>",
    "",
    `<b>${escapeHtml(managerName)}</b>`,
    `⭐ Reyting: <b>${p.rating.toLocaleString("en-US")}</b>`,
    "",
    `🎮 Mavsumlar: ${p.seasons}`,
    `🏆 Chempionlik: <b>${p.titles}</b>`,
    "",
    "📊 <b>KARYERA</b>",
    `W ${p.wins} · D ${p.draws} · L ${p.losses}`,
    `Win rate: <b>${winRate}%</b>`,
  ];

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

export function formatLeaderboard(rows: ManagerProfile[]): string {
  if (!rows.length) {
    return "🏆 <b>GLOBAL REYTING</b>\n\n<i>Reyting yozuvlari topilmadi.</i>";
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines: string[] = ["🏆 <b>GLOBAL REYTING</b>", ""];
  rows.slice(0, 10).forEach((p, i) => {
    const medal = medals[i] ?? `${i + 1}.`;
    const name = p.username ? `@${p.username}` : p.name;
    lines.push(`${medal} <b>${escapeHtml(name)}</b> — ⭐<b>${p.rating}</b> <i>(${p.wins}W)</i>`);
  });
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
