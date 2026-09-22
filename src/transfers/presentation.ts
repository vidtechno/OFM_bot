import type { MarketPlayer, TransferTarget, TransferHistoryItem } from "./transfer.repository.js";
import { escapeHtml, formatMoney, formatDateTime, positionGroupPluralLabel } from "../lib/html.js";

export const transferMoney = formatMoney;

export function formatTransferHub(
  clubName: string,
  budget: number,
  cash: number,
  reservedBudget = 0
): string {
  const available = Math.max(0, budget - reservedBudget);
  return [
    `🔁 <b>${escapeHtml(clubName.toUpperCase())} — TRANSFER</b>`,
    "",
    `💰 Budjet: <b>${formatMoney(budget)}</b>`,
    `🔒 Band: <b>${formatMoney(reservedBudget)}</b>`,
    `✅ Mavjud: <b>${formatMoney(available)}</b>`,
    "",
    "<i>Kerakli bo‘limni tanlang.</i>",
  ].join("\n");
}

export function formatClubPlayers(
  clubName: string,
  players: TransferTarget[],
  page = 0,
  total = players.length
): string {
  if (!players.length) {
    return `🏟 <b>${escapeHtml(clubName.toUpperCase())} — FUTBOLCHILAR</b>\n\n<i>Bu klubda transferga ochiq futbolchi topilmadi.</i>`;
  }
  const lines = [
    `🏟 <b>${escapeHtml(clubName.toUpperCase())} — FUTBOLCHILAR</b>`,
    `📋 <b>${total}</b> futbolchi`,
    "",
  ];
  players.forEach((p, idx) => {
    lines.push(
      `${idx + 1}. <b>${escapeHtml(p.name)}</b>`,
      `${escapeHtml(p.position)} · ⭐${p.overall} · ${formatMoney(p.marketValue)}`,
      ""
    );
  });
  return lines.join("\n").trim();
}

export function formatPlayerProfile(
  p: TransferTarget & { age?: number; nationality?: string; managerType?: string; activeNegotiationText?: string }
): string {
  const lines: string[] = [
    `👤 <b>${escapeHtml(p.name.toUpperCase())}</b>`,
    "",
    `🏟 ${escapeHtml(p.clubName)}`,
    `📍 ${escapeHtml(p.position)}`,
    `⭐ OVR: <b>${p.overall}</b>`,
    p.age ? `🎂 Yosh: <b>${p.age}</b>` : "",
    p.nationality ? `🌍 Millati: <i>${escapeHtml(p.nationality)}</i>` : "",
    `💶 Bozor qiymati: <b>${formatMoney(p.marketValue)}</b>`,
    "",
    `<i>Manager: ${escapeHtml(p.managerType ?? "AI")}</i>`,
  ].filter(Boolean);

  if (p.activeNegotiationText) {
    lines.push("", p.activeNegotiationText);
  }

  return lines.join("\n");
}

export function formatIncomingOffer(buyerClub: string, playerName: string, offerAmount: number): string {
  return [
    "📥 <b>TRANSFER TAKLIFI</b>",
    "",
    `<b>${escapeHtml(buyerClub)}</b>`,
    `sizning <b>${escapeHtml(playerName)}</b> futbolchingiz uchun`,
    "",
    `💶 <b>${formatMoney(offerAmount)}</b> taklif qildi.`,
  ].join("\n");
}

export function formatMarket(players: MarketPlayer[], leagueName?: string, group = "ALL"): string {
  const groupTitle = positionGroupPluralLabel(group);
  const lines: string[] = ["🛒 <b>GLOBAL TRANSFER BOZORI</b>"];
  if (leagueName) lines.push(`🏆 <i>${escapeHtml(leagueName)}</i>`);
  lines.push("", `📂 Bo‘lim: <b>${escapeHtml(groupTitle)}</b>`, "");

  if (!players.length) {
    lines.push(
      "<i>Hozircha transferga qo‘yilgan futbolchilar topilmadi.</i>",
      "",
      "Boshqa pozitsiyani tanlang yoki keyinroq qayta tekshiring."
    );
    return lines.join("\n").trim();
  }

  players.forEach((p, i) => {
    const posBadge = p.position === "GK" ? "🧤" : (["CB", "LB", "RB", "LWB", "RWB"].includes(p.position) ? "🛡" : (["CM", "CDM", "CAM", "LM", "RM"].includes(p.position) ? "🎯" : "⚡"));
    lines.push(
      `${i + 1}. <b>${escapeHtml(p.name)}</b>`,
      `${posBadge} ${escapeHtml(p.position)} · ⭐<b>${p.overall}</b>`,
      `🏟 ${escapeHtml(p.sellerName ?? "Global")}`,
      `💰 <b>${formatMoney(p.askingPrice)}</b>`,
      ""
    );
  });
  return lines.join("\n").trim();
}

