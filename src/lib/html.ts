/**
 * UI / Presentation HTML and typography formatters for Telegram Bot.
 * All user and dynamic inputs must be escaped with escapeHtml().
 */

export function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatMoney(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    const val = amount / 1_000_000;
    const formatted = val % 1 === 0 ? val.toFixed(0) : val.toFixed(1);
    return `€${formatted}M`;
  }
  if (abs >= 1_000) {
    const val = amount / 1_000;
    const formatted = val % 1 === 0 ? val.toFixed(0) : val.toFixed(1);
    return `€${formatted}K`;
  }
  return `€${amount}`;
}

export function formatLobbyCountdown(targetDate: string | Date | null): string {
  if (!targetDate) return "<b>Liga boshlanmoqda...</b>";
  const diffMs = new Date(targetDate).getTime() - Date.now();
  if (diffMs <= 0) return "<b>Liga boshlanmoqda...</b>";

  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `<b>${hours}</b> soat <b>${minutes}</b> daqiqa qoldi`;
  }
  if (hours > 0 && minutes === 0) {
    return `<b>${hours}</b> soat qoldi`;
  }
  if (hours === 0 && minutes > 0) {
    return `<b>${minutes}</b> daqiqa qoldi`;
  }
  return "<b>Liga boshlanmoqda...</b>";
}

export function formatDateTime(dateInput: string | Date): string {
  const d = new Date(dateInput);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // Use Tashkent time offset (+05:00)
  const utc = d.getTime() + d.getTimezoneOffset() * 60_000;
  const uzTime = new Date(utc + 5 * 3_600_000);
  const day = uzTime.getDate();
  const month = months[uzTime.getMonth()];
  const hours = String(uzTime.getHours()).padStart(2, "0");
  const minutes = String(uzTime.getMinutes()).padStart(2, "0");
  return `${day} ${month} · ${hours}:${minutes}`;
}

export function formatFixtureDate(dateInput: string | Date): string {
  const d = new Date(dateInput);
  const now = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60_000;
  const uzTime = new Date(utc + 5 * 3_600_000);

  const utcNow = now.getTime() + now.getTimezoneOffset() * 60_000;
  const uzNow = new Date(utcNow + 5 * 3_600_000);

  const isToday =
    uzTime.getDate() === uzNow.getDate() &&
    uzTime.getMonth() === uzNow.getMonth() &&
    uzTime.getFullYear() === uzNow.getFullYear();

  const hours = String(uzTime.getHours()).padStart(2, "0");
  const minutes = String(uzTime.getMinutes()).padStart(2, "0");

  if (isToday) {
    return `Bugun · ${hours}:${minutes}`;
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${uzTime.getDate()} ${months[uzTime.getMonth()]} · ${hours}:${minutes}`;
}

export function competitionFlag(code: string | null | undefined): string {
  if (!code) return "🏆";
  const upper = code.toUpperCase();
  if (upper === "UZB") return "🇺🇿";
  if (upper === "ELITE") return "🇪🇺";
  if (upper === "LALIGA") return "🇪🇸";
  if (upper === "PL") return "🏴";
  return "🏆";
}

export function formatCompetitionName(code: string | null | undefined, fallbackName?: string): string {
  if (!code) return fallbackName ?? "";
  const upper = code.toUpperCase();
  if (upper === "UZB") return "O‘zbekiston Superligasi";
  if (upper === "ELITE") return "OFM Elite League";
  return fallbackName ?? code;
}

export function formatLeagueNumber(instanceNumber: number): string {
  return `#${String(instanceNumber).padStart(4, "0")}`;
}

export function positionGroupLabel(group: string): string {
  switch (group) {
    case "GK": return "Darvozabon";
    case "DEF": return "Himoyachi";
    case "MID": return "Yarim himoyachi";
    case "ATT": return "Hujumchi";
    default: return "Barchasi";
  }
}

export function positionGroupPluralLabel(group: string): string {
  switch (group) {
    case "GK": return "Darvozabonlar";
    case "DEF": return "Himoyachilar";
    case "MID": return "Yarim himoyachilar";
    case "ATT": return "Hujumchilar";
    default: return "Barchasi";
  }
}

export const htmlEscape = escapeHtml;
export const formatCountdown = formatLobbyCountdown;
