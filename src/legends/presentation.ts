import { escapeHtml } from "../lib/html.js";
import type {
  ClubLegendSummary,
  LegendCategory,
  LegendFulfillmentResult,
  LegendListingItem,
} from "./legend.types.js";

const CATEGORY_NAMES: Record<LegendCategory, { title: string; icon: string }> = {
  GK: { title: "DARVOZABONLAR", icon: "🧤" },
  DEF: { title: "HIMOYACHILAR", icon: "🛡" },
  MID: { title: "YARIM HIMOYACHILAR", icon: "🎯" },
  ATT: { title: "HUJUMCHILAR", icon: "⚡" },
};

export function formatLegendMenu(summary: ClubLegendSummary): string {
  const lines = [
    "👑 <b>LEGEND TRANSFERS</b>",
    "",
    "<i>Futbol tarixining eng buyuk afsonalarini jamoangizga olib keling!</i>",
    "",
    "✨ <b>Jami 41 ta afsonaviy futbolchi</b>",
    "⭐ <b>Xarid: Telegram Stars (⭐ 1 Star)</b>",
    `🏟 Klub: <b>${escapeHtml(summary.clubName)}</b>`,
    `🏆 Liga: <i>${escapeHtml(summary.leagueName)}</i>`,
    `👑 Sizdagi Legendlar: <b>${summary.currentLegendCount}/${summary.maxLegends}</b>`,
    "🔒 Har bir Legend butun ligada faqat bitta klubda bo‘ladi",
    "",
    "<b>POZITSIYALAR BO‘YICHA AFSONALAR:</b>",
    "🧤 <b>Darvozabonlar (5):</b> Buffon, Casillas, Kahn, Čech, Van der Sar",
    "🛡 <b>Himoyachilar (12):</b> Maldini, Ramos, Carlos, Puyol, Nesta...",
    "🎯 <b>Yarim himoyachilar (12):</b> Zidane, Ronaldinho, Iniesta, Xavi...",
    "⚡ <b>Hujumchilar (12):</b> Messi, Ronaldo, Henry, R9, Pelé...",
    "",
    "👇 <i>Futbolchilar ro‘yxatini ko‘rish uchun quyidagi toifalardan birini tanlang:</i>",
  ];

  return lines.join("\n");
}

export function formatLegendCategory(
  category: LegendCategory,
  page: number,
  totalPages: number,
  items: LegendListingItem[],
  summary: ClubLegendSummary
): string {
  const cat = CATEGORY_NAMES[category] ?? { title: category, icon: "⚽" };

  const lines = [
    `${cat.icon} <b>${cat.title}</b> · <i>Sahifa ${page + 1}/${totalPages}</i>`,
    `👑 <b>Limit:</b> <b>${summary.currentLegendCount}/${summary.maxLegends}</b>`,
    "",
  ];

  items.forEach((item, idx) => {
    const num = page * 6 + idx + 1;
    const l = item.legend;
    let badge = "";
    if (l.tier === "GOAT") badge = "🐐 ";
    else if (l.tier === "Icon") badge = "✨ ";

    let statusLine = `⭐ <b>${l.starsPrice} Star</b>`;
    if (item.status === "OWNED_BY_CURRENT_CLUB") {
      statusLine += " · ✅ <i>Jamoangizda</i>";
    } else if (item.status === "OWNED_BY_OTHER_CLUB") {
      statusLine += ` · 🔒 <i>Band (${escapeHtml(item.ownerClubName ?? "Raqib")})</i>`;
    } else if (item.status === "CLUB_LIMIT_REACHED") {
      statusLine += " · 🔒 <i>Limit 5/5</i>";
    } else if (item.status === "LEAGUE_NOT_ACTIVE") {
      statusLine += " · ⏳ <i>Liga kutilmoqda</i>";
    }

    lines.push(
      `${num}. ${badge}<b>${escapeHtml(l.name)}</b> · ${escapeHtml(l.primaryPosition)} · ⭐<b>${l.overall}</b>`,
      `   ${statusLine}`,
      ""
    );
  });

  return lines.join("\n").trimEnd();
}