export function formatLeagueMarket(players: MarketPlayer[], leagueName?: string, group = "ALL"): string {
  const groupTitle = positionGroupPluralLabel(group);
  const lines: string[] = ["🛒 <b>TRANSFER BOZORI</b>"];
  if (leagueName) lines.push(`🏆 <i>${escapeHtml(leagueName)}</i>`);
  lines.push("", `📂 Bo‘lim: <b>${escapeHtml(groupTitle)}</b>`, "");

  if (!players.length) {
    lines.push(
      "<i>Hozircha transferga qo‘yilgan futbolchilar topilmadi.</i>",
      "",
      "Boshqa pozitsiyani tanlang yoki keyinroq qayta tekshiring."
    );
    return lines.join("\n").trim();
  }

  players.forEach((p, i) => {
    const posBadge = p.position === "GK" ? "🧤" : (["CB", "LB", "RB", "LWB", "RWB"].includes(p.position) ? "🛡" : (["CM", "CDM", "CAM", "LM", "RM"].includes(p.position) ? "🎯" : "⚡"));
    lines.push(
      `${i + 1}. <b>${escapeHtml(p.name)}</b>`,
      `${posBadge} ${escapeHtml(p.position)} · ⭐<b>${p.overall}</b>`,
      `🏟 ${escapeHtml(p.sellerName ?? "Klub")}${p.isOwnListing ? " 🏷 <i>[Sizniki]</i>" : ""}`,
      `💰 <b>${formatMoney(p.askingPrice)}</b>`,
      ""
    );
  });
  return lines.join("\n").trim();
}

export function formatListing(p: MarketPlayer): string {
  return [
    "🌍 <b>GLOBAL TRANSFER</b>",
    "",
    `⚽ <b>${escapeHtml(p.name)}</b>`,
    `🏟 ${escapeHtml(p.sellerName ?? "Global Market")}`,
    `📍 ${escapeHtml(p.position)} · ⭐<b>${p.overall}</b> · ${p.age} yosh`,
    `💰 Narxi: <b>${formatMoney(p.askingPrice)}</b>`,
    "",
    "<i>Xarid darhol amalga oshadi va futbolchi klubingiz tarkibiga qo‘shiladi.</i>",
  ].join("\n");
}

export function formatLeagueListing(p: MarketPlayer): string {
  return [
    "🛒 <b>LIGA TRANSFERI</b>",
    "",
    `⚽ <b>${escapeHtml(p.name)}</b>`,
    `🏟 ${escapeHtml(p.sellerName ?? "Liga klubi")}`,
    `📍 Amplua: <b>${escapeHtml(p.position)}</b>`,
    `⭐ OVR: <b>${p.overall}</b>`,
    `🎂 Yoshi: <b>${p.age} yosh</b>`,
    `💰 Narxi: <b>${formatMoney(p.askingPrice)}</b>`,
    "",
    p.isOwnListing
      ? "ℹ️ <i>Bu sizning sotuvga qo‘ygan futbolchingiz.</i>"
      : "<i>Xarid amalga oshgach, mablag‘ sotuvchi klubga o‘tkaziladi va futbolchi tarkibingizga qo‘shiladi.</i>",
  ].join("\n");
}

export function formatTransferHistory(history: TransferHistoryItem[]): string {
  if (!history.length) {
    return "📜 <b>TRANSFER TARIXI</b>\n\n<i>Hozircha yakunlangan transferlar mavjud emas.</i>";
  }
  const lines = ["📜 <b>TRANSFER TARIXI</b>", ""];
  for (const item of history) {
    const icon = item.type === "INCOMING" ? "🟢" : "🔴";
    const action = item.type === "INCOMING" ? "Xarid" : "Sotuv";
    const dateStr = formatDateTime(item.date);
    lines.push(
      `${icon} <b>${escapeHtml(item.playerName)}</b> — <b>${formatMoney(item.fee)}</b>`,
      `<i>${action} · ${escapeHtml(item.fromClub)} ➔ ${escapeHtml(item.toClub)} · ${dateStr}</i>`,
      ""
    );
  }
  return lines.join("\n").trim();
}
