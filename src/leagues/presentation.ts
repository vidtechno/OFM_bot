import type { ManagedClub } from "./types.js";

export function formatMoney(amount: number): string {
  return `€${(amount / 1_000_000).toFixed(1)}M`;
}

export function formatClubDashboard(club: ManagedClub, managerName: string, nextMatch?: string): string {
  return [
    club.clubName.toUpperCase(),
    "",
    `👔 Murabbiy: ${managerName}`,
    `🏆 Liga: ${club.leagueName}`,
    `📊 O‘rin: ${club.position}`,
    `🎯 Ochko: ${club.points}`,
    `💰 Budjet: ${formatMoney(club.budget)}`,
    "",
    "📅 KEYINGI UCHRASHUV",
    nextMatch ?? "Rejalashtirilgan o‘yin yo‘q.",
  ].join("\n");
}

export function claimErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("CLUB_ALREADY_CLAIMED")) return "Bu klubni boshqa manager olib bo‘ldi. Boshqa klub tanlang.";
  if (message.includes("COMPETITION_LIMIT_REACHED")) return "Siz bu competitionda allaqachon klub boshqaryapsiz.";
  if (message.includes("LEAGUE_NOT_ACTIVE")) return "Bu liga hozir faol emas.";
  if (message.includes("LEAGUE_PRE_SEASON_LOCKED")) return "⏳ Ushbu liga hali boshlanmagan (pre-season). Barcha transferlar liga startidan keyin ochiladi.";
  return "Klubni olishda xato yuz berdi. Qayta urinib ko‘ring.";
}

export function formatLobbyCountdown(targetDate: string | null): string {
  if (!targetDate) return "Tez orada";
  const diffMs = new Date(targetDate).getTime() - Date.now();
  if (diffMs <= 0) return "Boshlanmoqda…";
  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
  const lines: string[] = ["🏆 LIGALAR", ""];

  for (const lobby of lobbies) {
    const flag = lobby.competitionCode === "LALIGA" ? "🇪🇸" : "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
    const statusText = lobby.status === "OPEN" ? "🟢 Qabul ochiq" : "⚡ Faol liga";
    const countdown = formatLobbyCountdown(lobby.registrationClosesAt);

    lines.push(
      `${flag} ${lobby.competitionName}`,
      statusText,
      `👤 ${lobby.humanCount}/${lobby.maxClubs} manager`,
      `⏳ Boshlanishiga: ${countdown}`,
      ""
    );
  }

  if (managedClubs.length > 0) {
    lines.push("📌 MENING LIGALARIM", "");
    for (const mc of managedClubs) {
      lines.push(`${mc.clubName} — ${mc.leagueName}`);
    }
  }

  return lines.join("\n").trim();
}
