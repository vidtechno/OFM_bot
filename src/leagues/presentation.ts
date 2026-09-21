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
  return "Klubni olishda xato yuz berdi. Qayta urinib ko‘ring.";
}
