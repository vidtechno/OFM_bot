import type { ManagedClub } from "./types.js";
import { escapeHtml, formatMoney, formatLobbyCountdown, competitionFlag } from "../lib/html.js";

export { formatMoney, formatLobbyCountdown };

export function formatClubDashboard(
  club: ManagedClub,
  managerName: string,
  nextMatchSnippet?: string,
  teamOvr?: number
): string {
  const ovr = teamOvr ?? club.teamOvr ?? 80;

  const lines: string[] = [
    `🏟 <b>${escapeHtml(club.clubName.toUpperCase())}</b>`,
    "",
    `🏆 <i>${escapeHtml(club.leagueName)}</i>`,
    `📍 <b>${club.position}-o‘rin</b>`,
    `⭐ Jamoa OVR: <b>${ovr}</b>`,
    "",
    `💰 Transfer budjeti: <b>${formatMoney(club.budget)}</b>`,
    "",
    "⏭ <b>Keyingi o‘yin</b>",
    nextMatchSnippet ?? "<i>Rejalashtirilgan o‘yin yo‘q.</i>",
  ];

  return lines.join("\n");
}

export function claimErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("CLUB_ALREADY_CLAIMED")) {
    return "❌ <b>Klub band qilingan</b>\n<i>Bu klubni boshqa manager olib bo‘ldi. Boshqa klub tanlang.</i>";
  }
  if (message.includes("MAX_TOURNAMENT_LIMIT_REACHED")) {
    return "❌ <b>Turnir limiti to‘lgan</b>\n<i>Siz allaqachon maksimal 2 ta turnirda ishtirok etyapsiz. Yangi klub tanlash uchun mavjud ligalaringizdan biridan chiqing.</i>";
  }
  if (message.includes("ALREADY_IN_THIS_LEAGUE") || message.includes("COMPETITION_LIMIT_REACHED")) {
    return "❌ <b>Cheklov mavjud</b>\n<i>Siz ushbu liga instansiyasida allaqachon klub boshqaryapsiz.</i>";
  }
  if (message.includes("PREVIOUSLY_DEPARTED_THIS_LEAGUE")) {
    return "❌ <b>Qayta kirish taqiqlangan</b>\n<i>Siz ushbu faol ligadan avvalroq chiqqansiz. Qayta qo‘shilish imkonsiz. Yangi mavsumni kuting.</i>";
  }
  if (message.includes("LEAGUE_NOT_ACTIVE")) {
    return "❌ <b>Liga faol emas</b>\n<i>Ushbu liga hozirda faol emas.</i>";
  }
  if (message.includes("LEAGUE_PRE_SEASON_LOCKED")) {
    return "⏳ <b>Liga hali boshlanmagan</b>\n<i>Transferlar liga startidan keyin ochiladi.</i>";
  }
  return "❌ <b>Amal bajarilmadi</b>\n<i>Qayta urinib ko‘ring.</i>";
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
    const flag = competitionFlag(lobby.competitionCode);
    const statusText = lobby.status === "OPEN" ? "🟢 <i>Qabul ochiq</i>" : "⚡ <i>Faol liga</i>";
    const countdown = formatLobbyCountdown(lobby.registrationClosesAt);
    const countdownLine = countdown.includes("Liga boshlanmoqda")
      ? `⏳ ${countdown}`
      : `⏳ Boshlanishiga: ${countdown}`;

    lines.push(
      `${flag} <b>${escapeHtml(lobby.competitionName)}</b>`,
      statusText,
      `👤 ${lobby.humanCount}/${lobby.maxClubs} manager`,
      countdownLine,
      ""
    );
  }

  lines.push("📌 <b>MENING LIGALARIM</b>", "");
  if (managedClubs.length === 0) {
    lines.push("<i>Hozircha faol turniringiz yo‘q.</i>", "");
  } else {
    for (const mc of managedClubs) {
      lines.push(
        `⚽ <b>${escapeHtml(mc.clubName)}</b>`,
        `<i>${escapeHtml(mc.leagueName)}</i>`,
        ""
      );
    }
  }

  lines.push(`🎮 Faol turnirlar: <b>${managedClubs.length}/2</b>`);

  return lines.join("\n").trim();
}
