import type { ManagedClub } from "./types.js";
import { escapeHtml, formatMoney, formatLobbyCountdown } from "../lib/html.js";

export { formatMoney, formatLobbyCountdown };

export function formatClubDashboard(
  club: ManagedClub,
  managerName: string,
  nextMatchSnippet?: string,
  teamOvr?: number,
  cashBalance?: number
): string {
  const ovr = teamOvr ?? club.teamOvr ?? 80;
  const cash = cashBalance ?? club.cash ?? club.budget;

  const lines: string[] = [
    `🏟 <b>${escapeHtml(club.clubName.toUpperCase())}</b>`,
    "",
    `👤 Manager: <b>${escapeHtml(managerName)}</b>`,
    `🏆 ${escapeHtml(club.leagueName)}`,
    `📍 <b>${club.position}-o‘rin</b>`,
    `⭐ Jamoa OVR: <b>${ovr}</b>`,
    "",
    `💰 Transfer budjeti: <b>${formatMoney(club.budget)}</b>`,
    `🏦 G‘azna: <b>${formatMoney(cash)}</b>`,
    "",
    "⏭ Keyingi o‘yin",
    nextMatchSnippet ?? "<i>Rejalashtirilgan o‘yin yo‘q.</i>",
  ];

  return lines.join("\n");
}

export function claimErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("CLUB_ALREADY_CLAIMED")) {
    return "❌ <b>Klub band qilingan</b>\n<i>Bu klubni boshqa manager olib bo‘ldi. Boshqa klub tanlang.</i>";
  }
  if (message.includes("COMPETITION_LIMIT_REACHED")) {
    return "❌ <b>Cheklov mavjud</b>\n<i>Siz bu ligada allaqachon klub boshqaryapsiz.</i>";
  }
  if (message.includes("LEAGUE_NOT_ACTIVE")) {
    return "❌ <b>Liga faol emas</b>\n<i>Ushbu liga hozirda faol emas.</i>";
  }
  if (message.includes("LEAGUE_PRE_SEASON_LOCKED")) {
    return "⏳ <b>Liga hali boshlanmagan</b>\n<i>Transferlar liga startidan keyin ochiladi.</i>";
  }
  return "❌ <b>Xatolik yuz berdi</b>\n<i>Klubni olishda xatolik yuz berdi. Qayta urinib ko‘ring.</i>";
}

export function formatOpenLobbies(
  lobbies: Array<{
    competitionCode: string;
    competitionName: string;
    instanceNumber: number;
    humanCount: number;
    maxClubs: number;
    registrationClosesAt: string | null;
    status: string;
  }>,
  managedClubs: ManagedClub[]
): string {
  const lines: string[] = ["🏆 <b>LIGALAR</b>", ""];

  for (const lobby of lobbies) {
    const flag = lobby.competitionCode === "LALIGA" ? "🇪🇸" : "🏴";
    const statusText = lobby.status === "OPEN" ? "🟢 <i>Qabul ochiq</i>" : "⚡ <i>Faol liga</i>";
    const countdown = formatLobbyCountdown(lobby.registrationClosesAt);

    lines.push(
      `${flag} <b>${escapeHtml(lobby.competitionName)}</b>`,
      statusText,
      `👤 ${lobby.humanCount}/${lobby.maxClubs} manager`,
      `⏳ Boshlanishiga: ${countdown}`,
      ""
    );
  }

  if (managedClubs.length > 0) {
    lines.push("📌 <b>MENING LIGALARIM</b>", "");
    for (const mc of managedClubs) {
      lines.push(
        `⚽ <b>${escapeHtml(mc.clubName)}</b>`,
        `<i>${escapeHtml(mc.leagueName)}</i>`,
        ""
      );
    }
  }

  return lines.join("\n").trim();
}
