import type { MarketPlayer, TransferTarget, TransferHistoryItem } from "./transfer.repository.js";

export const transferMoney = (n: number) => `€${(n / 1_000_000).toFixed(1)}M`;

export function formatTransferHub(clubName: string, budget: number, cash: number): string {
  return [
    `🔁 ${clubName.toUpperCase()} — TRANSFER`,
    "",
    `💰 Transfer budjeti: ${transferMoney(budget)}`,
    `🏦 G‘azna: ${transferMoney(cash)}`,
    "",
    "Kerakli bo‘limni tanlang:",
  ].join("\n");
}

export function formatClubPlayers(
  clubName: string,
  players: TransferTarget[],
  page = 0,
  total = players.length
): string {
  if (!players.length) {
    return `🏟 ${clubName.toUpperCase()} — FUTBOLCHILAR\n\nBu klubda transferga ochiq futbolchi topilmadi.`;
  }
  const lines = [
    `🏟 ${clubName.toUpperCase()} — FUTBOLCHILAR`,
    `📋 ${total} nafar futbolchi`,
    "",
  ];
  players.forEach((p, idx) => {
    lines.push(`${idx + 1}. ${p.name} — ${p.position} — ⭐${p.overall} — ${transferMoney(p.marketValue)}`);
  });
  return lines.join("\n");
}

export function formatPlayerProfile(p: TransferTarget & { age?: number; nationality?: string }): string {
  return [
    "👤 FUTBOLCHI PROFILI",
    "",
    `⚽ ${p.name}`,
    `🏟 Joriy klub: ${p.clubName}`,
    `⭐ Overall: ${p.overall}`,
    `📍 Amplua: ${p.position}`,
    p.age ? `🎂 Yoshi: ${p.age} yosh` : "",
    p.nationality ? `🌍 Millati: ${p.nationality}` : "",
    `💰 Bozor qiymati: ${transferMoney(p.marketValue)}`,
    "",
    "Taklif summasini tanlang:",
  ].filter(Boolean).join("\n");
}

export function formatMarket(players: MarketPlayer[]): string {
  return players.length
    ? [
        "🌍 GLOBAL TRANSFER MARKET",
        "",
        ...players.map(
          (p, i) =>
            `${i + 1}. ${p.name} (${p.sellerName ?? "Global"}) — ${p.position} — ⭐${p.overall} — ${transferMoney(p.askingPrice)}`
        ),
      ].join("\n")
    : "🌍 GLOBAL TRANSFER MARKET\n\nHozir faol listing yo‘q.";
}

export function formatLeagueMarket(players: MarketPlayer[]): string {
  return players.length
    ? [
        "🛒 LIGA TRANSFER BOZORI",
        "",
        ...players.map(
          (p, i) =>
            `${i + 1}. ${p.name} (${p.sellerName ?? "Klub"}) — ${p.position} — ⭐${p.overall} — ${transferMoney(p.askingPrice)}${p.isOwnListing ? " 🏷 [Sizniki]" : ""}`
        ),
      ].join("\n")
    : "🛒 LIGA TRANSFER BOZORI\n\nHozirda ushbu ligada sotuvga qo‘yilgan futbolchilar yo‘q.\nKlubingiz futbolchisini sotuvga qo‘yish uchun «📤 Futbolchi sotish» bo‘limidan foydalaning.";
}

export function formatListing(p: MarketPlayer): string {
  return [
    "🌍 GLOBAL TRANSFER",
    "",
    `⚽ ${p.name}`,
    `🏟 Klub: ${p.sellerName ?? "Global Market"}`,
    `📍 ${p.position} · ⭐${p.overall} · ${p.age} yosh`,
    `💰 Narxi: ${transferMoney(p.askingPrice)}`,
    "",
    "Xarid darhol amalga oshadi va futbolchi klubingiz tarkibiga qo‘shiladi.",
  ].join("\n");
}

export function formatLeagueListing(p: MarketPlayer): string {
  return [
    "🛒 LIGA TRANSFERI",
    "",
    `⚽ ${p.name}`,
    `🏟 Sotuvchi klub: ${p.sellerName ?? "Liga klubi"}`,
    `📍 Amplua: ${p.position}`,
    `⭐ Mahorat: ⭐${p.overall}`,
    `🎂 Yoshi: ${p.age} yosh`,
    `💰 Narxi: ${transferMoney(p.askingPrice)}`,
    "",
    p.isOwnListing
      ? "ℹ️ Bu sizning sotuvga qo‘ygan futbolchingiz."
      : "Xarid amalga oshgach, mablag‘ sotuvchi klubga o‘tkaziladi va futbolchi tarkibingizga qo‘shiladi.",
  ].join("\n");
}

export function formatTransferHistory(history: TransferHistoryItem[]): string {
  if (!history.length) {
    return "📜 TRANSFER TARIXI\n\nHozircha yakunlangan transferlar mavjud emas.";
  }
  const lines = ["📜 TRANSFER TARIXI", ""];
  for (const item of history) {
    const icon = item.type === "INCOMING" ? "🟢 Xarid" : "🔴 Sotuv";
    const dateStr = new Date(item.date).toLocaleDateString("uz-UZ");
    lines.push(`${icon}: ${item.playerName} (${transferMoney(item.fee)})`);
    lines.push(`   ${item.fromClub} ➔ ${item.toClub} · ${dateStr}`);
  }
  return lines.join("\n");
}
