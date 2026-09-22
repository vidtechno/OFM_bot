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

interface TashkentParts {
  day: number;
  month: string;
  hours: string;
  minutes: string;
  isToday: boolean;
  isTomorrow: boolean;
}

function getTashkentParts(dateInput: string | Date): TashkentParts {
  const d = new Date(dateInput);
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(d).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const nowFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const targetDateFormatted = nowFormatter.format(d);
  const nowDateFormatted = nowFormatter.format(now);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const tomorrowDateFormatted = nowFormatter.format(tomorrow);

  return {
    day: Number(parts.day ?? 1),
    month: parts.month ?? "",
    hours: parts.hour ?? "00",
    minutes: parts.minute ?? "00",
    isToday: targetDateFormatted === nowDateFormatted,
    isTomorrow: targetDateFormatted === tomorrowDateFormatted,
  };
}

export function formatDateTime(dateInput: string | Date): string {
  const p = getTashkentParts(dateInput);
  return `${p.day} ${p.month} · ${p.hours}:${p.minutes}`;
}

export function formatFixtureDate(dateInput: string | Date): string {
  const p = getTashkentParts(dateInput);
  if (p.isToday) {
    return `Bugun · ${p.hours}:${p.minutes}`;
  }
  if (p.isTomorrow) {
    return `Ertaga · ${p.hours}:${p.minutes}`;
  }
  return `${p.day} ${p.month} · ${p.hours}:${p.minutes}`;
}

export function formatMatchPreviewDate(dateInput: string | Date): string {
  const p = getTashkentParts(dateInput);
  if (p.isToday) {
    return `Bugun, ${p.day} ${p.month} · ${p.hours}:${p.minutes}`;
  }
  if (p.isTomorrow) {
    return `Ertaga, ${p.day} ${p.month} · ${p.hours}:${p.minutes}`;
  }
  return `${p.day} ${p.month} · ${p.hours}:${p.minutes}`;
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