export function formatLegendCard(
  item: LegendListingItem,
  summary: ClubLegendSummary
): string {
  const l = item.legend;
  const positions = [l.primaryPosition, ...l.secondaryPositions].join(" / ");

  const lines = [
    `👑 <b>${escapeHtml(l.name.toUpperCase())}</b>`,
    "━━━━━━━━━━━━━━",
    "",
    `⚡ <b>${escapeHtml(positions)}</b>`,
    `⭐ <b>OVR ${l.overall}</b>`,
    "",
    `PAC <b>${l.pace}</b>  |  SHO <b>${l.shooting}</b>`,
    `PAS <b>${l.passing}</b>  |  DRI <b>${l.dribbling}</b>`,
    `DEF <b>${l.defending}</b>  |  PHY <b>${l.physical}</b>`,
    "",
    `🏆 <i>Legend Tier: <b>${escapeHtml(l.tier)}</b></i>`,
    "",
    `⭐ <b>Narxi: ${l.starsPrice} Star</b>`,
    "",
    "🏟 Sotib olinsa faqat:",
    `<b>${escapeHtml(summary.clubName)} · ${escapeHtml(summary.leagueName)}</b>`,
    "uchun amal qiladi.",
    "",
    `👑 Club Legend limiti: <b>${summary.currentLegendCount}/${summary.maxLegends}</b>`,
  ];

  if (item.status === "OWNED_BY_CURRENT_CLUB") {
    lines.push("", "✅ <b>Ushbu Legend allaqachon klubingiz tarkibida!</b>");
  } else if (item.status === "OWNED_BY_OTHER_CLUB") {
    lines.push(
      "",
      `🔒 <b>Bu Legend band qilingan!</b>`,
      `<i>Bu ligada uni <b>${escapeHtml(item.ownerClubName ?? "boshqa klub")}</b> sotib olgan.</i>`
    );
  } else if (item.status === "CLUB_LIMIT_REACHED") {
    lines.push(
      "",
      "🔒 <b>Legend limiti to‘lgan (5/5)</b>",
      "<i>Bir klub tarkibida maksimal 5 ta Legend bo‘lishi mumkin.</i>"
    );
  } else if (item.status === "LEAGUE_NOT_ACTIVE") {
    lines.push(
      "",
      "⏳ <b>Liga start arafasida</b>",
      "<i>Legend xaridi liga 1-turi start olgach ochiladi.</i>"
    );
  }

  return lines.join("\n");
}

export function formatMyLegends(summary: ClubLegendSummary): string {
  const lines = [
    "👑 <b>KLUB LEGENDLARI</b>",
    "",
    `🏟 <b>${escapeHtml(summary.clubName)}</b>`,
    `🏆 <i>${escapeHtml(summary.leagueName)}</i>`,
    "",
  ];

  if (summary.legends.length === 0) {
    lines.push(
      "<i>Hozircha klubingizda Legend futbolchilar yo‘q.</i>",
      "",
      "<i>Yuqoridagi toifalardan birini tanlab, jamoangizga afsonaviy futbolchini qo‘shing!</i>"
    );
  } else {
    summary.legends.forEach((l, idx) => {
      lines.push(
        `${idx + 1}. 👑 <b>${escapeHtml(l.name)}</b> · ${escapeHtml(l.primaryPosition)} · ⭐<b>${l.overall}</b> <i>(${escapeHtml(l.tier)})</i>`
      );
    });
  }

  lines.push("", `👑 Limit: <b>${summary.currentLegendCount}/${summary.maxLegends}</b>`);
  return lines.join("\n");
}

export function formatLegendFulfillmentSuccess(
  result: LegendFulfillmentResult,
  summary: ClubLegendSummary
): string {
  return [
    "✨ <b>LEGEND JAMOANGIZDA!</b>",
    "",
    `👑 <b>${escapeHtml(result.legendName)}</b>`,
    `⚡ <b>${escapeHtml(result.legendPos)}</b> · ⭐ <b>OVR ${result.legendOvr}</b>`,
    "",
    `🏟 <b>${escapeHtml(result.clubName)}</b> tarkibiga qo‘shildi.`,
    `👑 Legendlar: <b>${summary.currentLegendCount + 1}/${summary.maxLegends}</b>`,
    "",
    "<i>Endi uni Starting XI tarkibiga joylashtirishingiz mumkin.</i>",
  ].join("\n");
}
