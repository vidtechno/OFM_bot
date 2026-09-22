// src/webhook/edge-entry.ts
import { createClient } from "@supabase/supabase-js";

// src/bot/create-bot.ts
import { Bot, InlineKeyboard } from "grammy";

// src/lib/html.ts
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function formatMoney(amount) {
  const abs = Math.abs(amount);
  if (abs >= 1e6) {
    const val = amount / 1e6;
    const formatted = val % 1 === 0 ? val.toFixed(0) : val.toFixed(1);
    return `\u20AC${formatted}M`;
  }
  if (abs >= 1e3) {
    const val = amount / 1e3;
    const formatted = val % 1 === 0 ? val.toFixed(0) : val.toFixed(1);
    return `\u20AC${formatted}K`;
  }
  return `\u20AC${amount}`;
}
function formatLobbyCountdown(targetDate) {
  if (!targetDate) return "<b>Liga boshlanmoqda...</b>";
  const diffMs = new Date(targetDate).getTime() - Date.now();
  if (diffMs <= 0) return "<b>Liga boshlanmoqda...</b>";
  const totalMinutes = Math.floor(diffMs / 6e4);
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
function formatDateTime(dateInput) {
  const d = new Date(dateInput);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const utc = d.getTime() + d.getTimezoneOffset() * 6e4;
  const uzTime = new Date(utc + 5 * 36e5);
  const day = uzTime.getDate();
  const month = months[uzTime.getMonth()];
  const hours = String(uzTime.getHours()).padStart(2, "0");
  const minutes = String(uzTime.getMinutes()).padStart(2, "0");
  return `${day} ${month} \xB7 ${hours}:${minutes}`;
}
function formatFixtureDate(dateInput) {
  const d = new Date(dateInput);
  const now = /* @__PURE__ */ new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 6e4;
  const uzTime = new Date(utc + 5 * 36e5);
  const utcNow = now.getTime() + now.getTimezoneOffset() * 6e4;
  const uzNow = new Date(utcNow + 5 * 36e5);
  const isToday = uzTime.getDate() === uzNow.getDate() && uzTime.getMonth() === uzNow.getMonth() && uzTime.getFullYear() === uzNow.getFullYear();
  const hours = String(uzTime.getHours()).padStart(2, "0");
  const minutes = String(uzTime.getMinutes()).padStart(2, "0");
  if (isToday) {
    return `Bugun \xB7 ${hours}:${minutes}`;
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${uzTime.getDate()} ${months[uzTime.getMonth()]} \xB7 ${hours}:${minutes}`;
}
function competitionFlag(code) {
  if (!code) return "\u{1F3C6}";
  const upper = code.toUpperCase();
  if (upper === "UZB") return "\u{1F1FA}\u{1F1FF}";
  if (upper === "ELITE") return "\u{1F1EA}\u{1F1FA}";
  if (upper === "LALIGA") return "\u{1F1EA}\u{1F1F8}";
  if (upper === "PL") return "\u{1F3F4}";
  return "\u{1F3C6}";
}
function positionGroupPluralLabel(group) {
  switch (group) {
    case "GK":
      return "Darvozabonlar";
    case "DEF":
      return "Himoyachilar";
    case "MID":
      return "Yarim himoyachilar";
    case "ATT":
      return "Hujumchilar";
    default:
      return "Barchasi";
  }
}

// src/leagues/presentation.ts
function formatClubDashboard(club, managerName, nextMatchSnippet, teamOvr, cashBalance) {
  const ovr = teamOvr ?? club.teamOvr ?? 80;
  const cash = cashBalance ?? club.cash ?? club.budget;
  const lines = [
    `\u{1F3DF} <b>${escapeHtml(club.clubName.toUpperCase())}</b>`,
    "",
    `\u{1F3C6} <i>${escapeHtml(club.leagueName)}</i>`,
    `\u{1F4CD} <b>${club.position}-o\u2018rin</b>`,
    `\u2B50 Jamoa OVR: <b>${ovr}</b>`,
    "",
    `\u{1F4B0} Transfer budjeti: <b>${formatMoney(club.budget)}</b>`,
    `\u{1F3E6} G\u2018azna: <b>${formatMoney(cash)}</b>`,
    "",
    "\u23ED <b>Keyingi o\u2018yin</b>",
    nextMatchSnippet ?? "<i>Rejalashtirilgan o\u2018yin yo\u2018q.</i>"
  ];
  return lines.join("\n");
}
function claimErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("CLUB_ALREADY_CLAIMED")) {
    return "\u274C <b>Klub band qilingan</b>\n<i>Bu klubni boshqa manager olib bo\u2018ldi. Boshqa klub tanlang.</i>";
  }
  if (message.includes("MAX_TOURNAMENT_LIMIT_REACHED")) {
    return "\u274C <b>Turnir limiti to\u2018lgan</b>\n<i>Siz allaqachon maksimal 2 ta turnirda ishtirok etyapsiz. Yangi klub tanlash uchun mavjud ligalaringizdan biridan chiqing.</i>";
  }
  if (message.includes("ALREADY_IN_THIS_LEAGUE") || message.includes("COMPETITION_LIMIT_REACHED")) {
    return "\u274C <b>Cheklov mavjud</b>\n<i>Siz ushbu liga instansiyasida allaqachon klub boshqaryapsiz.</i>";
  }
  if (message.includes("PREVIOUSLY_DEPARTED_THIS_LEAGUE")) {
    return "\u274C <b>Qayta kirish taqiqlangan</b>\n<i>Siz ushbu faol ligadan avvalroq chiqqansiz. Qayta qo\u2018shilish imkonsiz. Yangi mavsumni kuting.</i>";
  }
  if (message.includes("LEAGUE_NOT_ACTIVE")) {
    return "\u274C <b>Liga faol emas</b>\n<i>Ushbu liga hozirda faol emas.</i>";
  }
  if (message.includes("LEAGUE_PRE_SEASON_LOCKED")) {
    return "\u23F3 <b>Liga hali boshlanmagan</b>\n<i>Transferlar liga startidan keyin ochiladi.</i>";
  }
  return "\u274C <b>Amal bajarilmadi</b>\n<i>Qayta urinib ko\u2018ring.</i>";
}
function formatOpenLobbies(lobbies, managedClubs) {
  const lines = ["\u{1F3C6} <b>LIGALAR</b>", ""];
  for (const lobby of lobbies) {
    const flag = competitionFlag(lobby.competitionCode);
    const statusText = lobby.status === "OPEN" ? "\u{1F7E2} <i>Qabul ochiq</i>" : "\u26A1 <i>Faol liga</i>";
    const countdown = formatLobbyCountdown(lobby.registrationClosesAt);
    const countdownLine = countdown.includes("Liga boshlanmoqda") ? `\u23F3 ${countdown}` : `\u23F3 Boshlanishiga: ${countdown}`;
    lines.push(
      `${flag} <b>${escapeHtml(lobby.competitionName)}</b>`,
      statusText,
      `\u{1F464} ${lobby.humanCount}/${lobby.maxClubs} manager`,
      countdownLine,
      ""
    );
  }
  lines.push("\u{1F4CC} <b>MENING LIGALARIM</b>", "");
  if (managedClubs.length === 0) {
    lines.push("<i>Hozircha faol turniringiz yo\u2018q.</i>", "");
  } else {
    for (const mc of managedClubs) {
      lines.push(
        `\u26BD <b>${escapeHtml(mc.clubName)}</b>`,
        `<i>${escapeHtml(mc.leagueName)}</i>`,
        ""
      );
    }
  }
  lines.push(`\u{1F3AE} Faol turnirlar: <b>${managedClubs.length}/2</b>`);
  return lines.join("\n").trim();
}

// src/squads/presentation.ts
var defenders = /* @__PURE__ */ new Set(["LB", "LWB", "CB", "RB", "RWB"]);
var midfielders = /* @__PURE__ */ new Set(["LM", "CDM", "CM", "CAM", "RM"]);
function section(position) {
  if (position === "GK") return "GK";
  if (defenders.has(position)) return "DEF";
  if (midfielders.has(position)) return "MID";
  return "ATT";
}
function formatPlayerPosition(primary, secondary) {
  return secondary && secondary.trim() ? `${primary}/${secondary}` : primary;
}
function formatSquad(clubName, players) {
  const groups2 = /* @__PURE__ */ new Map([
    ["GK", []],
    ["DEF", []],
    ["MID", []],
    ["ATT", []]
  ]);
  for (const player of players) {
    const sec = section(player.primaryPosition);
    groups2.get(sec)?.push(player);
  }
  for (const group of groups2.values()) {
    group.sort((a, b) => b.overall - a.overall || a.shortName.localeCompare(b.shortName));
  }
  const sectionTitles = {
    GK: "\u{1F9E4} <b>DARVOZABONLAR</b>",
    DEF: "\u{1F6E1} <b>HIMOYACHILAR</b>",
    MID: "\u{1F3AF} <b>YARIM HIMOYACHILAR</b>",
    ATT: "\u26A1 <b>HUJUMCHILAR</b>"
  };
  const lines = [
    `\u{1F465} <b>${escapeHtml(clubName.toUpperCase())} \u2014 JAMOA</b>`,
    `\u{1F4CB} <b>${players.length}</b> futbolchi`
  ];
  for (const [secKey, title] of Object.entries(sectionTitles)) {
    const group = groups2.get(secKey) ?? [];
    lines.push("", title);
    if (group.length === 0) {
      lines.push("<i>Futbolchi yo\u2018q</i>");
      continue;
    }
    group.forEach((p, idx) => {
      const pos = formatPlayerPosition(p.primaryPosition, p.secondaryPosition);
      lines.push(`${idx + 1}. ${escapeHtml(p.shortName)} \u2014 ${escapeHtml(pos)} \u2014 \u2B50<b>${p.overall}</b>`);
    });
  }
  let text = lines.join("\n");
  if (text.length > 4e3) {
    text = text.slice(0, 3990) + "\n\u2026 <i>[qolgan o\u2018yinchilar qisqartirildi]</i>";
  }
  return text;
}

// src/tactics/presentation.ts
var terms = {
  VERY_DEFENSIVE: "Juda himoyaviy",
  DEFENSIVE: "Himoyaviy",
  BALANCED: "Balansli",
  ATTACKING: "Hujumkor",
  VERY_ATTACKING: "Juda hujumkor",
  SHORT: "Short",
  MIXED: "Mixed",
  DIRECT: "Direct",
  LEFT: "Left Wing",
  CENTRE: "Centre",
  RIGHT: "Right Wing",
  BOTH_WINGS: "Both Wings",
  CAUTIOUS: "Cautious",
  NORMAL: "Normal",
  AGGRESSIVE: "Aggressive"
};
var footballTerm = (value) => terms[value] ?? value;
var positionName = (value) => ({
  GK: "Darvozabon",
  LB: "Chap himoyachi",
  LWB: "Chap qanot himoyachi",
  CB: "Markaziy himoyachi",
  RB: "O\u2018ng himoyachi",
  RWB: "O\u2018ng qanot himoyachi",
  LM: "Chap yarim himoyachi",
  CDM: "Tayanch yarim himoyachi",
  CM: "Markaziy yarim himoyachi",
  CAM: "Hujumkor yarim himoyachi",
  RM: "O\u2018ng yarim himoyachi",
  LW: "Chap qanot hujumchi",
  ST: "Markaziy hujumchi",
  RW: "O\u2018ng qanot hujumchi"
})[value] ?? value;
var formatTactics = (t) => [
  "\u{1F9E0} <b>TAKTIKA</b>",
  "",
  `\u{1F9E9} Formation: <b>${escapeHtml(t.formationName)}</b>`,
  `\u{1F3AF} Mentalitet: <b>${escapeHtml(footballTerm(t.mentality))}</b>`,
  `\u26A1 Pressing: <b>${t.pressing}</b>`,
  `\u23F1 Temp: <b>${t.tempo}</b>`,
  `\u{1F4CF} Himoya chizig\u2018i: <b>${t.defensiveLine}</b>`,
  `\u2194\uFE0F Kenglik: <b>${t.width}</b>`,
  `\u{1F3AF} Pas turi: <b>${escapeHtml(footballTerm(t.passingStyle))}</b>`,
  `\u2694\uFE0F Hujum yo\u2018nalishi: <b>${escapeHtml(footballTerm(t.attackFocus))}</b>`,
  `\u{1F6E1} Kurashuvchanlik: <b>${escapeHtml(footballTerm(t.tackling))}</b>`
].join("\n");
function formatStartingXi(clubName, formation, players) {
  const avgStrength = (players.reduce((sum, p) => sum + p.effectiveRating, 0) / Math.max(players.length, 1)).toFixed(1);
  const lines = [
    `\u{1F525} <b>${escapeHtml(clubName.toUpperCase())} \u2014 ASOSIY XI</b>`,
    `<i>Formation: ${escapeHtml(formation)}</i>`,
    ""
  ];
  for (const p of players) {
    const slotLabel = p.slotPosition || p.slotKey;
    lines.push(
      slotLabel,
      `${escapeHtml(p.shortName)} \u2014 \u2B50<b>${p.overall}</b>`,
      ""
    );
  }
  lines.push(`\u2B50 Jamoa kuchi: <b>${avgStrength}</b>`);
  return lines.join("\n").trim();
}

// src/fixtures/presentation.ts
function formatFixtureLine(fixture) {
  const opponent = fixture.isHome ? fixture.awayClub : fixture.homeClub;
  const prefix = fixture.isHome ? "vs" : "@";
  const dateStr = formatFixtureDate(fixture.scheduledAt);
  return `<b>${prefix} ${escapeHtml(opponent)}</b>
<i>${dateStr}</i>`;
}
function formatUpcomingFixtures(fixtures) {
  if (fixtures.length === 0) {
    return "\u{1F4C5} <b>O\u2018YINLAR</b>\n\n<i>Rejalashtirilgan o\u2018yin topilmadi.</i>";
  }
  const lines = ["\u{1F4C5} <b>KEYINGI O\u2018YINLAR</b>", ""];
  fixtures.forEach((f, idx) => {
    const opponent = f.isHome ? f.awayClub : f.homeClub;
    const prefix = f.isHome ? "vs" : "@";
    const dateStr = formatFixtureDate(f.scheduledAt);
    lines.push(
      `<b>${f.round}-tur</b> \xB7 ${prefix} <b>${escapeHtml(opponent)}</b>`,
      `<i>${dateStr}</i>`
    );
    if (idx < fixtures.length - 1) {
      lines.push("");
    }
  });
  return lines.join("\n");
}

// src/matches/presentation.ts
function formatResults(results) {
  if (!results.length) {
    return "\u26BD <b>NATIJALAR</b>\n\n<i>Hali o\u2018yin o\u2018tkazilmagan.</i>";
  }
  return [
    "\u26BD <b>SO\u2018NGGI NATIJALAR</b>",
    "",
    ...results.map(
      (r) => `<b>${r.round}-tur</b> \xB7 ${escapeHtml(r.homeClub)} <b>${r.homeGoals}:${r.awayGoals}</b> ${escapeHtml(r.awayClub)}`
    )
  ].join("\n");
}
function formatTable(rows, userClubName, leagueTitle = "LALIGA \u2014 JADVAL") {
  if (!rows.length) {
    return `\u{1F3C6} <b>${escapeHtml(leagueTitle)}</b>

<i>Hali o\u2018yinlar o\u2018tkazilmagan.</i>`;
  }
  const lines = [`\u{1F3C6} <b>${escapeHtml(leagueTitle)}</b>`, ""];
  for (const r of rows) {
    const isUser = userClubName && r.club.toLowerCase().trim() === userClubName.toLowerCase().trim();
    const prefix = isUser ? "\u{1F449} " : "";
    lines.push(`${prefix}${r.position}. ${escapeHtml(r.club)} \u2014 <b>${r.points}</b>`);
  }
  return lines.join("\n");
}
function formatLeaders(title, leaders, unit) {
  const icon = unit === "gol" || unit === "goals" ? "\u26BD" : "\u{1F3AF}";
  const cleanTitle = title.replace(/[🥅🎯⚽]/g, "").trim();
  const header = `${icon} <b>${escapeHtml(cleanTitle)}</b>`;
  if (!leaders.length) {
    return `${header}

<i>Hali o\u2018yin statistikasi shakllanmagan.</i>`;
  }
  const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
  const lines = [header, ""];
  leaders.slice(0, 10).forEach((l, index) => {
    const medal = medals[index] ?? `${index + 1}.`;
    lines.push(`${medal} ${escapeHtml(l.name)} \u2014 <b>${l.total}</b>`);
  });
  return lines.join("\n");
}
function formatFinances(summary) {
  return [
    "\u{1F4B0} <b>KLUB MOLIYASI</b>",
    "",
    `\u{1F3E6} Hisobdagi mablag\u2018: <b>${formatMoney(summary.cashBalance)}</b>`,
    `\u{1F4B0} Transfer budjeti: <b>${formatMoney(summary.transferBudget)}</b>`,
    "",
    "\u{1F9FE} <b>SO\u2018NGGI OPERATSIYALAR</b>",
    ...summary.transactions.length ? summary.transactions.map(
      (t) => `${t.amount >= 0 ? "\u{1F7E2} +" : "\u{1F534} -"}${formatMoney(Math.abs(t.amount))} \xB7 <i>${escapeHtml(t.description)}</i>`
    ) : ["<i>Hozircha moliyaviy operatsiya yo\u2018q.</i>"]
  ].join("\n");
}

// src/transfers/presentation.ts
var transferMoney = formatMoney;
function formatTransferHub(clubName, budget, cash, reservedBudget = 0) {
  const available = Math.max(0, budget - reservedBudget);
  return [
    `\u{1F501} <b>${escapeHtml(clubName.toUpperCase())} \u2014 TRANSFER</b>`,
    "",
    `\u{1F4B0} Budjet: <b>${formatMoney(budget)}</b>`,
    `\u{1F512} Band: <b>${formatMoney(reservedBudget)}</b>`,
    `\u2705 Mavjud: <b>${formatMoney(available)}</b>`,
    "",
    "<i>Kerakli bo\u2018limni tanlang.</i>"
  ].join("\n");
}
function formatClubPlayers(clubName, players, page = 0, total = players.length) {
  if (!players.length) {
    return `\u{1F3DF} <b>${escapeHtml(clubName.toUpperCase())} \u2014 FUTBOLCHILAR</b>

<i>Bu klubda transferga ochiq futbolchi topilmadi.</i>`;
  }
  const lines = [
    `\u{1F3DF} <b>${escapeHtml(clubName.toUpperCase())} \u2014 FUTBOLCHILAR</b>`,
    `\u{1F4CB} <b>${total}</b> futbolchi`,
    ""
  ];
  players.forEach((p, idx) => {
    lines.push(
      `${idx + 1}. <b>${escapeHtml(p.name)}</b>`,
      `${escapeHtml(p.position)} \xB7 \u2B50${p.overall} \xB7 ${formatMoney(p.marketValue)}`,
      ""
    );
  });
  return lines.join("\n").trim();
}
function formatPlayerProfile(p) {
  const lines = [
    `\u{1F464} <b>${escapeHtml(p.name.toUpperCase())}</b>`,
    "",
    `\u{1F3DF} ${escapeHtml(p.clubName)}`,
    `\u{1F4CD} ${escapeHtml(p.position)}`,
    `\u2B50 OVR: <b>${p.overall}</b>`,
    p.age ? `\u{1F382} Yosh: <b>${p.age}</b>` : "",
    p.nationality ? `\u{1F30D} Millati: <i>${escapeHtml(p.nationality)}</i>` : "",
    `\u{1F4B6} Bozor qiymati: <b>${formatMoney(p.marketValue)}</b>`,
    "",
    `<i>Manager: ${escapeHtml(p.managerType ?? "AI")}</i>`
  ].filter(Boolean);
  if (p.activeNegotiationText) {
    lines.push("", p.activeNegotiationText);
  }
  return lines.join("\n");
}
function formatMarket(players, leagueName, group = "ALL") {
  const groupTitle = positionGroupPluralLabel(group);
  const lines = ["\u{1F6D2} <b>GLOBAL TRANSFER BOZORI</b>"];
  if (leagueName) lines.push(`\u{1F3C6} <i>${escapeHtml(leagueName)}</i>`);
  lines.push("", `\u{1F4C2} Bo\u2018lim: <b>${escapeHtml(groupTitle)}</b>`, "");
  if (!players.length) {
    lines.push(
      "<i>Hozircha transferga qo\u2018yilgan futbolchilar topilmadi.</i>",
      "",
      "Boshqa pozitsiyani tanlang yoki keyinroq qayta tekshiring."
    );
    return lines.join("\n").trim();
  }
  players.forEach((p, i) => {
    const posBadge = p.position === "GK" ? "\u{1F9E4}" : ["CB", "LB", "RB", "LWB", "RWB"].includes(p.position) ? "\u{1F6E1}" : ["CM", "CDM", "CAM", "LM", "RM"].includes(p.position) ? "\u{1F3AF}" : "\u26A1";
    lines.push(
      `${i + 1}. <b>${escapeHtml(p.name)}</b>`,
      `${posBadge} ${escapeHtml(p.position)} \xB7 \u2B50<b>${p.overall}</b>`,
      `\u{1F3DF} ${escapeHtml(p.sellerName ?? "Global")}`,
      `\u{1F4B0} <b>${formatMoney(p.askingPrice)}</b>`,
      ""
    );
  });
  return lines.join("\n").trim();
}
function formatLeagueMarket(players, leagueName, group = "ALL") {
  const groupTitle = positionGroupPluralLabel(group);
  const lines = ["\u{1F6D2} <b>TRANSFER BOZORI</b>"];
  if (leagueName) lines.push(`\u{1F3C6} <i>${escapeHtml(leagueName)}</i>`);
  lines.push("", `\u{1F4C2} Bo\u2018lim: <b>${escapeHtml(groupTitle)}</b>`, "");
  if (!players.length) {
    lines.push(
      "<i>Hozircha transferga qo\u2018yilgan futbolchilar topilmadi.</i>",
      "",
      "Boshqa pozitsiyani tanlang yoki keyinroq qayta tekshiring."
    );
    return lines.join("\n").trim();
  }
  players.forEach((p, i) => {
    const posBadge = p.position === "GK" ? "\u{1F9E4}" : ["CB", "LB", "RB", "LWB", "RWB"].includes(p.position) ? "\u{1F6E1}" : ["CM", "CDM", "CAM", "LM", "RM"].includes(p.position) ? "\u{1F3AF}" : "\u26A1";
    lines.push(
      `${i + 1}. <b>${escapeHtml(p.name)}</b>`,
      `${posBadge} ${escapeHtml(p.position)} \xB7 \u2B50<b>${p.overall}</b>`,
      `\u{1F3DF} ${escapeHtml(p.sellerName ?? "Klub")}${p.isOwnListing ? " \u{1F3F7} <i>[Sizniki]</i>" : ""}`,
      `\u{1F4B0} <b>${formatMoney(p.askingPrice)}</b>`,
      ""
    );
  });
  return lines.join("\n").trim();
}
function formatListing(p) {
  return [
    "\u{1F30D} <b>GLOBAL TRANSFER</b>",
    "",
    `\u26BD <b>${escapeHtml(p.name)}</b>`,
    `\u{1F3DF} ${escapeHtml(p.sellerName ?? "Global Market")}`,
    `\u{1F4CD} ${escapeHtml(p.position)} \xB7 \u2B50<b>${p.overall}</b> \xB7 ${p.age} yosh`,
    `\u{1F4B0} Narxi: <b>${formatMoney(p.askingPrice)}</b>`,
    "",
    "<i>Xarid darhol amalga oshadi va futbolchi klubingiz tarkibiga qo\u2018shiladi.</i>"
  ].join("\n");
}
function formatLeagueListing(p) {
  return [
    "\u{1F6D2} <b>LIGA TRANSFERI</b>",
    "",
    `\u26BD <b>${escapeHtml(p.name)}</b>`,
    `\u{1F3DF} ${escapeHtml(p.sellerName ?? "Liga klubi")}`,
    `\u{1F4CD} Amplua: <b>${escapeHtml(p.position)}</b>`,
    `\u2B50 OVR: <b>${p.overall}</b>`,
    `\u{1F382} Yoshi: <b>${p.age} yosh</b>`,
    `\u{1F4B0} Narxi: <b>${formatMoney(p.askingPrice)}</b>`,
    "",
    p.isOwnListing ? "\u2139\uFE0F <i>Bu sizning sotuvga qo\u2018ygan futbolchingiz.</i>" : "<i>Xarid amalga oshgach, mablag\u2018 sotuvchi klubga o\u2018tkaziladi va futbolchi tarkibingizga qo\u2018shiladi.</i>"
  ].join("\n");
}
function formatTransferHistory(history) {
  if (!history.length) {
    return "\u{1F4DC} <b>TRANSFER TARIXI</b>\n\n<i>Hozircha yakunlangan transferlar mavjud emas.</i>";
  }
  const lines = ["\u{1F4DC} <b>TRANSFER TARIXI</b>", ""];
  for (const item of history) {
    const icon = item.type === "INCOMING" ? "\u{1F7E2}" : "\u{1F534}";
    const action = item.type === "INCOMING" ? "Xarid" : "Sotuv";
    const dateStr = formatDateTime(item.date);
    lines.push(
      `${icon} <b>${escapeHtml(item.playerName)}</b> \u2014 <b>${formatMoney(item.fee)}</b>`,
      `<i>${action} \xB7 ${escapeHtml(item.fromClub)} \u2794 ${escapeHtml(item.toClub)} \xB7 ${dateStr}</i>`,
      ""
    );
  }
  return lines.join("\n").trim();
}

// src/progression/presentation.ts
function formatProfile(p, clubs = []) {
  const managerName = p.username ? `@${p.username}` : p.name;
  const totalMatches = p.matches || p.wins + p.draws + p.losses;
  const winRate = totalMatches > 0 ? Math.round(p.wins / totalMatches * 100) : 0;
  const lines = [
    "\u{1F464} <b>MANAGER PROFILI</b>",
    "",
    `<b>${escapeHtml(managerName)}</b>`,
    `\u2B50 Reyting: <b>${p.rating.toLocaleString("en-US")}</b>`,
    "",
    `\u{1F3AE} Mavsumlar: ${p.seasons}`,
    `\u{1F3C6} Chempionlik: <b>${p.titles}</b>`,
    "",
    "\u{1F4CA} <b>KARYERA</b>",
    `W ${p.wins} \xB7 D ${p.draws} \xB7 L ${p.losses}`,
    `Win rate: <b>${winRate}%</b>`
  ];
  if (clubs.length > 0) {
    lines.push("", "\u{1F3DF} <b>KLUBLARIM</b>");
    for (const club of clubs) {
      lines.push(
        `\u26BD <b>${escapeHtml(club.clubName)}</b>`,
        `<i>${escapeHtml(club.leagueName)} \xB7 ${club.points} ochko</i>`
      );
    }
  }
  return lines.join("\n");
}
function formatLeaderboard(rows) {
  if (!rows.length) {
    return "\u{1F3C6} <b>GLOBAL REYTING</b>\n\n<i>Reyting yozuvlari topilmadi.</i>";
  }
  const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
  const lines = ["\u{1F3C6} <b>GLOBAL REYTING</b>", ""];
  rows.slice(0, 10).forEach((p, i) => {
    const medal = medals[i] ?? `${i + 1}.`;
    const name = p.username ? `@${p.username}` : p.name;
    lines.push(`${medal} <b>${escapeHtml(name)}</b> \u2014 \u2B50<b>${p.rating}</b> <i>(${p.wins}W)</i>`);
  });
  return lines.join("\n");
}
function formatSponsors(rows) {
  if (!rows.length) {
    return "\u{1F4B0} <b>HOMIYLAR</b>\n\n<i>Mavjud homiylar yo\u2018q.</i>";
  }
  const lines = ["\u{1F4B0} <b>HOMIYLAR</b>", ""];
  rows.forEach((s, i) => {
    lines.push(
      `${i + 1}. <b>${escapeHtml(s.name)}</b> \u2014 <b>${formatMoney(s.payment)}</b>/o\u2018yin`,
      s.channelId ? "   <i>Kanal a\u2019zoligi talab qilinadi</i>" : "",
      ""
    );
  });
  return lines.join("\n").trim();
}

// src/admin/presentation.ts
var formatAdminStats = (s) => [
  "\u{1F6E0} <b>ADMIN BOSHQARUV PANELI</b>",
  "",
  `\u{1F464} Foydalanuvchilar: <b>${s.users}</b> \xB7 Faol: <b>${s.activeUsers}</b> \xB7 Blok: <b>${s.blockedUsers}</b>`,
  `\u{1F3DF} Klublar: <b>${s.humanClubs}</b> manager \xB7 <b>${s.aiClubs}</b> AI`,
  `\u26BD O\u2018yinlar: <b>${s.matches}</b>`,
  `\u{1F504} Takliflar: <b>${s.offers}</b>`,
  `\u{1F6D2} Faol listinglar: <b>${s.activeListings}</b>`
].join("\n");
var formatAdminUsers = (rows) => [
  "\u{1F465} <b>FOYDALANUVCHILAR</b>",
  "",
  ...rows.map(
    (u, i) => `${i + 1}. <b>${escapeHtml(u.username ? `@${u.username}` : u.name)}</b> \xB7 <code>${u.telegramId}</code> \xB7 <i>${u.blocked ? "BLOCKED" : "ACTIVE"}</i>`
  )
].join("\n");
var formatAdminSponsors = (rows) => [
  "\u{1F4B0} <b>HOMIYLAR</b>",
  "",
  ...rows.map(
    (s, i) => `${i + 1}. <b>${escapeHtml(s.name)}</b> \u2014 <b>${formatMoney(s.payment)}</b> \xB7 <i>${s.active ? "ACTIVE" : "PAUSED"}</i>
   Kanal: <i>${escapeHtml(s.channel ?? (s.channelId ? String(s.channelId) : "sozlanmagan"))}</i>`
  )
].join("\n");

// src/bot/keyboards.ts
import { Keyboard } from "grammy";
var MAIN_MENU = {
  club: "\u26BD Klubim",
  leagues: "\u{1F3C6} Ligalar",
  transfer: "\u{1F30D} Transfer",
  profile: "\u{1F464} Profil",
  about: "\u2139\uFE0F Bot haqida",
  admin: "\u{1F6E0} Admin panel"
};
function createMainKeyboard(isAdmin = false) {
  const keyboard = new Keyboard().text(MAIN_MENU.club).text(MAIN_MENU.leagues).row().text(MAIN_MENU.profile).text(MAIN_MENU.about);
  if (isAdmin) keyboard.row().text(MAIN_MENU.admin);
  return keyboard.resized().persistent();
}

// src/bot/create-bot.ts
var PAGE_SIZE = 10;
async function editOrReply(context, text, keyboard) {
  if (context.callbackQuery?.message) {
    try {
      await context.editMessageText(text, { reply_markup: keyboard, parse_mode: "HTML" });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("message is not modified")) throw error;
    }
  } else {
    await context.reply(text, { reply_markup: keyboard, parse_mode: "HTML" });
  }
}
function clubListKeyboard(clubs, leagueId, page) {
  const keyboard = new InlineKeyboard();
  const totalPages = Math.ceil(clubs.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const currentBatch = clubs.slice(start, start + PAGE_SIZE);
  for (const club of currentBatch) {
    if (club.isAvailable) {
      keyboard.text(`\u2705 ${club.clubName}`, `cf:${club.leagueClubId}`).row();
    } else {
      keyboard.text(`\u274C ${club.clubName} \u2014 band`, "cb:band").row();
    }
  }
  if (totalPages > 1) {
    if (page > 0) keyboard.text("\u2B05\uFE0F Oldingi", `lg:${leagueId}:${page - 1}`);
    keyboard.text(`\u{1F4C4} ${page + 1}/${totalPages}`, "noop");
    if ((page + 1) * PAGE_SIZE < clubs.length) keyboard.text("Keyingi \u27A1\uFE0F", `lg:${leagueId}:${page + 1}`);
    keyboard.row();
  }
  return keyboard.text("\u21A9\uFE0F Orqaga", "join");
}
function buildTransferMarketKeyboard(cbPrefix, clubId, group, page, items, pageSize = 8) {
  const keyboard = new InlineKeyboard();
  for (const item of items) {
    const isLm = cbPrefix === "lm";
    const buyCb = isLm ? `lb:${item.listingId}` : `gb:${item.listingId}`;
    const ownTag = item.isOwnListing ? " \u{1F3F7}" : "";
    keyboard.text(
      `${item.name} \xB7 ${item.position} \xB7 \u2B50${item.overall} \xB7 ${transferMoney(item.askingPrice)}${ownTag}`,
      buyCb
    ).row();
  }
  const allLabel = group === "ALL" ? "\u2705 \u{1F4CB} Barchasi" : "\u{1F4CB} Barchasi";
  keyboard.text(allLabel, `${cbPrefix}:${clubId}:0:ALL`).row();
  const gkLabel = group === "GK" ? "\u2705 \u{1F9E4} Darvozabon" : "\u{1F9E4} Darvozabon";
  const defLabel = group === "DEF" ? "\u2705 \u{1F6E1} Himoyachi" : "\u{1F6E1} Himoyachi";
  keyboard.text(gkLabel, `${cbPrefix}:${clubId}:0:GK`).text(defLabel, `${cbPrefix}:${clubId}:0:DEF`).row();
  const midLabel = group === "MID" ? "\u2705 \u{1F3AF} Yarim himoyachi" : "\u{1F3AF} Yarim himoyachi";
  const attLabel = group === "ATT" ? "\u2705 \u26A1 Hujumchi" : "\u26A1 Hujumchi";
  keyboard.text(midLabel, `${cbPrefix}:${clubId}:0:MID`).text(attLabel, `${cbPrefix}:${clubId}:0:ATT`).row();
  const hasPrev = page > 0;
  const hasNext = items.length === pageSize;
  if (hasPrev || hasNext) {
    if (hasPrev) {
      keyboard.text("\u2B05\uFE0F Oldingi", `${cbPrefix}:${clubId}:${page - 1}:${group}`);
    }
    keyboard.text(`\u{1F4C4} ${page + 1}`, "noop");
    if (hasNext) {
      keyboard.text("Keyingi \u27A1\uFE0F", `${cbPrefix}:${clubId}:${page + 1}:${group}`);
    }
    keyboard.row();
  }
  keyboard.text("\u21A9\uFE0F Orqaga", `tr:${clubId}`);
  return keyboard;
}
function dashboardKeyboard(leagueClubId) {
  return new InlineKeyboard().text("\u{1F465} Jamoa", `sq:${leagueClubId}`).text("\u{1F525} Asosiy XI", `xi:${leagueClubId}`).row().text("\u{1F9E0} Taktika", `tc:${leagueClubId}`).text("\u{1F501} Transfer", `tr:${leagueClubId}`).row().text("\u{1F4C5} O\u2018yinlar", `mt:${leagueClubId}`).text("\u{1F4CA} Liga", `tb:${leagueClubId}`).row().text("\u{1F6AA} Ligadan chiqish", `lx:${leagueClubId}`).row();
}
function createBot({ token, users, leagues, squads, tactics, fixtures, matches, transfers, progression, admin, adminTelegramIds, logger }) {
  const bot = new Bot(token);
  const isAdmin = (telegramId) => adminTelegramIds.includes(telegramId);
  bot.api.config.use(async (prev, method, payload, signal) => {
    const t0 = performance.now();
    try {
      return await prev(method, payload, signal);
    } finally {
      const elapsed = performance.now() - t0;
      const profiler = bot.__currentProfiler;
      if (profiler) {
        profiler.record(`telegram_api:${method}`, elapsed);
      }
    }
  });
  const getContextUser = async (context) => {
    const cached = context.sessionUser;
    if (cached) return cached;
    if (!context.from) throw new Error("No telegram user");
    const profiler = context.profiler;
    const user = profiler ? await profiler.time("user_upsert", () => users.upsertFromTelegram(context.from)) : await users.upsertFromTelegram(context.from);
    context.sessionUser = user;
    return user;
  };
  const getContextManagedClubs = async (context, userId) => {
    const cached = context.managedClubs;
    if (cached) return cached;
    const profiler = context.profiler;
    const clubs = profiler ? await profiler.time("league_club_query", () => leagues.listManagedClubs(userId)) : await leagues.listManagedClubs(userId);
    context.managedClubs = clubs;
    return clubs;
  };
  const privateLeagueJoinPending = /* @__PURE__ */ new Set();
  const sendUpdate = async (telegramId, text, keyboard) => {
    if (!telegramId) return;
    try {
      await bot.api.sendMessage(telegramId, text, { reply_markup: keyboard, parse_mode: "HTML" });
    } catch (error) {
      logger.warn({ event: "transfer_notification_failed", err: error }, "Transfer notification failed");
    }
  };
  bot.use(async (context, next) => {
    context.profiler = bot.__currentProfiler;
    if (!context.from) return next();
    const user = await getContextUser(context);
    if (user.is_blocked && !isAdmin(context.from.id)) {
      await context.reply("Botdan foydalanish huquqingiz vaqtincha bloklangan.");
      return;
    }
    await next();
  });
  bot.on("callback_query", async (context, next) => {
    const profiler = context.profiler;
    let answered = false;
    const originalAnswer = context.answerCallbackQuery.bind(context);
    context.answerCallbackQuery = async (params) => {
      if (answered) return true;
      answered = true;
      const t0 = performance.now();
      try {
        return await originalAnswer(params);
      } finally {
        if (profiler) {
          profiler.record("callback_ack", performance.now() - t0);
        }
      }
    };
    await context.answerCallbackQuery().catch(() => {
    });
    await next();
  });
  const showCompetitions = async (context) => {
    const user = await getContextUser(context);
    const profiler = context.profiler;
    const [lobbies, managedClubs] = await Promise.all([
      profiler ? profiler.time("league_club_query", () => leagues.listOpenLobbies()) : leagues.listOpenLobbies(),
      getContextManagedClubs(context, user.id)
    ]);
    const keyboard = new InlineKeyboard();
    for (const lobby of lobbies) {
      const flag = competitionFlag(lobby.competitionCode);
      keyboard.text(`${flag} ${lobby.competitionName} \u2014 Klub tanlash`, `lg:${lobby.leagueId}:0`).row();
    }
    if (managedClubs.length > 0) {
      for (const mc of managedClubs) {
        keyboard.text(`\u26BD ${mc.clubName} \u2014 Boshqarish`, `db:${mc.leagueClubId}`).text(`\u{1F6AA} Chiqish`, `lx:${mc.leagueClubId}`).row();
      }
    }
    keyboard.text("\u{1F504} Yangilash", "refresh:leagues");
    await editOrReply(context, formatOpenLobbies(lobbies, managedClubs), keyboard);
  };
  const showDashboard = async (context, club) => {
    const telegramUser = context.from;
    const managerName = telegramUser?.username ? `@${telegramUser.username}` : telegramUser?.first_name ?? "Manager";
    const user = await getContextUser(context);
    const profiler = context.profiler;
    const [next] = profiler ? await profiler.time("league_club_query", () => fixtures.listUpcoming(user.id, club.leagueClubId, 1, true)) : await fixtures.listUpcoming(user.id, club.leagueClubId, 1, true);
    await editOrReply(context, formatClubDashboard(club, managerName, next ? formatFixtureLine(next) : void 0), dashboardKeyboard(club.leagueClubId));
  };
  bot.command("start", async (context) => {
    const telegramUser = context.from;
    if (!telegramUser) {
      await context.reply("Telegram profilingizni aniqlab bo\u2018lmadi. Iltimos, qayta urinib ko\u2018ring.");
      return;
    }
    const profiler = context.profiler;
    const startState = profiler ? await profiler.time("user_upsert", () => users.getStartState(telegramUser)) : await users.getStartState(telegramUser);
    const user = startState.user;
    context.sessionUser = user;
    const managedClubs = startState.managedClubs;
    context.managedClubs = managedClubs;
    logger.info({ event: "user_registered", userId: user.id, telegramId: user.telegram_id }, "User registered or updated");
    const firstName = escapeHtml(telegramUser.first_name);
    const welcomeText = [
      "\u26BD <b>OFM GAME</b>",
      "",
      `Xush kelibsiz, <b>${firstName}</b>!`,
      "",
      "<i>Klub tanlang. Tarkib tuzing. Taktika yarating.\nTransfer qiling. Chempion bo\u2018ling.</i>",
      "",
      "\u{1F465} Jamoani boshqaring",
      "\u{1F9E0} O\u2018yin uslubingizni yarating",
      "\u{1F501} Transfer bozorida harakat qiling",
      "\u{1F4CA} Natijalar va statistikani kuzating",
      "\u{1F3C6} Mavsum yakunida chempionlik uchun kurashing",
      "",
      "<b>O\u2018yinni boshlash:</b>",
      "\u{1F3C6} <b>Ligalar</b> bo\u2018limiga o\u2018ting va bo\u2018sh klubni tanlang."
    ].join("\n");
    const mainKeyboard = createMainKeyboard(isAdmin(telegramUser.id));
    await context.reply(welcomeText, { reply_markup: mainKeyboard, parse_mode: "HTML" });
  });
  bot.hears(MAIN_MENU.about, async (context) => {
    const text = [
      "\u2139\uFE0F <b>OFM GAME HAQIDA</b>",
      "",
      "OFM Game \u2014 Telegram ichida ishlaydigan futbol manager o\u2018yini.",
      "",
      "<b>Qanday o\u2018ynaladi?</b>",
      "",
      "1. \u{1F3C6} Ligadan bo\u2018sh klub tanlang.",
      "2. \u{1F465} Tarkibingizni boshqaring.",
      "3. \u{1F525} Asosiy XI tuzing.",
      "4. \u{1F9E0} Taktikani moslang.",
      "5. \u{1F501} Transferlar orqali jamoani kuchaytiring.",
      "6. \u26BD Har kuni o\u2018yinlarda qatnashing.",
      "7. \u{1F4CA} Turnir jadvali va statistikani kuzating.",
      "8. \u{1F3C6} Mavsum yakunida chempionlik uchun kurashing.",
      "",
      "<b>Muhim qoidalar:</b>",
      "\u2022 Bir manager maksimal 2 ta faol turnirda qatnasha oladi.",
      "\u2022 Liga boshlanguncha transferlar yopiq.",
      "\u2022 Liga ACTIVE bo\u2018lgach AI va boshqa managerlar bilan transferlar ochiladi.",
      "\u2022 ACTIVE ligadan chiqsangiz, klub AI boshqaruviga o\u2018tadi.",
      "\u2022 Klub tarkibi, ochkolar va moliya saqlanadi.",
      "",
      "\u{1F468}\u200D\u{1F4BB} <b>Muallif</b>",
      '<a href="https://t.me/diyorbek_anorboyev">@diyorbek_anorboyev</a>',
      "",
      "\u{1F6DF} <b>Support</b>",
      '<a href="https://t.me/diyorbek_anorboyev">@diyorbek_anorboyev</a>'
    ].join("\n");
    await context.reply(text, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  });
  bot.hears(MAIN_MENU.club, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const clubs = await getContextManagedClubs(context, user.id);
    if (clubs.length === 0) return showCompetitions(context);
    if (clubs.length === 1) return showDashboard(context, clubs[0]);
    const keyboard = new InlineKeyboard();
    for (const club of clubs) keyboard.text(`${club.clubName} \xB7 ${club.competitionName}`, `db:${club.leagueClubId}`).row();
    await context.reply("Klubingizni tanlang:", { reply_markup: keyboard });
  });
  bot.callbackQuery("home:club", async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubs = await getContextManagedClubs(context, user.id);
    if (!clubs.length) return showCompetitions(context);
    return showDashboard(context, clubs[0]);
  });
  bot.hears(MAIN_MENU.leagues, showCompetitions);
  bot.hears(MAIN_MENU.profile, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const profiler = context.profiler;
    const [profile, clubs] = await Promise.all([
      profiler ? profiler.time("manager_profile", () => progression.profile(user.id)) : progression.profile(user.id),
      getContextManagedClubs(context, user.id)
    ]);
    await context.reply(formatProfile(profile, clubs), {
      reply_markup: new InlineKeyboard().text("\u{1F3C5} Global reyting", "lb:0"),
      parse_mode: "HTML"
    });
  });
  bot.callbackQuery("lb:0", async (context) => {
    await context.answerCallbackQuery();
    const profiler = context.profiler;
    const leaders = profiler ? await profiler.time("manager_profile", () => progression.leaderboard()) : await progression.leaderboard();
    await editOrReply(context, formatLeaderboard(leaders), new InlineKeyboard().text("\u21A9\uFE0F Orqaga", "pf:0"));
  });
  bot.callbackQuery("pf:0", async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const profiler = context.profiler;
    const profile = profiler ? await profiler.time("manager_profile", () => progression.profile(user.id)) : await progression.profile(user.id);
    await editOrReply(context, formatProfile(profile), new InlineKeyboard().text("\u{1F3C5} Global reyting", "lb:0"));
  });
  bot.callbackQuery("refresh:leagues", async (context) => {
    await context.answerCallbackQuery();
    await showCompetitions(context);
  });
  const adminHome = async (context) => {
    await editOrReply(context, formatAdminStats(await admin.stats()), new InlineKeyboard().text("Users", "ad:u").text("Sponsors", "ad:s").row().text("Audit log", "ad:a").text("Refresh", "ad:h"));
  };
  bot.hears(MAIN_MENU.admin, async (context) => {
    if (!context.from || !isAdmin(context.from.id)) return;
    await adminHome(context);
  });
  bot.callbackQuery(/^ad:([usah])$/, async (context) => {
    if (!context.from || !isAdmin(context.from.id)) return context.answerCallbackQuery({ text: "Ruxsat yo\u2018q" });
    await context.answerCallbackQuery();
    const section2 = context.match[1];
    if (section2 === "h") return adminHome(context);
    if (section2 === "u") {
      const rows2 = await admin.users();
      const kb = new InlineKeyboard();
      for (const u of rows2) {
        if (u.telegramId === context.from.id) continue;
        kb.text(`${u.blocked ? "\u2705 Unblock" : "\u26D4 Block"} ${u.username ? `@${u.username}` : u.name}`, `${u.blocked ? "au" : "ab"}:${u.id}`).row();
      }
      kb.text("\u2190 Admin", "ad:h");
      return editOrReply(context, formatAdminUsers(rows2), kb);
    }
    if (section2 === "s") {
      const rows2 = await admin.sponsors();
      const kb = new InlineKeyboard();
      for (const s of rows2) kb.text(`${s.active ? "\u23F8" : "\u25B6\uFE0F"} ${s.name}`, `as:${s.id}:${s.active ? "0" : "1"}`).row();
      kb.text("\u2190 Admin", "ad:h");
      return editOrReply(context, formatAdminSponsors(rows2), kb);
    }
    const rows = await admin.audit();
    return editOrReply(context, ["AUDIT LOG", "", ...rows.length ? rows.map((r) => `${r.action} \xB7 ${r.target_type}
${new Date(r.created_at).toLocaleString("uz-UZ")}`) : ["Hozircha audit yozuvlari yo\u2018q."]].join("\n"), new InlineKeyboard().text("\u2190 Admin", "ad:h"));
  });
  bot.callbackQuery(/^(ab|au):([0-9a-f-]{36})$/, async (context) => {
    if (!context.from || !isAdmin(context.from.id)) return;
    await context.answerCallbackQuery();
    const actor = await getContextUser(context);
    await admin.setBlocked(actor.id, context.match[2], context.match[1] === "ab");
    await context.reply("User holati yangilandi.");
  });
  bot.callbackQuery(/^as:([0-9a-f-]{36}):([01])$/, async (context) => {
    if (!context.from || !isAdmin(context.from.id)) return;
    await context.answerCallbackQuery();
    const actor = await getContextUser(context);
    await admin.setSponsor(actor.id, context.match[1], context.match[2] === "1");
    await context.reply("Sponsor holati yangilandi.");
  });
  const showTransferHub = async (context, clubId) => {
    const user = await getContextUser(context);
    const clubs = await getContextManagedClubs(context, user.id);
    const club = clubs.find((c) => c.leagueClubId === clubId);
    const clubName = club?.clubName ?? "Klub";
    const finances = await matches.finances(user.id, clubId);
    const owner = await transfers.ownerLeague(user.id, clubId, false);
    await transfers.saveInputSession(user.id, "ACTIVE_CLUB", { clubId });
    const keyboard = new InlineKeyboard().text("\u{1F6D2} Transfer bozori", `lm:${clubId}:0:ALL`).text("\u{1F50E} Ligadan izlash", `tf:${clubId}:0`).row().text("\u{1F30D} Global Transfer", `gm:${clubId}:0:ALL`).text("\u{1F4E4} Futbolchi sotish", `ts:${clubId}`).row().text("\u{1F4E5} Takliflar", `io:${clubId}`).text("\u{1F4DC} Transfer tarixi", `th:${clubId}`).row().text("\u21A9\uFE0F Orqaga", `db:${clubId}`);
    let hubText = formatTransferHub(
      clubName,
      finances.transferBudget,
      finances.cashBalance,
      finances.reservedTransferBudget ?? 0
    );
    if (owner.league_status === "OPEN") {
      hubText = `\u23F3 <b>Liga hali boshlanmagan</b>
<i>Transferlar liga startidan keyin ochiladi.</i>

${hubText}`;
    }
    await editOrReply(context, hubText, keyboard);
  };
  const showLeagueMarket = async (context, clubId, page, group = "ALL") => {
    if (!context.from) return;
    const user = await getContextUser(context);
    await transfers.saveInputSession(user.id, "ACTIVE_CLUB", { clubId });
    const clubs = await getContextManagedClubs(context, user.id);
    const club = clubs.find((c) => c.leagueClubId === clubId);
    const items = await transfers.leagueMarket(user.id, clubId, page, 8, group);
    const keyboard = buildTransferMarketKeyboard("lm", clubId, group, page, items, 8);
    await editOrReply(context, formatLeagueMarket(items, club?.leagueName, group), keyboard);
  };
  const showMarket = async (context, clubId, page, group = "ALL") => {
    if (!context.from) return;
    const user = await getContextUser(context);
    await transfers.saveInputSession(user.id, "ACTIVE_CLUB", { clubId });
    const clubs = await getContextManagedClubs(context, user.id);
    const club = clubs.find((c) => c.leagueClubId === clubId);
    const items = await transfers.market(user.id, clubId, page, 8, group);
    const keyboard = buildTransferMarketKeyboard("gm", clubId, group, page, items, 8);
    await editOrReply(context, formatMarket(items, club?.leagueName, group), keyboard);
  };
  bot.callbackQuery(/^tr:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubId = context.match[1];
    if (!(await getContextManagedClubs(context, user.id)).some((c) => c.leagueClubId === clubId)) return;
    await showTransferHub(context, clubId);
  });
  bot.callbackQuery(/^lm:([0-9a-f-]{36}):(\d+)(?::(ALL|GK|DEF|MID|ATT))?$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    await showLeagueMarket(context, context.match[1], Number(context.match[2]), context.match[3] ?? "ALL");
  });
  bot.callbackQuery(/^lb:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? session.data.clubId : void 0) ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;
    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    const item = await transfers.listing(user.id, clubId, context.match[1]);
    if (!item) {
      return editOrReply(context, "<i>Bu futbolchi transfer bozorida faol emas.</i>", new InlineKeyboard().text("\u21A9\uFE0F Orqaga", `lm:${clubId}:0:ALL`));
    }
    const kb = new InlineKeyboard();
    if (item.isOwnListing) {
      kb.text("\u274C Sotuvdan olish", `ld:${item.listingId}`).row();
    } else {
      kb.text("\u2705 Xaridni tasdiqlash", `lc:${item.listingId}`).row();
    }
    kb.text("\u21A9\uFE0F Orqaga", `lm:${clubId}:0:ALL`);
    await editOrReply(context, formatLeagueListing(item), kb);
  });
  bot.callbackQuery(/^lc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Transfer amalga oshirilmoqda\u2026" });
    const user = await getContextUser(context);
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? session.data.clubId : void 0) ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;
    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    try {
      await transfers.buy(user.id, clubId, context.match[1]);
      await editOrReply(
        context,
        "\u2705 <b>Transfer yakunlandi!</b>\n\n<i>Futbolchi klubingizga muvaffaqiyatli qo\u2018shildi.</i>",
        new InlineKeyboard().text("\u21A9\uFE0F Orqaga", `lm:${clubId}:0:ALL`).text("\u{1F3DF} Klub", `db:${clubId}`)
      );
    } catch (error) {
      logger.warn({ event: "league_transfer_failed", err: error }, "League transfer failed");
      const err = error?.message ?? "";
      let text = "\u274C <b>Transfer amalga oshmadi</b>\n<i>Qayta urinib ko\u2018ring.</i>";
      if (err.includes("INSUFFICIENT_BUDGET")) {
        text = "\u274C <b>Transfer amalga oshmadi</b>\n<i>Klub budjetida yetarli mablag\u2018 yo\u2018q.</i>";
      } else if (err.includes("SQUAD_LIMIT_REACHED")) {
        text = "\u274C <b>Transfer amalga oshmadi</b>\n<i>Tarkibda bo\u2018sh joy yo\u2018q (maksimal 30 futbolchi).</i>";
      } else if (err.includes("LISTING_NOT_AVAILABLE") || err.includes("LISTING_EXPIRED")) {
        text = "\u274C <b>Transfer amalga oshmadi</b>\n<i>Ushbu futbolchi allaqachon sotilgan yoki listing muddati tugagan.</i>";
      } else if (err.includes("LEAGUE_PRE_SEASON_LOCKED")) {
        text = "\u23F3 <b>Liga hali boshlanmagan</b>\n<i>Transferlar liga startidan keyin ochiladi.</i>";
      }
      await editOrReply(context, text, new InlineKeyboard().text("\u21A9\uFE0F Orqaga", `lm:${clubId}:0:ALL`));
    }
  });
  bot.callbackQuery(/^ld:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? session.data.clubId : void 0) ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;
    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    try {
      await transfers.delist(user.id, clubId, context.match[1]);
      await context.answerCallbackQuery({ text: "\u2705 Futbolchi sotuvdan olindi." });
      await showTransferHub(context, clubId);
    } catch (error) {
      await context.answerCallbackQuery({ text: `Xato: ${error?.message ?? "Amal bajarilmadi"}` });
    }
  });
  bot.callbackQuery(/^ts:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubId = context.match[1];
    await transfers.saveInputSession(user.id, "ACTIVE_CLUB", { clubId });
    const players = await transfers.saleCandidates(user.id, clubId);
    const kb = new InlineKeyboard();
    for (const player of players.slice(0, 20)) {
      const statusTag = player.isListed ? " \u{1F3F7} [Sotuvda]" : player.isStarting ? " \u26A0\uFE0F [Asosiy]" : "";
      kb.text(`${player.name} \xB7 ${player.position} \xB7 \u2B50${player.overall}${statusTag}`, `tl:${player.clubPlayerId}`).row();
    }
    kb.text("\u2190 Transfer markazi", `tr:${clubId}`);
    await editOrReply(
      context,
      players.length ? "\u{1F4E4} FUTBOLCHINI SOTUVGA QO\u2018YISH\n\nNarxini belgilash uchun futbolchini tanlang:\n(\u26A0\uFE0F = Asosiy tarkib o\u2018yinchisi, \u{1F3F7} = Allaqachon sotuvda)" : "Sotuvga qo\u2018yish mumkin bo\u2018lgan futbolchi yo\u2018q (kamida 18 futbolchi qolishi kerak).",
      kb
    );
  });
  const showPricePresets = async (context, userId, clubId, player) => {
    const p10 = Math.round(player.marketValue * 1.1 / 1e5) * 1e5;
    const p20 = Math.round(player.marketValue * 1.2 / 1e5) * 1e5;
    const p30 = Math.round(player.marketValue * 1.3 / 1e5) * 1e5;
    const kb = new InlineKeyboard().text(`+10% (${transferMoney(p10)})`, `tp:${player.clubPlayerId}:1.1`).row().text(`+20% (${transferMoney(p20)})`, `tp:${player.clubPlayerId}:1.2`).row().text(`+30% (${transferMoney(p30)})`, `tp:${player.clubPlayerId}:1.3`).row().text("\u2328\uFE0F Boshqa narx yozish", `tkb:${player.clubPlayerId}`).row().text("\u2190 Orqaga", `ts:${clubId}`);
    await editOrReply(
      context,
      `\u{1F4B0} ${player.name} (${player.position}, \u2B50${player.overall})

Bozor narxi: ${transferMoney(player.marketValue)}

Sotuv narxini tanlang:`,
      kb
    );
  };
  bot.callbackQuery(/^tl:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubPlayerId = context.match[1];
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? session.data.clubId : void 0) ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;
    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    const candidates = await transfers.saleCandidates(user.id, clubId);
    const player = candidates.find((p) => p.clubPlayerId === clubPlayerId);
    if (!player) {
      await context.reply("Futbolchi topilmadi.");
      return;
    }
    if (player.isListed && player.listingId) {
      const kb = new InlineKeyboard().text("\u274C Sotuvdan olish", `ld:${player.listingId}`).row().text("\u2190 Orqaga", `ts:${clubId}`);
      return editOrReply(
        context,
        `\u{1F3F7} ${player.name} hozirda transfer bozorida sotuvga qo\u2018yilgan.

Narxi: ${transferMoney(player.marketValue)}
Sotuvdan olishni xohlaysizmi?`,
        kb
      );
    }
    if (player.isStarting) {
      const kb = new InlineKeyboard().text("\u2705 Baribir sotuvga qo\u2018yish", `tn:${player.clubPlayerId}`).row().text("\u274C Bekor qilish", `ts:${clubId}`);
      return editOrReply(
        context,
        `\u26A0\uFE0F Bu futbolchi Starting XI tarkibida.

Baribir sotuvga qo\u2018ymoqchimisiz?`,
        kb
      );
    }
    await showPricePresets(context, user.id, clubId, player);
  });
  bot.callbackQuery(/^tn:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubPlayerId = context.match[1];
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? session.data.clubId : void 0) ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;
    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    const candidates = await transfers.saleCandidates(user.id, clubId);
    const player = candidates.find((p) => p.clubPlayerId === clubPlayerId);
    if (!player) return context.reply("Futbolchi topilmadi.");
    await showPricePresets(context, user.id, clubId, player);
  });
  bot.callbackQuery(/^tp:([0-9a-f-]{36}):([0-9.]+)$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Sotuvga qo\u2018yilmoqda\u2026" });
    const user = await getContextUser(context);
    const clubPlayerId = context.match[1];
    const mult = Number(context.match[2]);
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? session.data.clubId : void 0) ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;
    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    const candidates = await transfers.saleCandidates(user.id, clubId);
    const player = candidates.find((p) => p.clubPlayerId === clubPlayerId);
    if (!player) return context.reply("Futbolchi topilmadi.");
    const askingPrice = Math.round(player.marketValue * mult / 1e5) * 1e5;
    try {
      await transfers.listForSale(user.id, clubId, clubPlayerId, askingPrice);
      await editOrReply(
        context,
        `\u2705 <b>${escapeHtml(player.name)}</b> <b>${formatMoney(askingPrice)}</b> narxida transfer bozoriga qo\u2018yildi!`,
        new InlineKeyboard().text("\u{1F6D2} Transfer bozorini ko\u2018rish", `lm:${clubId}:0:ALL`).row().text("\u21A9\uFE0F Orqaga", `ts:${clubId}`)
      );
    } catch (error) {
      const err = error?.message ?? "";
      let text = "\u274C <b>Futbolchini sotuvga qo\u2018yib bo\u2018lmadi</b>\n<i>Qayta urinib ko\u2018ring.</i>";
      if (err.includes("LEAGUE_PRE_SEASON_LOCKED")) {
        text = "\u23F3 <b>Liga hali boshlanmagan</b>\n<i>Transferlar liga startidan keyin ochiladi.</i>";
      }
      await editOrReply(
        context,
        text,
        new InlineKeyboard().text("\u21A9\uFE0F Orqaga", `ts:${clubId}`)
      );
    }
  });
  bot.callbackQuery(/^tkb:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubPlayerId = context.match[1];
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? session.data.clubId : void 0) ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;
    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    const candidates = await transfers.saleCandidates(user.id, clubId);
    const player = candidates.find((p) => p.clubPlayerId === clubPlayerId);
    if (!player) return context.reply("Futbolchi topilmadi.");
    const minimum = Math.max(1e5, Math.round(player.marketValue * 0.5));
    await transfers.saveInputSession(user.id, "SELL", {
      clubId,
      clubPlayerId,
      playerName: player.name,
      minimum
    });
    await editOrReply(
      context,
      `\u{1F4B0} <b>${escapeHtml(player.name)}</b> uchun sotuv narxini yuboring.

Minimal narx: <b>${formatMoney(minimum)}</b>
<i>Misol: 45M yoki 45000000</i>`,
      new InlineKeyboard().text("\u21A9\uFE0F Orqaga", `ts:${clubId}`)
    );
  });
  bot.callbackQuery(/^tf:([0-9a-f-]{36}):(\d+)$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubId = context.match[1];
    const page = Number(context.match[2]);
    const clubs = await transfers.leagueClubs(user.id, clubId);
    const kb = new InlineKeyboard();
    for (const club of clubs.slice(page * 10, (page + 1) * 10)) {
      kb.text(`\u{1F3DF} ${club.clubName}`, `tk:${club.leagueClubId}:0`).row();
    }
    if (page > 0) kb.text("\u2B05\uFE0F", `tf:${clubId}:${page - 1}`);
    if ((page + 1) * 10 < clubs.length) kb.text("\u27A1\uFE0F", `tf:${clubId}:${page + 1}`);
    if (page > 0 || (page + 1) * 10 < clubs.length) kb.row();
    kb.text("\u21A9\uFE0F Orqaga", `tr:${clubId}`);
    await editOrReply(
      context,
      clubs.length ? "\u{1F50E} <b>LIGADAN IZLASH</b>\n\n<i>Raqib klubni tanlang va uning futbolchilariga taklif yuboring:</i>" : "\u{1F50E} <b>LIGADAN IZLASH</b>\n\n<i>Bu ligada boshqa raqib klublar topilmadi.</i>",
      kb
    );
  });
  bot.callbackQuery(/^tk:([0-9a-f-]{36}):(\d+)$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const targetClubId = context.match[1];
    const page = Number(context.match[2]);
    const buyerClubId = await transfers.buyerClubForTarget(user.id, targetClubId);
    if (!buyerClubId) {
      await context.reply("Ushbu ligada sizning faol klubingiz topilmadi.");
      return;
    }
    const players = await transfers.clubTargets(user.id, buyerClubId, targetClubId, page, 15);
    const targetClubName = players[0]?.clubName ?? "Raqib klub";
    const kb = new InlineKeyboard();
    for (const player of players) {
      kb.text(`\u26BD ${player.name} \xB7 ${player.position} \xB7 \u2B50${player.overall}`, `tp:${player.clubPlayerId}`).row();
    }
    if (page > 0) kb.text("\u2B05\uFE0F", `tk:${targetClubId}:${page - 1}`);
    if (players.length === 15) kb.text("\u27A1\uFE0F", `tk:${targetClubId}:${page + 1}`);
    if (page > 0 || players.length === 15) kb.row();
    kb.text("\u21A9\uFE0F Orqaga", `tf:${buyerClubId}:0`);
    await editOrReply(context, formatClubPlayers(targetClubName, players), kb);
  });
  bot.callbackQuery(/^tp:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubPlayerId = context.match[1];
    const buyerClubId = await transfers.buyerClubForPlayer(user.id, clubPlayerId);
    const player = await transfers.targetPlayer(clubPlayerId, buyerClubId ?? void 0);
    if (!player) {
      await context.reply("Futbolchi ma\u2019lumotlari topilmadi.");
      return;
    }
    if (player.activeNegotiation) {
      const kb2 = new InlineKeyboard();
      if (player.activeNegotiation.status === "COUNTERED") {
        kb2.text("\u2705 Qabul qilish", `ia:${player.activeNegotiation.offerId}`).text("\u274C Rad etish", `ir:${player.activeNegotiation.offerId}`).row();
      }
      kb2.text("\u21A9\uFE0F Orqaga", player.targetClubId ? `tk:${player.targetClubId}:0` : "home:club");
      const negText = [
        "\u23F3 <b>Muzokara davom etmoqda</b>",
        "",
        `\u{1F464} <b>${escapeHtml(player.name.toUpperCase())}</b>`,
        `\u{1F3DF} ${escapeHtml(player.clubName)}`,
        `\u{1F4CD} ${escapeHtml(player.position)} \xB7 \u2B50<b>${player.overall}</b>`,
        "",
        player.activeNegotiation.status === "COUNTERED" ? `<b>${escapeHtml(player.clubName)}</b> qarshi taklifi: <b>${formatMoney(player.activeNegotiation.counterAmount)}</b>` : `<i>Yuborilgan taklifingiz (${formatMoney(player.activeNegotiation.amount)}) ko\u2018rib chiqilmoqda\u2026</i>`
      ].join("\n");
      return editOrReply(context, negText, kb2);
    }
    if (player.isResaleLocked) {
      const kb2 = new InlineKeyboard().text("\u21A9\uFE0F Orqaga", player.targetClubId ? `tk:${player.targetClubId}:0` : "home:club");
      return editOrReply(
        context,
        `\u{1F464} <b>${escapeHtml(player.name.toUpperCase())}</b>

\u{1F512} <i>Bu futbolchi yaqinda transfer qilingan va qayta sotilishi vaqtincha cheklangan.</i>`,
        kb2
      );
    }
    const kb = new InlineKeyboard().text(`120% (${transferMoney(Math.round(player.marketValue * 1.2))})`, `of:${player.clubPlayerId}:120`).text(`130% (${transferMoney(Math.round(player.marketValue * 1.3))})`, `of:${player.clubPlayerId}:130`).row().text(`140% (${transferMoney(Math.round(player.marketValue * 1.4))})`, `of:${player.clubPlayerId}:140`).text(`150% (${transferMoney(Math.round(player.marketValue * 1.5))})`, `of:${player.clubPlayerId}:150`).row().text("\u270D\uFE0F Boshqa summa kiritish", `oc:${player.clubPlayerId}`).row().text("\u21A9\uFE0F Orqaga", player.targetClubId ? `tk:${player.targetClubId}:0` : "home:club");
    await editOrReply(context, formatPlayerProfile(player), kb);
  });
  bot.callbackQuery(/^of:([0-9a-f-]{36}):(\d+)$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Taklif yuborilmoqda\u2026" });
    const user = await getContextUser(context);
    const clubPlayerId = context.match[1];
    const pct = Number(context.match[2]);
    const player = await transfers.targetPlayer(clubPlayerId);
    if (!player) {
      await context.reply("Futbolchi topilmadi.");
      return;
    }
    const buyerClubId = await transfers.buyerClubForPlayer(user.id, clubPlayerId);
    if (!buyerClubId) {
      await context.reply("Ushbu futbolchining ligasida klubingiz topilmadi.");
      return;
    }
    const amount = Math.round(player.marketValue * (pct / 100));
    try {
      const result = await transfers.offer(user.id, buyerClubId, clubPlayerId, amount);
      const offer = await transfers.notification(result.offerId);
      if (result.status === "PENDING" && offer?.sellerTelegramId) {
        await sendUpdate(
          offer.sellerTelegramId,
          [
            "\u{1F4E5} <b>TRANSFER TAKLIFI</b>",
            "",
            `<b>${escapeHtml(offer.buyerClub)}</b>`,
            `sizning <b>${escapeHtml(player.name)}</b> futbolchingiz uchun`,
            "",
            `\u{1F4B6} <b>${formatMoney(amount)}</b> taklif qildi.`
          ].join("\n"),
          new InlineKeyboard().text("\u2705 Qabul qilish", `ia:${result.offerId}`).text("\u274C Rad etish", `ir:${result.offerId}`).row().text("\u2194\uFE0F Counter", `ic:${result.offerId}`)
        );
      }
      const text = result.status === "ACCEPTED" ? `\u2705 <b>Transfer yakunlandi!</b>

<b>${escapeHtml(player.name)}</b> klubingiz safiga qo\u2018shildi.` : result.status === "COUNTERED" ? `\u23F3 <b>Muzokara davom etmoqda</b>

<b>${escapeHtml(player.clubName)}</b> qarshi taklifi: <b>${formatMoney(result.counterAmount)}</b>` : result.status === "PENDING" ? `\u23F3 <b>Taklif yuborildi</b>

<i>Taklif ${escapeHtml(player.clubName)} murabbiyiga yuborildi.</i>` : `\u274C <b>Taklif rad etildi</b>

<i>${escapeHtml(player.clubName)} taklifni rad etdi.</i>`;
      await editOrReply(
        context,
        text,
        new InlineKeyboard().text("\u21A9\uFE0F Orqaga", player.targetClubId ? `tk:${player.targetClubId}:0` : `tr:${buyerClubId}`)
      );
    } catch (error) {
      const code = error?.message ?? "";
      const msg = code === "INSUFFICIENT_BUDGET" ? "\u274C <b>Taklif yuborilmadi</b>\n<i>Klub budjetida yetarli mablag\u2018 yo\u2018q.</i>" : code === "PLAYER_NOT_AVAILABLE" ? "\u274C <b>Transfer cheklangan</b>\n<i>Futbolchi transfer uchun ochiq emas yoki yaqinda sotib olingan.</i>" : code === "LEAGUE_PRE_SEASON_LOCKED" ? "\u23F3 <b>Liga hali boshlanmagan</b>\n<i>Transferlar liga startidan keyin ochiladi.</i>" : "\u274C <b>Taklif yuborilmadi</b>\n<i>Qayta urinib ko\u2018ring.</i>";
      await context.reply(msg, { parse_mode: "HTML" });
    }
  });
  bot.callbackQuery(/^oc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubPlayerId = context.match[1];
    const player = await transfers.targetPlayer(clubPlayerId);
    if (!player) {
      await context.reply("Futbolchi topilmadi.");
      return;
    }
    const buyerClubId = await transfers.buyerClubForPlayer(user.id, clubPlayerId);
    if (!buyerClubId) {
      await context.reply("Ushbu ligada klubingiz topilmadi.");
      return;
    }
    const minimum = Math.max(1e5, Math.round(player.marketValue * 0.5));
    await transfers.saveInputSession(user.id, "OFFER", {
      clubId: buyerClubId,
      clubPlayerId,
      playerName: player.name,
      minimum
    });
    await editOrReply(
      context,
      `\u{1F91D} ${player.name} uchun taklif miqdorini yuboring.

Bozor qiymati: ${transferMoney(player.marketValue)}
Minimal taklif: ${transferMoney(minimum)}
Misol: 55M yoki 55000000`,
      new InlineKeyboard().text("\u2190 Bekor qilish", `tp:${clubPlayerId}`)
    );
  });
  bot.callbackQuery(/^io:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubId = context.match[1];
    const offers = await transfers.incomingOffers(user.id, clubId);
    const kb = new InlineKeyboard();
    for (const offer of offers) {
      kb.text(`${offer.playerName} \xB7 ${offer.buyerClub} \xB7 ${transferMoney(offer.amount)}`, `iv:${offer.offerId}`).row();
    }
    kb.text("\u21A9\uFE0F Orqaga", `tr:${clubId}`);
    await editOrReply(
      context,
      offers.length ? "\u{1F4E5} <b>TAKLIFLAR</b>\n\n<i>Taklifni ochib qabul qiling yoki rad eting:</i>" : "\u{1F4E5} <b>TAKLIFLAR</b>\n\n<i>Hozircha aktiv takliflar yo\u2018q.</i>",
      kb
    );
  });
  bot.callbackQuery(/^iv:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const offerId = context.match[1];
    const offer = await transfers.notification(offerId);
    if (!offer) return context.answerCallbackQuery({ text: "Taklif endi faol emas" });
    const text = [
      "\u{1F4E5} <b>TRANSFER TAKLIFI</b>",
      "",
      `<b>${escapeHtml(offer.buyerClub)}</b>`,
      `sizning <b>${escapeHtml(offer.playerName)}</b> futbolchingiz uchun`,
      "",
      `\u{1F4B6} <b>${formatMoney(offer.amount)}</b> taklif qildi.`
    ].join("\n");
    await editOrReply(
      context,
      text,
      new InlineKeyboard().text("\u2705 Qabul qilish", `ia:${offer.offerId}`).text("\u274C Rad etish", `ir:${offer.offerId}`).row().text("\u2194\uFE0F Counter", `ic:${offer.offerId}`).row().text("\u21A9\uFE0F Orqaga", `io:${offer.sellerClubId}`)
    );
  });
  bot.callbackQuery(/^ic:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const offer = await transfers.notification(context.match[1]);
    if (!offer || offer.sellerTelegramId !== context.from.id) {
      return context.answerCallbackQuery({ text: "Taklif endi faol emas" });
    }
    const minimum = offer.amount + 1e5;
    await transfers.saveInputSession(user.id, "COUNTER", {
      offerId: offer.offerId,
      playerName: offer.playerName,
      minimum
    });
    await editOrReply(
      context,
      `\u2194\uFE0F <b>${escapeHtml(offer.playerName)}</b> uchun qarshi taklif summasini yuboring.

Asl taklif: <b>${formatMoney(offer.amount)}</b>
Minimal: <b>${formatMoney(minimum)}</b>`,
      new InlineKeyboard().text("\u21A9\uFE0F Orqaga", `iv:${offer.offerId}`)
    );
  });
  bot.callbackQuery(/^ac:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const offer = await transfers.notification(context.match[1]);
    if (!offer || offer.buyerTelegramId !== context.from.id) {
      return context.answerCallbackQuery({ text: "Taklif endi faol emas" });
    }
    await context.answerCallbackQuery({ text: "Transfer yakunlanmoqda\u2026" });
    try {
      await transfers.acceptCounterOffer(user.id, offer.offerId);
      await sendUpdate(offer.sellerTelegramId, `\u2705 ${offer.playerName} bo\u2018yicha qarshi taklif qabul qilindi. Transfer yakunlandi.`, new InlineKeyboard());
      await editOrReply(context, `\u2705 ${offer.playerName} transferi yakunlandi.`, new InlineKeyboard().text("\u2190 Transfer markazi", `tr:${offer.buyerClubId}`));
    } catch {
      await context.reply("Qarshi taklif endi faol emas yoki budjet yetarli emas.");
    }
  });
  bot.callbackQuery(/^(ia|ir):([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const offer = await transfers.notification(context.match[2]);
    if (!offer || offer.sellerTelegramId !== context.from.id) {
      return context.answerCallbackQuery({ text: "Taklif endi faol emas" });
    }
    await context.answerCallbackQuery({ text: "Taklif qayta ishlanmoqda\u2026" });
    try {
      const accepted = context.match[1] === "ia";
      const result = await transfers.respondToOffer(user.id, offer.offerId, accepted ? "ACCEPT" : "REJECT");
      await sendUpdate(
        offer.buyerTelegramId,
        accepted ? `\u2705 ${offer.playerName} uchun ${transferMoney(offer.amount)} taklifingiz qabul qilindi. Transfer yakunlandi.` : `\u274C ${offer.playerName} uchun taklifingiz rad etildi.`,
        new InlineKeyboard()
      );
      await editOrReply(
        context,
        result === "ACCEPTED" ? "\u2705 Transfer qabul qilindi. Futbolchi xaridor klubiga o\u2018tdi." : "\u274C Taklif rad etildi.",
        new InlineKeyboard().text("\u2190 Transfer markazi", `tr:${offer.sellerClubId}`)
      );
    } catch (error) {
      logger.warn({ event: "incoming_offer_response_failed", err: error }, "Incoming offer response failed");
      await context.reply("Taklifni qayta ishlab bo\u2018lmadi. U muddatidan o\u2018tgan bo\u2018lishi mumkin.");
    }
  });
  bot.callbackQuery(/^th:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubId = context.match[1];
    const history = await transfers.transferHistory(clubId);
    await editOrReply(
      context,
      formatTransferHistory(history),
      new InlineKeyboard().text("\u2190 Transfer markazi", `tr:${clubId}`)
    );
  });
  bot.callbackQuery(/^gm:([0-9a-f-]{36}):(\d+)(?::(ALL|GK|DEF|MID|ATT))?$/, async (context) => {
    await context.answerCallbackQuery();
    await showMarket(context, context.match[1], Number(context.match[2]), context.match[3] ?? "ALL");
  });
  bot.callbackQuery(/^gb:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? session.data.clubId : void 0) ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;
    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    const item = await transfers.listing(user.id, clubId, context.match[1]);
    if (!item) {
      return editOrReply(context, "<i>Bu futbolchi Global Transfer bozorida faol emas.</i>", new InlineKeyboard().text("\u21A9\uFE0F Orqaga", `gm:${clubId}:0:ALL`));
    }
    await editOrReply(
      context,
      formatListing(item),
      new InlineKeyboard().text("\u2705 Xaridni tasdiqlash", `gc:${item.listingId}`).row().text("\u21A9\uFE0F Orqaga", `gm:${clubId}:0:ALL`)
    );
  });
  bot.callbackQuery(/^gc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Transfer tekshirilmoqda\u2026" });
    const user = await getContextUser(context);
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? session.data.clubId : void 0) ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;
    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    try {
      await transfers.buy(user.id, clubId, context.match[1]);
      await editOrReply(
        context,
        "\u2705 <b>Transfer yakunlandi!</b>\n\n<i>Futbolchi klubingizga qo\u2018shildi va asosiy tarkibingizga kiritildi.</i>",
        new InlineKeyboard().text("\u21A9\uFE0F Orqaga", `gm:${clubId}:0:ALL`).text("\u{1F3DF} Klub", `db:${clubId}`)
      );
    } catch (error) {
      logger.warn({ event: "global_transfer_failed", err: error }, "Global transfer failed");
      const err = error?.message ?? "";
      let text = "\u274C <b>Transfer amalga oshmadi</b>\n<i>Qayta urinib ko\u2018ring.</i>";
      if (err.includes("INSUFFICIENT_BUDGET")) {
        text = "\u274C <b>Transfer amalga oshmadi</b>\n<i>Klub budjetida yetarli mablag\u2018 yo\u2018q.</i>";
      } else if (err.includes("SQUAD_LIMIT_REACHED")) {
        text = "\u274C <b>Transfer amalga oshmadi</b>\n<i>Tarkibda bo\u2018sh joy yo\u2018q (maksimal 30 futbolchi).</i>";
      } else if (err.includes("LISTING_NOT_ACTIVE") || err.includes("LISTING_NOT_AVAILABLE") || err.includes("LISTING_EXPIRED")) {
        text = "\u274C <b>Transfer amalga oshmadi</b>\n<i>Ushbu futbolchi allaqachon sotilgan yoki listing muddati tugagan.</i>";
      } else if (err.includes("LEAGUE_PRE_SEASON_LOCKED")) {
        text = "\u23F3 <b>Liga hali boshlanmagan</b>\n<i>Transferlar liga startidan keyin ochiladi.</i>";
      }
      await editOrReply(context, text, new InlineKeyboard().text("\u21A9\uFE0F Orqaga", `gm:${clubId}:0:ALL`));
    }
  });
  bot.on("message:text", async (context, next) => {
    if (!context.from) return next();
    const user = await getContextUser(context);
    const pending = await transfers.getInputSession(user.id);
    if (!pending || pending.mode !== "SELL" && pending.mode !== "OFFER" && pending.mode !== "COUNTER") {
      return next();
    }
    const data = pending.data;
    const raw = context.message.text.trim().replace(/\s/g, "").replace(",", ".");
    const isMillions = raw.toLowerCase().endsWith("m");
    const amount = Number(isMillions ? raw.slice(0, -1) : raw) * (isMillions ? 1e6 : 1);
    if (!Number.isFinite(amount) || amount < data.minimum) {
      await context.reply(`Miqdor noto\u2018g\u2018ri. Kamida ${transferMoney(data.minimum)} yuboring.`);
      return;
    }
    await transfers.clearInputSession(user.id);
    try {
      if (pending.mode === "SELL") {
        await transfers.listForSale(user.id, data.clubId, data.clubPlayerId, Math.round(amount));
        await context.reply(`\u2705 ${data.playerName} ${transferMoney(Math.round(amount))} narxda transfer bozoriga qo\u2018yildi.`, {
          reply_markup: new InlineKeyboard().text("\u2190 Transfer markazi", `tr:${data.clubId}`)
        });
      } else if (pending.mode === "COUNTER") {
        await transfers.counterOffer(user.id, data.offerId, Math.round(amount));
        const offer = await transfers.notification(data.offerId);
        await sendUpdate(
          offer?.buyerTelegramId ?? null,
          `\u{1F4AC} ${offer?.sellerClub ?? "Murabbiy"} ${data.playerName} uchun qarshi taklif yubordi: ${transferMoney(Math.round(amount))}`,
          new InlineKeyboard().text("\u2705 Qarshi taklifni qabul qilish", `ac:${data.offerId}`)
        );
        await context.reply("\u2705 Qarshi taklif xaridor murabbiyiga yuborildi.");
      } else {
        const result = await transfers.offer(user.id, data.clubId, data.clubPlayerId, Math.round(amount));
        const offer = await transfers.notification(result.offerId);
        if (result.status === "PENDING") {
          await sendUpdate(
            offer?.sellerTelegramId ?? null,
            `\u{1F4E9} YANGI TRANSFER TAKLIFI

\u26BD ${data.playerName}
\u{1F3DF} Xaridor: ${offer?.buyerClub ?? "Klub"}
\u{1F4B0} Taklif: ${transferMoney(Math.round(amount))}`,
            new InlineKeyboard().text("\u2705 Qabul qilish", `ia:${result.offerId}`).text("\u274C Rad etish", `ir:${result.offerId}`).row().text("\u{1F4AC} Qarshi taklif", `ic:${result.offerId}`)
          );
        }
        const text = result.status === "ACCEPTED" ? `\u2705 ${data.playerName} transferi yakunlandi!` : result.status === "COUNTERED" ? `\u{1F91D} Qarshi taklif: ${transferMoney(result.counterAmount)}` : result.status === "PENDING" ? "\u23F3 Taklif klub murabbiyiga yuborildi." : "\u274C Taklif rad etildi.";
        await context.reply(text, {
          reply_markup: new InlineKeyboard().text("\u2190 Transfer markazi", `tr:${data.clubId}`)
        });
      }
    } catch (error) {
      logger.warn({ event: "transfer_input_failed", err: error }, "Transfer input failed");
      await context.reply("Transfer amalga oshmadi: budjet, tarkib limiti yoki futbolchi holatini tekshiring.");
    }
  });
  bot.on("message:text", async (context, next) => {
    if (!context.from) return next();
    if (!privateLeagueJoinPending.delete(context.from.id)) return next();
    const code = context.message.text.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(code)) {
      await context.reply("Kod 8 ta harf yoki raqamdan iborat bo\u2018lishi kerak. Qaytadan \u201CKod bilan qo\u2018shilish\u201D ni bosing.");
      return;
    }
    const privateLeague = await leagues.privateLeagueByCode(code);
    if (!privateLeague) {
      await context.reply("Bunday private liga kodi topilmadi.");
      return;
    }
    const clubs = await leagues.listPrivateAvailableClubs(privateLeague.leagueId);
    await context.reply(`\u{1F512} PRIVATE LIGA \xB7 ${code}

Klub tanlang:`, { reply_markup: privateClubKeyboard(clubs, code, 0) });
  });
  bot.callbackQuery("join", async (context) => {
    await context.answerCallbackQuery();
    await showCompetitions(context);
  });
  bot.callbackQuery("pv", async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const competitions = await leagues.listCompetitions(), kb = new InlineKeyboard();
    for (const competition of competitions) kb.text(`\u{1F512} ${competition.name}`, `pc:${competition.id}`).row();
    kb.text("\u2190 Ligalar", "join");
    await editOrReply(context, "\u{1F512} PRIVATE LIGA YARATISH\n\nChempionatni tanlang. Keyin sizga do\u2018stlaringizga yuboriladigan 8 belgili taklif kodi beriladi:", kb);
  });
  bot.callbackQuery(/^pc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Private liga yaratilmoqda\u2026" });
    const user = await getContextUser(context);
    try {
      const league = await leagues.createPrivateLeague(user.id, context.match[1]);
      await editOrReply(context, `\u2705 PRIVATE LIGA TAYYOR

\u{1F511} Taklif kodi: ${league.inviteCode}

Kodni do\u2018stlaringizga yuboring. Ular \u201CKod bilan qo\u2018shilish\u201D bo\u2018limida yozadi. Endi o\u2018zingiz klub tanlang:`, privateClubKeyboard(await leagues.listPrivateAvailableClubs(league.leagueId), league.inviteCode, 0));
    } catch (error) {
      logger.warn({ event: "private_league_create_failed", err: error }, "Private league create failed");
      await context.reply("Private liga yaratilmadi. Keyinroq qayta urinib ko\u2018ring.");
    }
  });
  bot.callbackQuery("pj", async (context) => {
    if (!context.from) return;
    privateLeagueJoinPending.add(context.from.id);
    await context.answerCallbackQuery();
    await editOrReply(context, "\u{1F511} PRIVATE LIGAGA QO\u2018SHILISH\n\nDo\u2018stingiz yuborgan 8 belgili taklif kodini bitta xabar qilib yozing:", new InlineKeyboard().text("\u2190 Ligalar", "join"));
  });
  const privateClubKeyboard = (clubs, code, page) => {
    const kb = new InlineKeyboard();
    for (const club of clubs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) kb.text(`\u26BD ${club.clubName}`, `pcf:${club.leagueClubId}:${code}`).row();
    if (page > 0) kb.text("\u2190 Oldingi", `ppi:${code}:${page - 1}`);
    if ((page + 1) * PAGE_SIZE < clubs.length) kb.text("Keyingi \u2192", `ppi:${code}:${page + 1}`);
    if (page > 0 || (page + 1) * PAGE_SIZE < clubs.length) kb.row();
    return kb.text("\u2190 Ligalar", "join");
  };
  bot.callbackQuery(/^ppi:([A-Z0-9]{8}):(\d+)$/, async (context) => {
    await context.answerCallbackQuery();
    const privateLeague = await leagues.privateLeagueByCode(context.match[1]);
    if (!privateLeague) return;
    await editOrReply(context, "\u26BD PRIVATE LIGADA KLUB TANLANG:", privateClubKeyboard(await leagues.listPrivateAvailableClubs(privateLeague.leagueId), privateLeague.inviteCode, Number(context.match[2])));
  });
  bot.callbackQuery(/^pcf:([0-9a-f-]{36}):([A-Z0-9]{8})$/, async (context) => {
    await context.answerCallbackQuery();
    const clubId = context.match[1], code = context.match[2];
    await editOrReply(context, "\u26BD Shu klubni private ligada boshqarishni tasdiqlaysizmi?", new InlineKeyboard().text("\u2705 Tasdiqlash", `pcl:${clubId}:${code}`).row().text("\u2190 Orqaga", `ppi:${code}:0`));
  });
  bot.callbackQuery(/^pcl:([0-9a-f-]{36}):([A-Z0-9]{8})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Klub biriktirilmoqda\u2026" });
    const user = await getContextUser(context);
    try {
      const result = await leagues.claimPrivateClub(user.id, context.match[2], context.match[1]);
      const club = (await getContextManagedClubs(context, user.id)).find((item) => item.leagueClubId === result.leagueClubId);
      if (club) await showDashboard(context, club);
    } catch (error) {
      logger.warn({ event: "private_club_claim_failed", err: error }, "Private club claim failed");
      await context.reply("Klub band bo\u2018lib qolgan yoki taklif kodi yaroqsiz.");
    }
  });
  bot.callbackQuery(/^cmp:([0-9a-f-]{36})$/, async (context) => {
    await context.answerCallbackQuery();
    const competitionId = context.match[1];
    const leagueList = await leagues.listJoinableLeagues(competitionId);
    if (leagueList.length === 0) {
      await editOrReply(context, "<i>Hozir bo\u2018sh public liga yo\u2018q. Keyinroq qayta urinib ko\u2018ring.</i>", new InlineKeyboard().text("\u21A9\uFE0F Orqaga", "join"));
      return;
    }
    const keyboard = new InlineKeyboard();
    for (const league of leagueList) keyboard.text(`${league.name} \xB7 ${league.availableClubs} klub`, `lg:${league.id}:0`).row();
    keyboard.text("\u21A9\uFE0F Orqaga", "join");
    await editOrReply(context, "\u{1F3DF} <b>OCHIQ LIGALAR</b>\n\n<i>Klub olish uchun ligani tanlang:</i>", keyboard);
  });
  bot.callbackQuery(/^lg:([0-9a-f-]{36})(?::(\d+))?$/, async (context) => {
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const managed = await getContextManagedClubs(context, user.id);
    if (managed.length >= 2) {
      await editOrReply(
        context,
        "\u274C <b>Limitga yetdingiz</b>\n\n<i>Bir murabbiy bir vaqtda maksimal 2 ta faol turnirda qatnasha oladi.</i>",
        new InlineKeyboard().text("\u{1F3C6} Ligalar", "join")
      );
      return;
    }
    const leagueId = context.match[1];
    const requestedPage = context.match[2] ? Number(context.match[2]) : 0;
    try {
      const details = await leagues.listAllLeagueClubs(leagueId);
      if (details.clubs.length === 0) {
        await editOrReply(context, "<i>Bu ligadagi barcha klublar band bo\u2018ldi yoki liga topilmadi.</i>", new InlineKeyboard().text("\u21A9\uFE0F Orqaga", "join"));
        return;
      }
      const flag = competitionFlag(details.competitionCode);
      const headerTitle = `${flag} <b>${escapeHtml(details.competitionName.toUpperCase())}</b>
<i>Klub tanlang</i>`;
      const lastPage = Math.max(0, Math.ceil(details.clubs.length / PAGE_SIZE) - 1);
      const page = Math.min(requestedPage, lastPage);
      await editOrReply(context, headerTitle, clubListKeyboard(details.clubs, leagueId, page));
    } catch (error) {
      logger.warn({ event: "list_league_clubs_failed", err: error, leagueId }, "Failed to list league clubs");
      await editOrReply(context, "\u274C <b>Amal bajarilmadi</b>\n<i>Qayta urinib ko\u2018ring.</i>", new InlineKeyboard().text("\u21A9\uFE0F Orqaga", "join"));
    }
  });
  bot.callbackQuery("cb:band", async (context) => {
    await context.answerCallbackQuery({ text: "Bu klub band. Boshqa klub tanlang." });
  });
  bot.callbackQuery("noop", async (context) => {
    await context.answerCallbackQuery();
  });
  bot.callbackQuery(/^cf:([0-9a-f-]{36})$/, async (context) => {
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const managed = await getContextManagedClubs(context, user.id);
    if (managed.length >= 2) {
      await editOrReply(
        context,
        "\u274C <b>Limitga yetdingiz</b>\n\n<i>Bir murabbiy bir vaqtda maksimal 2 ta faol turnirda qatnasha oladi.</i>",
        new InlineKeyboard().text("\u{1F3C6} Ligalar", "join")
      );
      return;
    }
    const leagueClubId = context.match[1];
    const club = await leagues.getAvailableClub(leagueClubId);
    if (!club) {
      await editOrReply(context, "<i>Bu klub endi mavjud emas. Ro\u2018yxatdan boshqa klub tanlang.</i>", new InlineKeyboard().text("\u21A9\uFE0F Orqaga", "join"));
      return;
    }
    const keyboard = new InlineKeyboard().text("\u2705 Tasdiqlash", `cl:${club.leagueClubId}`).row().text("\u21A9\uFE0F Orqaga", "join");
    await editOrReply(context, `<b>${escapeHtml(club.clubName)}</b> klubini boshqarishni tasdiqlaysizmi?

<i>Klubning mavjud holati saqlanadi.</i>`, keyboard);
  });
  bot.callbackQuery(/^cl:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Klub tekshirilmoqda\u2026" });
    const user = await getContextUser(context);
    try {
      const result = await leagues.claimClub(user.id, context.match[1]);
      logger.info({ event: "club_claimed", userId: user.id, leagueClubId: result.leagueClubId }, "Club claimed");
      delete context.managedClubs;
      const club = (await leagues.listManagedClubs(user.id)).find((item) => item.leagueClubId === result.leagueClubId);
      if (!club) throw new Error("CLAIMED_CLUB_NOT_FOUND");
      await showDashboard(context, club);
    } catch (error) {
      logger.warn({ event: "club_claim_failed", err: error, userId: user.id }, "Club claim failed");
      await editOrReply(context, claimErrorMessage(error), new InlineKeyboard().text("\u21A9\uFE0F Orqaga", "join"));
    }
  });
  bot.callbackQuery(/^lx:([0-9a-f-]{36})$/, async (context) => {
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const leagueClubId = context.match[1];
    const clubs = await leagues.listManagedClubs(user.id);
    const club = clubs.find((c) => c.leagueClubId === leagueClubId);
    if (!club) {
      await editOrReply(context, "<i>Klub topilmadi yoki sizga tegishli emas.</i>", new InlineKeyboard().text("\u21A9\uFE0F Orqaga", "menu:leagues"));
      return;
    }
    const isPending = club.status === "OPEN";
    const statusNote = isPending ? "\u2022 Ushbu liga hali boshlanmagan (OPEN). Chiqsangiz, klub darhol boshqa managerlar uchun bo\u2018shaydi." : "\u2022 Ushbu liga allaqachon FAOL (ACTIVE). Chiqsangiz, klub AI boshqaruviga o\u2018tkaziladi (tarkib, ochkolar va byudjet saqlanadi). Siz ushbu mavsumda bu ligaga qayta kira olmaysiz.";
    const text = [
      `\u26A0\uFE0F <b>Ligadan chiqishni tasdiqlaysizmi?</b>`,
      "",
      `\u{1F3DF} Klub: <b>${escapeHtml(club.clubName)}</b>`,
      `\u{1F3C6} Liga: <i>${escapeHtml(club.leagueName)}</i>`,
      "",
      statusNote,
      "",
      `<i>Rostdan ham ushbu ligani tark etmoqchimisiz?</i>`
    ].join("\n");
    const keyboard = new InlineKeyboard().text("\u2705 Ha, chiqish", `lxc:${club.leagueClubId}`).row().text("\u274C Bekor qilish", `db:${club.leagueClubId}`);
    await editOrReply(context, text, keyboard);
  });
  bot.callbackQuery(/^lxc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Ligadan chiqilmoqda\u2026" });
    const user = await getContextUser(context);
    const leagueClubId = context.match[1];
    try {
      const result = await leagues.exitLeagueClub(user.id, leagueClubId);
      logger.info({ event: "league_exited", userId: user.id, leagueClubId, result }, "User exited league");
      delete context.managedClubs;
      const message = [
        "\u2705 <b>Siz ligadan muvaffaqiyatli chiqdingiz!</b>",
        "",
        `\u{1F3DF} Klub: <b>${escapeHtml(result.clubName)}</b>`,
        `\u{1F3C6} Liga: <i>${escapeHtml(result.leagueName)}</i>`,
        "",
        result.leagueStatus === "OPEN" ? "<i>Klub boshqa managerlar uchun bo\u2018shatildi.</i>" : "<i>Klub AI boshqaruviga o\u2018tkazildi.</i>"
      ].join("\n");
      const keyboard = new InlineKeyboard().text("\u{1F3C6} Ligalar ro\u2018yxati", "menu:leagues");
      await editOrReply(context, message, keyboard);
    } catch (error) {
      logger.warn({ event: "league_exit_failed", err: error, userId: user.id }, "League exit failed");
      await editOrReply(
        context,
        "\u274C <b>Xatolik yuz berdi</b>\n<i>Ligadan chiqishda xatolik yuz berdi yoki ruxsat berilmadi.</i>",
        new InlineKeyboard().text("\u21A9\uFE0F Orqaga", "menu:leagues")
      );
    }
  });
  bot.callbackQuery(/^db:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const club = (await getContextManagedClubs(context, user.id)).find((item) => item.leagueClubId === context.match[1]);
    if (!club) {
      await context.reply("Bu klub sizga tegishli emas.");
      return;
    }
    await showDashboard(context, club);
  });
  bot.callbackQuery(/^sq:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const leagueClubId = context.match[1];
    const club = (await getContextManagedClubs(context, user.id)).find((item) => item.leagueClubId === leagueClubId);
    if (!club) {
      await context.reply("Bu klub sizga tegishli emas.");
      return;
    }
    const players = await squads.listOwnedClubSquad(user.id, leagueClubId);
    await editOrReply(
      context,
      formatSquad(club.clubName, players),
      new InlineKeyboard().text("\u{1F525} Asosiy XI", `xi:${leagueClubId}`).row().text("\u{1F9E0} Taktika", `tc:${leagueClubId}`).text("\u21A9\uFE0F Orqaga", `db:${leagueClubId}`)
    );
  });
  bot.callbackQuery(/^mt:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const leagueClubId = context.match[1];
    const upcoming = await fixtures.listUpcoming(user.id, leagueClubId);
    await editOrReply(
      context,
      formatUpcomingFixtures(upcoming),
      new InlineKeyboard().text("\u26BD Natijalar", `rs:${leagueClubId}`).text("\u{1F4CA} Liga jadvali", `tb:${leagueClubId}`).row().text("\u21A9\uFE0F Orqaga", `db:${leagueClubId}`)
    );
  });
  bot.callbackQuery(/^rs:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const club = context.match[1];
    await editOrReply(
      context,
      formatResults(await matches.history(user.id, club)),
      new InlineKeyboard().text("\u{1F4C5} Keyingi o\u2018yinlar", `mt:${club}`).row().text("\u21A9\uFE0F Orqaga", `db:${club}`)
    );
  });
  bot.callbackQuery(/^tb:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const club = context.match[1];
    const clubs = await getContextManagedClubs(context, user.id);
    const clubObj = clubs.find((c) => c.leagueClubId === club);
    const leagueTitle = clubObj?.competitionName ? `${clubObj.competitionName.toUpperCase()} \u2014 JADVAL` : "LALIGA \u2014 JADVAL";
    await editOrReply(
      context,
      formatTable(await matches.table(user.id, club), clubObj?.clubName, leagueTitle),
      new InlineKeyboard().text("\u{1F945} To\u2018purarlar", `sc:${club}`).text("\u{1F3AF} Assistentlar", `asst:${club}`).row().text("\u21A9\uFE0F Orqaga", `db:${club}`)
    );
  });
  bot.callbackQuery(/^sc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const club = context.match[1];
    await editOrReply(
      context,
      formatLeaders("TO\u2018PURARLAR", await matches.leaders(user.id, club, "goals"), "gol"),
      new InlineKeyboard().text("\u{1F3AF} Assistentlar", `asst:${club}`).text("\u{1F4CA} Liga jadvali", `tb:${club}`).row().text("\u21A9\uFE0F Orqaga", `db:${club}`)
    );
  });
  bot.callbackQuery(/^asst:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const club = context.match[1];
    await editOrReply(
      context,
      formatLeaders("ASSISTLAR", await matches.leaders(user.id, club, "assists"), "assist"),
      new InlineKeyboard().text("\u{1F945} To\u2018purarlar", `sc:${club}`).text("\u{1F4CA} Liga jadvali", `tb:${club}`).row().text("\u21A9\uFE0F Orqaga", `db:${club}`)
    );
  });
  bot.callbackQuery(/^fn:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const club = context.match[1];
    await editOrReply(
      context,
      formatFinances(await matches.finances(user.id, club)),
      new InlineKeyboard().text("\u{1F4B0} Homiylar", `sp:${club}`).row().text("\u21A9\uFE0F Orqaga", `db:${club}`)
    );
  });
  bot.callbackQuery(/^sp:([0-9a-f-]{36})$/, async (context) => {
    await context.answerCallbackQuery();
    const club = context.match[1];
    const rows = await progression.sponsors();
    const keyboard = new InlineKeyboard();
    for (const s of rows) {
      keyboard.text(`${s.name} \xB7 ${transferMoney(s.payment)}`, `sa:${s.id}`).row();
    }
    keyboard.text("\u21A9\uFE0F Orqaga", `fn:${club}`);
    await editOrReply(context, formatSponsors(rows), keyboard);
  });
  bot.callbackQuery(/^sa:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const club = (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;
    const sponsor = context.match[1];
    if (!club) return;
    await progression.acceptSponsor(user.id, club, sponsor);
    const selected = (await progression.sponsors()).find((s) => s.id === sponsor);
    if (selected?.channelId) {
      let eligible = false;
      try {
        const member = await context.api.getChatMember(selected.channelId, context.from.id);
        eligible = !["left", "kicked"].includes(member.status);
      } catch (error) {
        logger.warn({ event: "sponsor_membership_check_failed", err: error }, "Membership check failed");
      }
      await progression.setEligibility(user.id, club, eligible);
      await context.reply(
        eligible ? "\u2705 <b>Homiy shartnomasi faol!</b>\n<i>Kanal a\u2019zoligi tasdiqlandi.</i>" : "\u26A0\uFE0F <b>Homiy tanlandi</b>\n<i>Kanal a\u2019zoligi tasdiqlanmadi. Mukofot olish uchun kanalga a\u2019zo bo\u2018ling.</i>",
        { parse_mode: "HTML" }
      );
    } else {
      await context.reply("\u2705 <b>Homiy shartnomasi faol qilindi.</b>", { parse_mode: "HTML" });
    }
  });
  const tacticKeyboard = (clubId, tactic) => new InlineKeyboard().text(`\u{1F9E9} Formation: ${tactic.formationName}`, `fm:${clubId}`).row().text(`\u{1F3AF} Mentalitet: ${footballTerm(tactic.mentality)} [\u2705]`, `cy:${clubId}:mentality`).row().text(`\u26A1 Pressing: ${tactic.pressing}`, `tc:${clubId}`).text("\u221210", `nu:${clubId}:pressing:-`).text("+10", `nu:${clubId}:pressing:+`).row().text(`\u23F1 Temp: ${tactic.tempo}`, `tc:${clubId}`).text("\u221210", `nu:${clubId}:tempo:-`).text("+10", `nu:${clubId}:tempo:+`).row().text(`\u{1F4CF} Himoya: ${tactic.defensiveLine}`, `tc:${clubId}`).text("\u221210", `nu:${clubId}:defensiveLine:-`).text("+10", `nu:${clubId}:defensiveLine:+`).row().text(`\u2194\uFE0F Kenglik: ${tactic.width}`, `tc:${clubId}`).text("\u221210", `nu:${clubId}:width:-`).text("+10", `nu:${clubId}:width:+`).row().text(`\u{1F3AF} Pas: ${footballTerm(tactic.passingStyle)} [\u2705]`, `cy:${clubId}:passingStyle`).row().text(`\u2694\uFE0F Hujum: ${footballTerm(tactic.attackFocus)} [\u2705]`, `cy:${clubId}:attackFocus`).row().text(`\u{1F6E1} Kurash: ${footballTerm(tactic.tackling)} [\u2705]`, `cy:${clubId}:tackling`).row().text("\u{1F525} Asosiy XI", `xi:${clubId}`).text("\u21A9\uFE0F Orqaga", `db:${clubId}`);
  const showTactics = async (context, userId, clubId) => {
    const tactic = await tactics.get(userId, clubId);
    await editOrReply(context, formatTactics(tactic), tacticKeyboard(clubId, tactic));
  };
  bot.callbackQuery(/^tc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    await showTactics(context, user.id, context.match[1]);
  });
  bot.callbackQuery(/^fm:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubId = context.match[1];
    const currentTactic = await tactics.get(user.id, clubId);
    const keyboard = new InlineKeyboard();
    for (const formation of await tactics.listFormations()) {
      const isSelected = formation.name === currentTactic.formationName;
      keyboard.text(`${isSelected ? "\u2705 " : "\u{1F4D0} "}${formation.name}`, `fs:${clubId}:${formation.code}`).row();
    }
    keyboard.text("\u2190 Taktika", `tc:${clubId}`);
    await editOrReply(context, "\u{1F4D0} SXEMANI TANLANG\n\nMasalan, 4-3-3: 4 himoyachi, 3 yarim himoyachi va 3 hujumchi.", keyboard);
  });
  bot.callbackQuery(/^fs:([0-9a-f-]{36}):(\d+)$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Boshlang\u2018ich tarkib moslanmoqda\u2026" });
    const user = await getContextUser(context);
    await tactics.autoSave(user.id, context.match[1], context.match[2]);
    await showTactics(context, user.id, context.match[1]);
  });
  const showStartingXi = async (context, clubId, alertText) => {
    const user = await getContextUser(context);
    const clubs = await getContextManagedClubs(context, user.id);
    const club = clubs.find((c) => c.leagueClubId === clubId);
    const clubName = club?.clubName ?? "Klub";
    const lineup = await tactics.lineup(user.id, clubId);
    const keyboard = new InlineKeyboard().text("\u{1F504} O\u2018yinchini almashtirish", `xsl:${clubId}`).text("\u{1F916} Avtomatik tanlash", `xa:${clubId}`).row().text("\u{1F9E9} Formation", `fm:${clubId}`).row().text("\u21A9\uFE0F Orqaga", `db:${clubId}`);
    const text = formatStartingXi(clubName, lineup.formation, lineup.players) + (alertText ? `

${alertText}` : "");
    await editOrReply(context, text, keyboard);
  };
  bot.callbackQuery(/^xi:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    await showStartingXi(context, context.match[1]);
  });
  bot.callbackQuery(/^xsl:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubId = context.match[1];
    const lineup = await tactics.lineup(user.id, clubId);
    const keyboard = new InlineKeyboard();
    let count = 0;
    for (const player of lineup.players) {
      keyboard.text(`${player.slotKey}: ${player.shortName}`, `xslot:${player.slotKey}:${clubId}`);
      count++;
      if (count % 2 === 0) keyboard.row();
    }
    if (count % 2 !== 0) keyboard.row();
    keyboard.text("\u2190 Asosiy XI", `xi:${clubId}`);
    await editOrReply(
      context,
      "\u{1F504} Qaysi pozitsiyadagi futbolchini almashtirmoqchisiz?\n\nKerakli pozitsiyani tanlang:",
      keyboard
    );
  });
  bot.callbackQuery(/^xslot:([A-Za-z0-9]+):([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const slotKey = context.match[1];
    const clubId = context.match[2];
    const [squad, lineup, tactic, formations] = await Promise.all([
      squads.listOwnedClubSquad(user.id, clubId),
      tactics.lineup(user.id, clubId),
      tactics.get(user.id, clubId),
      tactics.listFormations()
    ]);
    const formation = formations.find((f) => f.code === tactic.formationCode);
    const slotDef = formation?.slots.find((s) => s.key === slotKey);
    const currentPick = lineup.players.find((p) => p.slotKey === slotKey);
    const slotPosition = slotDef?.position ?? currentPick?.slotPosition ?? "CM";
    const xiPlayerMap = new Map(lineup.players.map((p) => [p.clubPlayerId, p.slotKey]));
    const naturalMatches = [];
    const secondaryMatches = [];
    const otherPlayers = [];
    for (const player of squad) {
      if (player.primaryPosition === slotPosition) {
        naturalMatches.push(player);
      } else if (player.secondaryPosition === slotPosition) {
        secondaryMatches.push(player);
      } else {
        otherPlayers.push(player);
      }
    }
    const sortedCandidates = [
      ...naturalMatches.sort((a, b) => b.overall - a.overall),
      ...secondaryMatches.sort((a, b) => b.overall - a.overall),
      ...otherPlayers.sort((a, b) => b.overall - a.overall)
    ];
    const keyboard = new InlineKeyboard();
    for (const player of sortedCandidates) {
      const isCurrentInSlot = currentPick?.clubPlayerId === player.clubPlayerId;
      const inOtherSlotKey = xiPlayerMap.get(player.clubPlayerId);
      let icon = "\u25AB\uFE0F";
      if (player.primaryPosition === slotPosition) {
        icon = "\u2705";
      } else if (player.secondaryPosition === slotPosition) {
        icon = "\u{1F539}";
      }
      let status = "";
      if (isCurrentInSlot) {
        status = " (Hozirgi)";
      } else if (inOtherSlotKey) {
        status = ` (XI: ${inOtherSlotKey})`;
      }
      const label = `${icon} ${player.shortName} \xB7 ${player.primaryPosition} \xB7 \u2B50${player.overall}${status}`;
      keyboard.text(label.slice(0, 40), `xpick:${slotKey}:${player.clubPlayerId}`).row();
    }
    keyboard.text("\u2190 Pozitsiyalar", `xsl:${clubId}`).text("\u2190 Asosiy XI", `xi:${clubId}`);
    const messageLines = [
      `\u{1F504} [${slotKey}] POZITSIYASIGA FUTBOLCHI TANLANG`,
      `\u{1F4CD} Talab etilgan amplua: ${slotPosition} (${positionName(slotPosition)})`,
      `\u{1F464} Hozirgi: ${currentPick ? `${currentPick.shortName} (\u2B50${currentPick.overall})` : "Bo\u2018sh"}`,
      "",
      "Belgilar:",
      "\u2705 \u2014 Asosiy ampluasi mos",
      "\u{1F539} \u2014 Ikkinchi ampluasi mos",
      "\u25AB\uFE0F \u2014 Boshqa amplua",
      "Agar futbolchi boshqa slotda bo\u2018lsa, tanlansa o\u2018rni almashadi (swap)."
    ];
    await editOrReply(context, messageLines.join("\n"), keyboard);
  });
  bot.callbackQuery(/^xpick:([A-Za-z0-9]+):([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Tarkib yangilanmoqda\u2026" });
    const user = await getContextUser(context);
    const slotKey = context.match[1];
    const clubPlayerId = context.match[2];
    const clubs = await getContextManagedClubs(context, user.id);
    if (!clubs.length) return;
    let targetClubId = clubs[0].leagueClubId;
    if (clubs.length > 1) {
      for (const club of clubs) {
        const squad = await squads.listOwnedClubSquad(user.id, club.leagueClubId);
        if (squad.some((p) => p.clubPlayerId === clubPlayerId)) {
          targetClubId = club.leagueClubId;
          break;
        }
      }
    }
    await tactics.swapOrAssignPlayer(user.id, targetClubId, slotKey, clubPlayerId);
    await showStartingXi(context, targetClubId, "\u2705 Tarkib muvaffaqiyatli saqlandi!");
  });
  bot.callbackQuery(/^xa:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Eng mos futbolchilar tanlanmoqda\u2026" });
    const user = await getContextUser(context), clubId = context.match[1], tactic = await tactics.get(user.id, clubId);
    await tactics.autoSave(user.id, clubId, tactic.formationCode);
    await showStartingXi(context, clubId, "\u2705 Avtomatik tarkib saqlandi!");
  });
  bot.callbackQuery(/^nu:([0-9a-f-]{36}):(pressing|tempo|defensiveLine|width):([+-])$/, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const club = context.match[1], field = context.match[2];
    const current = await tactics.get(user.id, club);
    const value = Math.max(0, Math.min(100, current[field] + (context.match[3] === "+" ? 10 : -10)));
    await tactics.update(user.id, club, { [field]: value });
    await context.answerCallbackQuery({ text: "\u2705 Saqlandi" });
    await showTactics(context, user.id, club);
  });
  bot.callbackQuery(/^cy:([0-9a-f-]{36}):(mentality|passingStyle|attackFocus|tackling)$/, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const club = context.match[1];
    const field = context.match[2];
    const current = await tactics.get(user.id, club);
    const options = {
      mentality: ["VERY_DEFENSIVE", "DEFENSIVE", "BALANCED", "ATTACKING", "VERY_ATTACKING"],
      passingStyle: ["SHORT", "MIXED", "DIRECT"],
      attackFocus: ["LEFT", "CENTRE", "RIGHT", "BOTH_WINGS", "MIXED"],
      tackling: ["CAUTIOUS", "NORMAL", "AGGRESSIVE"]
    }[field];
    const next = options[(options.indexOf(current[field]) + 1) % options.length];
    await tactics.update(user.id, club, { [field]: next });
    await context.answerCallbackQuery({ text: "\u2705 Saqlandi" });
    await showTactics(context, user.id, club);
  });
  bot.callbackQuery(/^soon:/, async (context) => {
    await context.answerCallbackQuery({ text: "Bu bo\u2018lim keyingi PHASEda ochiladi." });
  });
  bot.catch(async ({ error, ctx }) => {
    logger.error({ event: "telegram_update_failed", err: error, updateId: ctx.update.update_id }, "Telegram update failed");
    try {
      await ctx.reply("Kutilmagan xato yuz berdi. Iltimos, birozdan keyin qayta urinib ko\u2018ring.");
    } catch (replyError) {
      logger.error({ event: "telegram_error_reply_failed", err: replyError, updateId: ctx.update.update_id }, "Could not send error reply");
    }
  });
  return bot;
}

// src/users/user.repository.ts
var UserRepository = class {
  // 15 seconds warm cache
  constructor(database) {
    this.database = database;
  }
  database;
  userCache = /* @__PURE__ */ new Map();
  CACHE_TTL_MS = 15e3;
  getCachedUser(telegramId) {
    const entry = this.userCache.get(telegramId);
    if (!entry) return void 0;
    if (Date.now() > entry.expiresAt) {
      this.userCache.delete(telegramId);
      return void 0;
    }
    return entry.user;
  }
  setCachedUser(user) {
    this.userCache.set(user.telegram_id, {
      user,
      expiresAt: Date.now() + this.CACHE_TTL_MS
    });
  }
  async upsertFromTelegram(user, forceRefresh = false) {
    if (!forceRefresh) {
      const cached = this.getCachedUser(user.id);
      if (cached) return cached;
    }
    const record = {
      telegram_id: user.id,
      username: user.username ?? null,
      first_name: user.first_name,
      last_name: user.last_name ?? null,
      language_code: user.language_code ?? null,
      last_seen_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const { data, error } = await this.database.from("users").upsert(record, { onConflict: "telegram_id" }).select("id, telegram_id, username, first_name, last_name, language_code, is_blocked").single();
    if (error) throw new Error(`Telegram userni saqlashda xato: ${error.message}`);
    const registered = data;
    this.setCachedUser(registered);
    return registered;
  }
  async getStartState(user) {
    try {
      const { data, error } = await this.database.rpc("get_user_start_state", {
        p_telegram_id: user.id,
        p_username: user.username ?? null,
        p_first_name: user.first_name,
        p_last_name: user.last_name ?? null,
        p_language_code: user.language_code ?? null
      });
      if (!error && data?.user) {
        const registered2 = data.user;
        this.setCachedUser(registered2);
        return {
          user: registered2,
          managedClubs: data.managedClubs ?? []
        };
      }
    } catch {
    }
    const registered = await this.upsertFromTelegram(user);
    return {
      user: registered,
      managedClubs: []
    };
  }
};

// src/leagues/league.repository.ts
function one(value) {
  return Array.isArray(value) ? value[0] : value;
}
var globalCompetitionsCache = null;
var LeagueRepository = class {
  constructor(database) {
    this.database = database;
  }
  database;
  async listCompetitions(forceRefresh = false) {
    if (!forceRefresh && globalCompetitionsCache && Date.now() < globalCompetitionsCache.expiresAt) {
      return globalCompetitionsCache.data;
    }
    const { data, error } = await this.database.from("competitions").select("id, code, name").eq("is_active", true).order("name");
    if (error) throw new Error(`Competitionlarni olishda xato: ${error.message}`);
    const list = data;
    globalCompetitionsCache = { data: list, expiresAt: Date.now() + 6e4 };
    return list;
  }
  async listOpenLobbies() {
    try {
      await this.database.rpc("ensure_open_lobby_available");
    } catch {
    }
    try {
      await this.database.rpc("activate_due_open_leagues");
    } catch {
    }
    const { data, error } = await this.database.from("league_instances").select("id, instance_number, status, registration_closes_at, competitions!inner(code, name, club_limit), league_clubs(manager_type)").eq("access_mode", "GLOBAL").in("status", ["OPEN", "ACTIVE"]).order("created_at", { ascending: false });
    if (error) throw new Error(`Lobbylarni olishda xato: ${error.message}`);
    const result = [];
    const seenComp = /* @__PURE__ */ new Set();
    for (const row of data ?? []) {
      const comp = one(row.competitions);
      if (seenComp.has(comp.code)) continue;
      const humanCount = (row.league_clubs ?? []).filter((c) => c.manager_type === "HUMAN").length;
      if (row.status === "OPEN" || humanCount < comp.club_limit) {
        seenComp.add(comp.code);
        result.push({
          leagueId: row.id,
          competitionCode: comp.code,
          competitionName: comp.name,
          instanceNumber: row.instance_number,
          humanCount,
          maxClubs: comp.club_limit,
          registrationClosesAt: row.registration_closes_at,
          status: row.status
        });
      }
    }
    return result.sort((a, b) => a.competitionName.localeCompare(b.competitionName));
  }
  async listJoinableLeagues(competitionId) {
    const { data, error } = await this.database.from("league_instances").select("id, instance_number, competitions!inner(name), league_clubs(manager_type)").eq("competition_id", competitionId).in("status", ["ACTIVE", "OPEN"]).eq("access_mode", "GLOBAL").or(`registration_closes_at.is.null,registration_closes_at.gt.${(/* @__PURE__ */ new Date()).toISOString()}`).order("instance_number");
    if (error) throw new Error(`Ligalarni olishda xato: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id,
      name: `${one(row.competitions).name} #${String(row.instance_number).padStart(4, "0")}`,
      availableClubs: row.league_clubs.filter((club) => club.manager_type === "AI").length
    })).filter((league) => league.availableClubs > 0);
  }
  async listAvailableClubs(leagueId) {
    const { data, error } = await this.database.from("league_clubs").select("id, clubs!inner(name, code)").eq("league_instance_id", leagueId).eq("manager_type", "AI").order("club_id");
    if (error) throw new Error(`Bo\u2018sh klublarni olishda xato: ${error.message}`);
    return (data ?? []).map((row) => ({
      leagueClubId: row.id,
      clubName: one(row.clubs).name,
      clubCode: one(row.clubs).code
    })).sort((a, b) => a.clubName.localeCompare(b.clubName));
  }
  async listAllLeagueClubs(leagueId) {
    const { data: instance, error: instError } = await this.database.from("league_instances").select("id, instance_number, competitions!inner(code, name)").eq("id", leagueId).single();
    if (instError || !instance) throw new Error("LEAGUE_NOT_FOUND");
    const comp = one(instance.competitions);
    const { data, error } = await this.database.from("league_clubs").select("id, manager_type, manager_user_id, clubs!inner(name, code), users(first_name, username)").eq("league_instance_id", leagueId).order("club_id");
    if (error) throw new Error(`Klublarni olishda xato: ${error.message}`);
    const clubList = (data ?? []).map((row) => {
      const club = one(row.clubs);
      const isAvailable = row.manager_type === "AI";
      const user = row.users ? one(row.users) : null;
      const managerName = user ? user.first_name || user.username || "Manager" : null;
      return {
        leagueClubId: row.id,
        clubName: club.name,
        clubCode: club.code,
        isAvailable,
        managerName
      };
    }).sort((a, b) => a.clubName.localeCompare(b.clubName));
    return {
      competitionCode: comp.code,
      competitionName: comp.name,
      instanceNumber: instance.instance_number,
      clubs: clubList
    };
  }
  async getAvailableClub(leagueClubId) {
    const { data, error } = await this.database.from("league_clubs").select("id, clubs!inner(name, code)").eq("id", leagueClubId).eq("manager_type", "AI").maybeSingle();
    if (error) throw new Error(`Klubni olishda xato: ${error.message}`);
    if (!data) return null;
    const club = one(data.clubs);
    return { leagueClubId: data.id, clubName: club.name, clubCode: club.code };
  }
  async claimClub(userId, leagueClubId) {
    const { data, error } = await this.database.rpc("claim_league_club", { p_user_id: userId, p_league_club_id: leagueClubId });
    if (error) throw new Error(error.message);
    const result = data?.[0];
    if (!result) throw new Error("CLAIM_RESULT_MISSING");
    return { leagueClubId: result.league_club_id, clubName: result.club_name, leagueName: result.league_name };
  }
  async exitLeagueClub(userId, leagueClubId) {
    const { data, error } = await this.database.rpc("exit_league_club", {
      p_user_id: userId,
      p_league_club_id: leagueClubId
    });
    if (error) throw new Error(error.message);
    const result = data?.[0];
    if (!result) throw new Error("EXIT_RESULT_MISSING");
    return {
      leagueClubId: result.league_club_id,
      clubName: result.club_name,
      leagueName: result.league_name,
      leagueStatus: result.league_status
    };
  }
  async listManagedClubs(userId) {
    const { data, error } = await this.database.from("league_clubs").select("id, points, cash_balance, clubs!inner(name, starting_budget), league_instances!inner(id, instance_number, status, competitions!inner(name))").eq("manager_user_id", userId).order("created_at");
    if (error) throw new Error(`Manager klublarini olishda xato: ${error.message}`);
    return (data ?? []).map((row) => {
      const club = one(row.clubs);
      const league = one(row.league_instances);
      const competition = one(league.competitions);
      return {
        leagueClubId: row.id,
        leagueId: league.id,
        clubName: club.name,
        competitionName: competition.name,
        leagueName: `${competition.name} #${String(league.instance_number).padStart(4, "0")}`,
        position: 1,
        points: row.points,
        budget: Number(row.cash_balance ?? club.starting_budget),
        status: league.status
      };
    });
  }
  async releaseScheduledGlobalLeagues(now = /* @__PURE__ */ new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
    const hour = Number(parts.hour);
    if (hour !== 7 && hour !== 19) return 0;
    const runKey = `${parts.year}-${parts.month}-${parts.day}-${String(hour).padStart(2, "0")}`;
    const startAt = /* @__PURE__ */ new Date(`${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, "0")}:00:00+05:00`);
    const { data, error } = await this.database.rpc("release_global_leagues", { p_run_key: runKey, p_start_at: startAt.toISOString() });
    if (error) throw error;
    return Number(data ?? 0);
  }
  async maintainLobbies() {
    const [{ data: activated }, { data: created }] = await Promise.all([
      this.database.rpc("activate_due_open_leagues"),
      this.database.rpc("ensure_open_lobby_available")
    ]);
    return {
      activated: Number(activated ?? 0),
      created: Number(created ?? 0)
    };
  }
  async createPrivateLeague(userId, competitionId) {
    const { data, error } = await this.database.rpc("create_private_league", { p_user_id: userId, p_competition_id: competitionId });
    if (error) throw new Error(error.message);
    const row = data?.[0];
    if (!row) throw new Error("PRIVATE_LEAGUE_CREATE_FAILED");
    return { leagueId: row.league_id, inviteCode: row.invite_code };
  }
  async privateLeagueByCode(code) {
    const { data, error } = await this.database.from("league_instances").select("id,join_code").eq("access_mode", "PRIVATE").eq("join_code", code.toUpperCase()).maybeSingle();
    if (error) throw error;
    return data ? { leagueId: data.id, inviteCode: data.join_code } : null;
  }
  async listPrivateAvailableClubs(leagueId) {
    const { data, error } = await this.database.from("league_clubs").select("id,clubs!inner(name,code)").eq("league_instance_id", leagueId).eq("manager_type", "AI").order("club_id");
    if (error) throw error;
    return (data ?? []).map((row) => ({ leagueClubId: row.id, clubName: one(row.clubs).name, clubCode: one(row.clubs).code })).sort((a, b) => a.clubName.localeCompare(b.clubName));
  }
  async claimPrivateClub(userId, inviteCode, leagueClubId) {
    const { data, error } = await this.database.rpc("claim_private_league_club", { p_user_id: userId, p_join_code: inviteCode.toUpperCase(), p_league_club_id: leagueClubId });
    if (error) throw new Error(error.message);
    const row = data?.[0];
    if (!row) throw new Error("PRIVATE_CLAIM_RESULT_MISSING");
    return { leagueClubId: row.league_club_id, clubName: row.club_name, leagueName: row.league_name };
  }
};

// src/squads/squad.repository.ts
function one2(value) {
  return Array.isArray(value) ? value[0] : value;
}
var SquadRepository = class {
  constructor(database) {
    this.database = database;
  }
  database;
  async listOwnedClubSquad(userId, leagueClubId) {
    const { data, error } = await this.database.from("club_players").select("id, players!inner(id, short_name, age, primary_position, secondary_position, fitness, form, morale, player_attributes!inner(overall)), league_clubs!inner(manager_user_id)").eq("league_club_id", leagueClubId).eq("league_clubs.manager_user_id", userId);
    if (error) throw new Error(`Tarkibni olishda xato: ${error.message}`);
    return (data ?? []).map((row) => {
      const player = one2(row.players);
      const attributes = one2(player.player_attributes);
      return {
        id: player.id,
        clubPlayerId: row.id,
        shortName: player.short_name,
        age: player.age,
        primaryPosition: player.primary_position,
        secondaryPosition: player.secondary_position,
        overall: attributes.overall,
        fitness: player.fitness,
        form: player.form,
        morale: player.morale
      };
    }).sort((a, b) => b.overall - a.overall || a.shortName.localeCompare(b.shortName));
  }
};

// src/game/config/position-compatibility.ts
var groups = {
  GK: ["GK"],
  CB: ["CB", "LB", "RB", "CDM"],
  LB: ["LB", "LWB", "RB", "CB", "LM"],
  RB: ["RB", "RWB", "LB", "CB", "RM"],
  LWB: ["LWB", "LB", "LM", "RWB"],
  RWB: ["RWB", "RB", "RM", "LWB"],
  CDM: ["CDM", "CM", "CB", "CAM"],
  CM: ["CM", "CDM", "CAM", "LM", "RM"],
  CAM: ["CAM", "CM", "CF", "LM", "RM"],
  LM: ["LM", "LW", "LWB", "CM", "RM"],
  RM: ["RM", "RW", "RWB", "CM", "LM"],
  LW: ["LW", "LM", "RW", "CF", "ST", "CAM"],
  RW: ["RW", "RM", "LW", "CF", "ST", "CAM"],
  CF: ["CF", "ST", "CAM", "LW", "RW"],
  ST: ["ST", "CF", "LW", "RW"]
};
function positionCompatibility(primary, secondary, slot) {
  if (primary === slot) return 1;
  if (secondary === slot) return 0.96;
  const index = groups[slot]?.indexOf(primary) ?? -1;
  if (index === 1) return 0.9;
  if (index === 2) return 0.86;
  if (index >= 3) return 0.78;
  return primary === "GK" || slot === "GK" ? 0.35 : 0.62;
}

// src/game/lineup-engine.ts
function effectiveRating(player, slot) {
  const fit = 0.94 + player.fitness / 100 * 0.06, form = 0.97 + player.form / 100 * 0.06, morale = 0.98 + player.morale / 100 * 0.04;
  return Math.min(99, Math.max(1, Number((player.overall * positionCompatibility(player.primaryPosition, player.secondaryPosition, slot) * fit * form * morale).toFixed(2))));
}
function autoPickLineup(players, slots) {
  const available = new Map(players.map((player) => [player.id, player]));
  const result = [];
  const ordered = [...slots].sort((a, b) => {
    const count = (s) => players.filter((p) => positionCompatibility(p.primaryPosition, p.secondaryPosition, s.position) >= 0.86).length;
    return count(a) - count(b);
  });
  for (const slot of ordered) {
    const best = [...available.values()].sort((a, b) => effectiveRating(b, slot.position) - effectiveRating(a, slot.position))[0];
    if (!best) throw new Error("SQUAD_TOO_SMALL");
    available.delete(best.id);
    result.push({ slotKey: slot.key, slotPosition: slot.position, clubPlayerId: best.id, effectiveRating: effectiveRating(best, slot.position) });
  }
  return slots.map((slot) => result.find((item) => item.slotKey === slot.key));
}

// src/tactics/tactics.repository.ts
var one3 = (value) => Array.isArray(value) ? value[0] : value;
var globalFormationsCache = null;
var TacticsRepository = class {
  constructor(db, squads) {
    this.db = db;
    this.squads = squads;
  }
  db;
  squads;
  async listFormations(forceRefresh = false) {
    if (!forceRefresh && globalFormationsCache && Date.now() < globalFormationsCache.expiresAt) {
      return globalFormationsCache.data;
    }
    const { data, error } = await this.db.from("formations").select("id,code,name,slots").order("name");
    if (error) throw error;
    const formations = data;
    globalFormationsCache = { data: formations, expiresAt: Date.now() + 3e5 };
    return formations;
  }
  async get(userId, clubId) {
    const { data, error } = await this.db.from("tactics").select("mentality,pressing,tempo,defensive_line,width,passing_style,attack_focus,tackling,formations!inner(code,name),league_clubs!inner(manager_user_id)").eq("league_club_id", clubId).eq("league_clubs.manager_user_id", userId).single();
    if (error) throw error;
    const formation = one3(data.formations);
    return { formationCode: formation.code, formationName: formation.name, mentality: data.mentality, pressing: data.pressing, tempo: data.tempo, defensiveLine: data.defensive_line, width: data.width, passingStyle: data.passing_style, attackFocus: data.attack_focus, tackling: data.tackling };
  }
  async update(userId, clubId, patch) {
    const row = {};
    if (patch.mentality !== void 0) row.mentality = patch.mentality;
    if (patch.pressing !== void 0) row.pressing = patch.pressing;
    if (patch.tempo !== void 0) row.tempo = patch.tempo;
    if (patch.defensiveLine !== void 0) row.defensive_line = patch.defensiveLine;
    if (patch.width !== void 0) row.width = patch.width;
    if (patch.passingStyle !== void 0) row.passing_style = patch.passingStyle;
    if (patch.attackFocus !== void 0) row.attack_focus = patch.attackFocus;
    if (patch.tackling !== void 0) row.tackling = patch.tackling;
    const { data, error } = await this.db.from("tactics").update(row).eq("league_club_id", clubId).select("mentality,pressing,tempo,defensive_line,width,passing_style,attack_focus,tackling,formations!inner(code,name),league_clubs!inner(manager_user_id)").eq("league_clubs.manager_user_id", userId).single();
    if (error) throw error;
    const formation = one3(data.formations);
    return { formationCode: formation.code, formationName: formation.name, mentality: data.mentality, pressing: data.pressing, tempo: data.tempo, defensiveLine: data.defensive_line, width: data.width, passingStyle: data.passing_style, attackFocus: data.attack_focus, tackling: data.tackling };
  }
  async save(userId, clubId, code, assignments) {
    const { error } = await this.db.rpc("save_lineup", { p_user_id: userId, p_league_club_id: clubId, p_formation_code: code, p_assignments: assignments });
    if (error) throw error;
  }
  async autoSave(userId, clubId, code) {
    const formation = (await this.listFormations()).find((item) => item.code === code);
    if (!formation) throw new Error("FORMATION_NOT_FOUND");
    const players = await this.squads.listOwnedClubSquad(userId, clubId);
    const assignments = autoPickLineup(players.map((p) => ({ id: p.clubPlayerId, overall: p.overall, primaryPosition: p.primaryPosition, secondaryPosition: p.secondaryPosition, fitness: p.fitness, form: p.form, morale: p.morale })), formation.slots).map((a) => ({ slot_key: a.slotKey, slot_position: a.slotPosition, club_player_id: a.clubPlayerId, effective_rating: a.effectiveRating }));
    await this.save(userId, clubId, code, assignments);
  }
  async saveManual(userId, clubId, code, picks) {
    const formation = (await this.listFormations()).find((item) => item.code === code);
    if (!formation || picks.length !== 11 || new Set(picks.map((p) => p.clubPlayerId)).size !== 11) throw new Error("INVALID_LINEUP");
    const players = await this.squads.listOwnedClubSquad(userId, clubId), byId = new Map(players.map((p) => [p.clubPlayerId, p]));
    const assignments = formation.slots.map((slot) => {
      const pick = picks.find((p) => p.slotKey === slot.key), player = pick && byId.get(pick.clubPlayerId);
      if (!player) throw new Error("INVALID_PLAYER");
      return { slot_key: slot.key, slot_position: slot.position, club_player_id: player.clubPlayerId, effective_rating: effectiveRating({ id: player.clubPlayerId, overall: player.overall, primaryPosition: player.primaryPosition, secondaryPosition: player.secondaryPosition, fitness: player.fitness, form: player.form, morale: player.morale }, slot.position) };
    });
    await this.save(userId, clubId, code, assignments);
  }
  async lineup(userId, clubId) {
    await this.get(userId, clubId);
    const { data, error } = await this.db.from("lineup_players").select("slot_key,slot_position,effective_rating,club_players!inner(id,players!inner(short_name,player_attributes!inner(overall))),lineups!inner(league_club_id,formations!inner(name),league_clubs!inner(manager_user_id))").eq("lineups.league_club_id", clubId).eq("lineups.league_clubs.manager_user_id", userId);
    if (error) throw error;
    if (!data?.length) {
      const tactic = await this.get(userId, clubId);
      await this.autoSave(userId, clubId, tactic.formationCode);
      return this.lineup(userId, clubId);
    }
    const formation = one3(one3(data[0].lineups).formations).name;
    return { formation, players: data.map((row) => {
      const clubPlayer = one3(row.club_players), player = one3(clubPlayer.players);
      return { clubPlayerId: clubPlayer.id, slotKey: row.slot_key, slotPosition: row.slot_position, shortName: player.short_name, overall: one3(player.player_attributes).overall, effectiveRating: Number(row.effective_rating) };
    }) };
  }
  async swapOrAssignPlayer(userId, clubId, targetSlotKey, clubPlayerId) {
    const current = await this.lineup(userId, clubId);
    const tactic = await this.get(userId, clubId);
    const formation = (await this.listFormations()).find((f) => f.code === tactic.formationCode);
    if (!formation) throw new Error("FORMATION_NOT_FOUND");
    const targetSlot = formation.slots.find((s) => s.key === targetSlotKey);
    if (!targetSlot) throw new Error("SLOT_NOT_FOUND");
    const squad = await this.squads.listOwnedClubSquad(userId, clubId);
    const candidate = squad.find((p) => p.clubPlayerId === clubPlayerId);
    if (!candidate) throw new Error("PLAYER_NOT_IN_CLUB");
    const existingSlot = current.players.find((p) => p.clubPlayerId === clubPlayerId);
    const incumbent = current.players.find((p) => p.slotKey === targetSlotKey);
    const picks = [];
    for (const slot of formation.slots) {
      if (slot.key === targetSlotKey) {
        picks.push({ slotKey: slot.key, clubPlayerId });
      } else if (existingSlot && slot.key === existingSlot.slotKey && incumbent) {
        picks.push({ slotKey: slot.key, clubPlayerId: incumbent.clubPlayerId });
      } else {
        const existingPick = current.players.find((p) => p.slotKey === slot.key);
        if (existingPick && existingPick.clubPlayerId !== clubPlayerId) {
          picks.push({ slotKey: slot.key, clubPlayerId: existingPick.clubPlayerId });
        }
      }
    }
    if (picks.length < 11) {
      const used = new Set(picks.map((p) => p.clubPlayerId));
      for (const slot of formation.slots) {
        if (!picks.some((p) => p.slotKey === slot.key)) {
          const available = squad.filter((p) => !used.has(p.clubPlayerId));
          const best = available.sort(
            (a, b) => effectiveRating(
              {
                id: b.clubPlayerId,
                overall: b.overall,
                primaryPosition: b.primaryPosition,
                secondaryPosition: b.secondaryPosition,
                fitness: b.fitness,
                form: b.form,
                morale: b.morale
              },
              slot.position
            ) - effectiveRating(
              {
                id: a.clubPlayerId,
                overall: a.overall,
                primaryPosition: a.primaryPosition,
                secondaryPosition: a.secondaryPosition,
                fitness: a.fitness,
                form: a.form,
                morale: a.morale
              },
              slot.position
            )
          )[0];
          if (best) {
            used.add(best.clubPlayerId);
            picks.push({ slotKey: slot.key, clubPlayerId: best.clubPlayerId });
          }
        }
      }
    }
    await this.saveManual(userId, clubId, tactic.formationCode, picks);
    return this.lineup(userId, clubId);
  }
};

// src/fixtures/fixture.repository.ts
var one4 = (value) => Array.isArray(value) ? value[0] : value;
var FixtureRepository = class {
  constructor(database) {
    this.database = database;
  }
  database;
  async assertOwnership(userId, leagueClubId) {
    const { data, error } = await this.database.from("league_clubs").select("id").eq("id", leagueClubId).eq("manager_user_id", userId).maybeSingle();
    if (error) throw new Error(`Klubni tekshirishda xato: ${error.message}`);
    if (!data) throw new Error("CLUB_NOT_OWNED");
  }
  async listUpcoming(userId, leagueClubId, limit = 10, skipOwnershipCheck = false) {
    if (!skipOwnershipCheck) {
      await this.assertOwnership(userId, leagueClubId);
    }
    const { data, error } = await this.database.from("fixtures").select("id,round_number,scheduled_at,status,home_club_id,home:league_clubs!fixtures_home_club_id_fkey(clubs!inner(name)),away:league_clubs!fixtures_away_club_id_fkey(clubs!inner(name))").or(`home_club_id.eq.${leagueClubId},away_club_id.eq.${leagueClubId}`).in("status", ["SCHEDULED", "POSTPONED"]).order("scheduled_at", { ascending: true }).limit(limit);
    if (error) throw new Error(`Fixturelarni olishda xato: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id,
      round: row.round_number,
      scheduledAt: row.scheduled_at,
      status: row.status,
      isHome: row.home_club_id === leagueClubId,
      homeClub: one4(one4(row.home).clubs).name,
      awayClub: one4(one4(row.away).clubs).name
    }));
  }
};

// src/matches/match.repository.ts
var first = (value) => Array.isArray(value) ? value[0] : value;
var MatchRepository = class {
  constructor(database) {
    this.database = database;
  }
  database;
  async team(clubId) {
    const [{ data: tactic, error: tacticError }, { data: lineup, error: lineupError }] = await Promise.all([
      this.database.from("tactics").select("mentality,pressing,tempo,defensive_line,width,passing_style,attack_focus,tackling").eq("league_club_id", clubId).single(),
      this.database.from("lineups").select("lineup_players(effective_rating)").eq("league_club_id", clubId).single()
    ]);
    if (tacticError) throw tacticError;
    if (lineupError) throw lineupError;
    let ratings = (lineup.lineup_players ?? []).map((row) => Number(row.effective_rating));
    if (ratings.length < 11) {
      const { data, error } = await this.database.from("club_players").select("players!inner(player_attributes!inner(overall))").eq("league_club_id", clubId);
      if (error) throw error;
      ratings = (data ?? []).map((row) => Number(first(first(row.players).player_attributes).overall)).sort((a, b) => b - a).slice(0, 11);
    }
    return {
      clubId,
      strength: ratings.reduce((sum, rating) => sum + rating, 0) / Math.max(1, ratings.length),
      mentality: tactic.mentality,
      pressing: tactic.pressing,
      tempo: tactic.tempo,
      defensiveLine: tactic.defensive_line,
      width: tactic.width,
      passingStyle: tactic.passing_style,
      attackFocus: tactic.attack_focus,
      tackling: tactic.tackling
    };
  }
  async due(limit = 20) {
    const { data, error } = await this.database.from("fixtures").select("id,home_club_id,away_club_id").eq("status", "SCHEDULED").lte("scheduled_at", (/* @__PURE__ */ new Date()).toISOString()).order("scheduled_at").limit(limit);
    if (error) throw error;
    return Promise.all((data ?? []).map(async (fixture) => ({ fixtureId: fixture.id, home: await this.team(fixture.home_club_id), away: await this.team(fixture.away_club_id) })));
  }
  async complete(fixtureId, simulation) {
    const { data, error } = await this.database.rpc("complete_match", {
      p_fixture_id: fixtureId,
      p_home_goals: simulation.homeGoals,
      p_away_goals: simulation.awayGoals,
      p_stats: simulation.stats,
      p_events: simulation.events,
      p_engine_version: "v2"
    });
    if (error) throw error;
    const matchId = data;
    await this.recordPlayerStats(matchId);
    await this.checkSeasonCompletion(matchId);
    return matchId;
  }
  async checkSeasonCompletion(matchId) {
    const { data: match } = await this.database.from("matches").select("league_instance_id").eq("id", matchId).maybeSingle();
    if (!match?.league_instance_id) return;
    const instanceId = match.league_instance_id;
    const { count, error: countErr } = await this.database.from("fixtures").select("id", { count: "exact", head: true }).eq("league_instance_id", instanceId).eq("status", "SCHEDULED");
    if (countErr || (count ?? 0) > 0) return;
    await this.database.from("league_instances").update({ status: "COMPLETED" }).eq("id", instanceId).neq("status", "COMPLETED");
    const { data: table } = await this.database.from("league_clubs").select("id, manager_user_id, points, goals_for, goals_against").eq("league_instance_id", instanceId);
    if (!table || !table.length) return;
    const ordered = table.sort(
      (a, b) => b.points - a.points || b.goals_for - b.goals_against - (a.goals_for - a.goals_against) || b.goals_for - a.goals_for
    );
    const champion = ordered[0];
    if (champion?.manager_user_id) {
      try {
        const { error } = await this.database.rpc("award_championship", {
          p_user_id: champion.manager_user_id,
          p_league_instance_id: instanceId
        });
        if (error) throw error;
      } catch {
        const { data: prof } = await this.database.from("manager_profiles").select("titles, seasons, manager_rating").eq("user_id", champion.manager_user_id).maybeSingle();
        if (prof) {
          await this.database.from("manager_profiles").update({
            titles: (prof.titles ?? 0) + 1,
            seasons: (prof.seasons ?? 0) + 1,
            manager_rating: (prof.manager_rating ?? 1500) + 100
          }).eq("user_id", champion.manager_user_id);
        }
      }
    }
  }
  async recordPlayerStats(matchId) {
    const { data: match, error: matchError } = await this.database.from("matches").select("home_club_id,away_club_id,home_goals,away_goals").eq("id", matchId).single();
    if (matchError) throw matchError;
    const assign = async (clubId, goals) => {
      if (!goals) return;
      const [{ data, error }, { data: events, error: eventError }] = await Promise.all([this.database.from("club_players").select("players!inner(id,primary_position,player_attributes!inner(overall))").eq("league_club_id", clubId), this.database.from("match_events").select("id").eq("match_id", matchId).eq("club_id", clubId).eq("event_type", "GOAL").order("minute")]);
      if (error) throw error;
      if (eventError) throw eventError;
      const players = (data ?? []).map((row) => {
        const player = first(row.players);
        return { id: player.id, position: player.primary_position, overall: Number(first(player.player_attributes).overall) };
      }).sort((a, b) => {
        const weight = (p) => p === "ST" ? 4 : p === "LW" || p === "RW" || p === "CAM" ? 3 : p === "CM" || p === "LM" || p === "RM" ? 2 : 1;
        return weight(b.position) * 100 + b.overall - (weight(a.position) * 100 + a.overall);
      });
      if (!players.length) return;
      const rows = /* @__PURE__ */ new Map();
      for (let index = 0; index < goals; index += 1) {
        const scorer = players[index % Math.min(3, players.length)], assistant = players.find((player) => player.id !== scorer.id && ["LW", "RW", "CAM", "CM", "LM", "RM"].includes(player.position)) ?? players[(index + 1) % players.length];
        const scorerRow = rows.get(scorer.id) ?? { match_id: matchId, player_id: scorer.id, club_id: clubId, minutes: 90, goals: 0, assists: 0 };
        scorerRow.goals++;
        rows.set(scorer.id, scorerRow);
        if (assistant.id !== scorer.id) {
          const assistantRow = rows.get(assistant.id) ?? { match_id: matchId, player_id: assistant.id, club_id: clubId, minutes: 90, goals: 0, assists: 0 };
          assistantRow.assists++;
          rows.set(assistant.id, assistantRow);
        }
        const event = events?.[index];
        if (event) {
          const { error: updateError } = await this.database.from("match_events").update({ player_id: scorer.id, metadata: { assist_player_id: assistant.id } }).eq("id", event.id);
          if (updateError) throw updateError;
        }
      }
      const { error: insertError } = await this.database.from("player_match_stats").upsert([...rows.values()], { onConflict: "match_id,player_id" });
      if (insertError) throw insertError;
    };
    await Promise.all([assign(match.home_club_id, match.home_goals), assign(match.away_club_id, match.away_goals)]);
  }
  async ownerReports(matchId) {
    const { data: match, error: matchError } = await this.database.from("matches").select("league_instance_id,home_club_id,away_club_id,home_goals,away_goals,fixtures!inner(round_number),match_stats(*)").eq("id", matchId).single();
    if (matchError) throw matchError;
    const [{ data: clubs, error: clubError }, { data: events, error: eventError }] = await Promise.all([this.database.from("league_clubs").select("id,manager_type,manager_user_id,points,played,wins,draws,losses,cash_balance,clubs!inner(name),league_instances!inner(instance_number,competitions!inner(name)),users(telegram_id)").in("id", [match.home_club_id, match.away_club_id]), this.database.from("match_events").select("minute,club_id,player_id,metadata,players(short_name)").eq("match_id", matchId).eq("event_type", "GOAL").order("minute")]);
    if (clubError) throw clubError;
    if (eventError) throw eventError;
    const assistantIds = (events ?? []).map((event) => event.metadata?.assist_player_id).filter(Boolean);
    const { data: assistants, error: assistError } = assistantIds.length ? await this.database.from("players").select("id,short_name").in("id", assistantIds) : { data: [], error: null };
    if (assistError) throw assistError;
    const assistantName = new Map((assistants ?? []).map((player) => [player.id, player.short_name]));
    const allTable = await this.database.from("league_clubs").select("id,points,goals_for,goals_against,clubs!inner(name)").eq("league_instance_id", match.league_instance_id);
    if (allTable.error) throw allTable.error;
    const ordered = (allTable.data ?? []).sort((a, b) => b.points - a.points || b.goals_for - b.goals_against - (a.goals_for - a.goals_against) || b.goals_for - a.goals_for);
    const stats = first(match.match_stats);
    const clubMap = new Map((clubs ?? []).map((club) => [club.id, club]));
    const home = clubMap.get(match.home_club_id), away = clubMap.get(match.away_club_id);
    if (!home || !away) return [];
    const result = [];
    for (const club of [home, away]) {
      if (club.manager_type !== "HUMAN") continue;
      const user = first(club.users);
      if (!user?.telegram_id) continue;
      const isHome = club.id === match.home_club_id, opponent = isHome ? away : home;
      const { data: incomeRows, error: incomeError } = await this.database.from("finance_transactions").select("amount").eq("match_id", matchId).eq("league_club_id", club.id);
      if (incomeError) throw incomeError;
      const { data: next, error: nextError } = await this.database.from("fixtures").select("scheduled_at,home:league_clubs!fixtures_home_club_id_fkey(clubs!inner(name)),away:league_clubs!fixtures_away_club_id_fkey(clubs!inner(name))").or(`home_club_id.eq.${club.id},away_club_id.eq.${club.id}`).eq("status", "SCHEDULED").gt("scheduled_at", (/* @__PURE__ */ new Date()).toISOString()).order("scheduled_at").limit(1).maybeSingle();
      if (nextError) throw nextError;
      const league = first(club.league_instances), competition = first(league.competitions);
      result.push({ telegramId: Number(user.telegram_id), clubId: club.id, club: first(club.clubs).name, opponent: first(opponent.clubs).name, isHome, homeGoals: match.home_goals, awayGoals: match.away_goals, goals: (events ?? []).map((event) => ({ minute: event.minute, player: first(event.players)?.short_name ?? "Noma\u2019lum", assist: assistantName.get(event.metadata?.assist_player_id) ?? null })), possession: [stats.possession_home, 100 - stats.possession_home], shots: [stats.shots_home, stats.shots_away], onTarget: [stats.shots_on_target_home, stats.shots_on_target_away], corners: [stats.corners_home, stats.corners_away], position: ordered.findIndex((row) => row.id === club.id) + 1, points: club.points, played: club.played, wins: club.wins, draws: club.draws, losses: club.losses, income: (incomeRows ?? []).reduce((sum, row) => sum + Number(row.amount), 0), balance: Number(club.cash_balance), next: next ? { home: first(first(next.home).clubs).name, away: first(first(next.away).clubs).name, scheduledAt: next.scheduled_at } : null, leagueName: `${competition.name} #${String(league.instance_number).padStart(4, "0")}` });
    }
    return result;
  }
  async history(userId, leagueClubId, limit = 10) {
    const { data: owned } = await this.database.from("league_clubs").select("league_instance_id").eq("id", leagueClubId).eq("manager_user_id", userId).maybeSingle();
    if (!owned) throw new Error("CLUB_NOT_OWNED");
    const { data, error } = await this.database.from("matches").select("id,played_at,home_goals,away_goals,fixtures!inner(round_number),home:league_clubs!matches_home_club_id_fkey(clubs!inner(name)),away:league_clubs!matches_away_club_id_fkey(clubs!inner(name))").or(`home_club_id.eq.${leagueClubId},away_club_id.eq.${leagueClubId}`).order("played_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => ({ id: row.id, round: first(row.fixtures).round_number, playedAt: row.played_at, homeClub: first(first(row.home).clubs).name, awayClub: first(first(row.away).clubs).name, homeGoals: row.home_goals, awayGoals: row.away_goals }));
  }
  async table(userId, leagueClubId) {
    const { data: owned } = await this.database.from("league_clubs").select("league_instance_id").eq("id", leagueClubId).eq("manager_user_id", userId).maybeSingle();
    if (!owned) throw new Error("CLUB_NOT_OWNED");
    const { data, error } = await this.database.from("league_clubs").select("played,wins,draws,losses,goals_for,goals_against,points,clubs!inner(name)").eq("league_instance_id", owned.league_instance_id).order("points", { ascending: false }).order("goals_for", { ascending: false });
    if (error) throw error;
    return (data ?? []).sort((a, b) => b.points - a.points - (a.goals_for - a.goals_against - (b.goals_for - b.goals_against))).map((r, i) => ({ position: i + 1, club: first(r.clubs).name, played: r.played, wins: r.wins, draws: r.draws, losses: r.losses, goalDifference: r.goals_for - r.goals_against, points: r.points }));
  }
  async leaders(userId, leagueClubId, kind) {
    const { data: owned, error: ownedError } = await this.database.from("league_clubs").select("league_instance_id").eq("id", leagueClubId).eq("manager_user_id", userId).maybeSingle();
    if (ownedError || !owned) throw new Error("CLUB_NOT_OWNED");
    const { data, error } = await this.database.from("player_match_stats").select("player_id,club_id,goals,assists,players!inner(short_name),league_clubs!inner(league_instance_id,clubs!inner(name))").eq("league_clubs.league_instance_id", owned.league_instance_id).gt(kind, 0);
    if (error) throw error;
    const totals = /* @__PURE__ */ new Map();
    for (const row of data ?? []) {
      const player = first(row.players), club = first(first(row.league_clubs).clubs), current = totals.get(row.player_id) ?? { name: player.short_name, club: club.name, total: 0 };
      current.total += Number(row[kind]);
      totals.set(row.player_id, current);
    }
    return [...totals.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 10);
  }
  async finances(userId, leagueClubId) {
    const { data: club, error: clubError } = await this.database.from("league_clubs").select("cash_balance,transfer_budget,reserved_transfer_budget").eq("id", leagueClubId).eq("manager_user_id", userId).maybeSingle();
    if (clubError) throw clubError;
    if (!club) throw new Error("CLUB_NOT_OWNED");
    const { data, error } = await this.database.from("finance_transactions").select("kind,amount,description,created_at").eq("league_club_id", leagueClubId).order("created_at", { ascending: false }).limit(10);
    if (error) throw error;
    return { cashBalance: Number(club.cash_balance), transferBudget: Number(club.transfer_budget), reservedTransferBudget: Number(club.reserved_transfer_budget ?? 0), transactions: (data ?? []).map((row) => ({ kind: row.kind, amount: Number(row.amount), description: row.description, createdAt: row.created_at })) };
  }
};

// src/transfers/transfer.repository.ts
var one5 = (value) => Array.isArray(value) ? value[0] : value;
var TransferRepository = class {
  constructor(database) {
    this.database = database;
  }
  database;
  /**
   * Resolves the manager's club in the same league instance as the target club.
   */
  async buyerClubForTarget(userId, targetClubId) {
    const { data, error } = await this.database.from("league_clubs").select("league_instance_id").eq("id", targetClubId).maybeSingle();
    if (error || !data) return null;
    const { data: buyer, error: buyerError } = await this.database.from("league_clubs").select("id").eq("league_instance_id", data.league_instance_id).eq("manager_user_id", userId).maybeSingle();
    if (buyerError || !buyer) return null;
    return buyer.id;
  }
  /**
   * Resolves the manager's club in the same league instance as the player.
   */
  async buyerClubForPlayer(userId, clubPlayerId) {
    const { data, error } = await this.database.from("club_players").select("league_club_id, league_clubs!inner(league_instance_id)").eq("id", clubPlayerId).maybeSingle();
    if (error || !data) return null;
    const instanceId = one5(data.league_clubs).league_instance_id;
    const { data: buyer, error: buyerError } = await this.database.from("league_clubs").select("id").eq("league_instance_id", instanceId).eq("manager_user_id", userId).maybeSingle();
    if (buyerError || !buyer) return null;
    return buyer.id;
  }
  /**
   * Fetches Global Transfer Market listings (external top stars).
   * Returns up to `pageSize` active players, optionally filtered by position group.
   */
  async market(userId, clubId, page = 0, pageSize = 8, positionGroup = "ALL") {
    const owner = await this.ownerLeague(userId, clubId);
    const { data: existingCp } = await this.database.from("club_players").select("player_id, league_clubs!inner(league_instance_id)").eq("league_clubs.league_instance_id", owner.league_instance_id);
    const existingPlayerSet = new Set(
      (existingCp ?? []).map((cp) => cp.player_id).filter(Boolean)
    );
    let query = this.database.from("global_market_listings").select(
      "id, asking_price, available_until, seller_name, player_id, players!inner(short_name, age, primary_position, player_attributes!inner(overall))"
    ).eq("status", "ACTIVE").is("club_player_id", null).eq("league_instance_id", owner.league_instance_id).gt("available_until", (/* @__PURE__ */ new Date()).toISOString()).order("asking_price", { ascending: false });
    if (positionGroup !== "ALL") {
      const posMap = {
        GK: ["GK"],
        DEF: ["CB", "LB", "RB", "RWB", "LWB"],
        MID: ["CM", "CDM", "CAM", "LM", "RM"],
        ATT: ["ST", "CF", "RW", "LW"]
      };
      const allowed = posMap[positionGroup];
      if (allowed) {
        query = query.in("players.primary_position", allowed);
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    const filtered = (data ?? []).filter((row) => !existingPlayerSet.has(row.player_id));
    const from = page * pageSize;
    const paged = filtered.slice(from, from + pageSize);
    return paged.map((row) => {
      const player = one5(row.players);
      return {
        listingId: row.id,
        name: player.short_name,
        age: player.age,
        position: player.primary_position,
        overall: one5(player.player_attributes)?.overall ?? 75,
        askingPrice: Number(row.asking_price),
        availableUntil: row.available_until,
        sellerName: row.seller_name ?? "Global Market"
      };
    });
  }
  /**
   * Fetches In-League Transfer Market listings (players listed for sale by clubs in the same league).
   */
  async leagueMarket(userId, clubId, page = 0, pageSize = 8, positionGroup = "ALL") {
    const owner = await this.ownerLeague(userId, clubId);
    let query = this.database.from("global_market_listings").select(
      "id, asking_price, available_until, seller_name, seller_club_id, club_player_id, players!inner(short_name, age, primary_position, player_attributes!inner(overall)), seller_club:league_clubs!seller_club_id!inner(league_instance_id)"
    ).eq("status", "ACTIVE").not("club_player_id", "is", null).eq("seller_club.league_instance_id", owner.league_instance_id).gt("available_until", (/* @__PURE__ */ new Date()).toISOString()).order("created_at", { ascending: false });
    if (positionGroup !== "ALL") {
      const posMap = {
        GK: ["GK"],
        DEF: ["CB", "LB", "RB", "RWB", "LWB"],
        MID: ["CM", "CDM", "CAM", "LM", "RM"],
        ATT: ["ST", "CF", "RW", "LW"]
      };
      const allowed = posMap[positionGroup];
      if (allowed) {
        query = query.in("players.primary_position", allowed);
      }
    }
    const from = page * pageSize;
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const player = one5(row.players);
      return {
        listingId: row.id,
        name: player.short_name,
        age: player.age,
        position: player.primary_position,
        overall: one5(player.player_attributes)?.overall ?? 75,
        askingPrice: Number(row.asking_price),
        availableUntil: row.available_until,
        sellerName: row.seller_name ?? "Liga klubi",
        sellerClubId: row.seller_club_id,
        clubPlayerId: row.club_player_id,
        isOwnListing: row.seller_club_id === clubId
      };
    });
  }
  /**
   * Fetches full profile for a single market listing (either global or in-league).
   */
  async listing(userId, clubId, listingId) {
    await this.ownerLeague(userId, clubId);
    const { data, error } = await this.database.from("global_market_listings").select(
      "id, asking_price, available_until, seller_name, seller_club_id, club_player_id, players!inner(short_name, age, primary_position, player_attributes!inner(overall))"
    ).eq("id", listingId).eq("status", "ACTIVE").maybeSingle();
    if (error || !data) return null;
    const player = one5(data.players);
    return {
      listingId: data.id,
      name: player.short_name,
      age: player.age,
      position: player.primary_position,
      overall: one5(player.player_attributes)?.overall ?? 75,
      askingPrice: Number(data.asking_price),
      availableUntil: data.available_until,
      sellerName: data.seller_name ?? "Global Market",
      sellerClubId: data.seller_club_id,
      clubPlayerId: data.club_player_id,
      isOwnListing: data.seller_club_id === clubId
    };
  }
  /**
   * Purchases a player listing (global star or in-league player) atomically via RPC.
   */
  async buy(userId, buyerClubId, listingId) {
    const { error } = await this.database.rpc("buy_global_player", {
      p_user_id: userId,
      p_buyer_club_id: buyerClubId,
      p_listing_id: listingId
    });
    if (error) {
      throw new Error(error.message ?? "TRANSFER_FAILED");
    }
    return { status: "ACCEPTED" };
  }
  /**
   * Lists players owned by the club that can be put up for sale.
   * Includes starting XI flag and active listing information.
   */
  async saleCandidates(userId, clubId) {
    await this.ownerLeague(userId, clubId);
    const [{ data, error }, { data: activeListings, error: listingsError }, { data: startingData }] = await Promise.all([
      this.database.from("club_players").select(
        "id, resale_locked_until, players!inner(short_name, primary_position, market_value, age, nationality, player_attributes!inner(overall)), league_clubs!inner(league_instance_id, clubs!inner(name))"
      ).eq("league_club_id", clubId),
      this.database.from("global_market_listings").select("id, club_player_id").eq("seller_club_id", clubId).eq("status", "ACTIVE"),
      this.database.from("lineup_players").select("club_player_id, lineups!inner(league_club_id)").eq("lineups.league_club_id", clubId)
    ]);
    if (error) throw error;
    if (listingsError) throw listingsError;
    const listedMap = new Map((activeListings ?? []).map((l) => [l.club_player_id, l.id]));
    const startingSet = new Set((startingData ?? []).map((s) => s.club_player_id));
    const now = /* @__PURE__ */ new Date();
    return (data ?? []).filter((row) => !row.resale_locked_until || new Date(row.resale_locked_until) <= now).map((row) => {
      const player = one5(row.players);
      const leagueClub = one5(row.league_clubs);
      const club = one5(leagueClub.clubs);
      const listingId = listedMap.get(row.id);
      return {
        clubPlayerId: row.id,
        name: player.short_name,
        clubName: club.name,
        targetClubId: clubId,
        leagueInstanceId: leagueClub.league_instance_id,
        position: player.primary_position,
        overall: one5(player.player_attributes)?.overall ?? 75,
        marketValue: Number(player.market_value),
        age: player.age,
        nationality: player.nationality,
        isStarting: startingSet.has(row.id),
        isListed: Boolean(listingId),
        listingId: listingId ?? void 0
      };
    }).sort((a, b) => b.overall - a.overall);
  }
  /**
   * Lists opponent clubs within the EXACT SAME league instance.
   */
  async leagueClubs(userId, clubId) {
    const owner = await this.ownerLeague(userId, clubId);
    const { data, error } = await this.database.from("league_clubs").select("id, clubs!inner(name)").eq("league_instance_id", owner.league_instance_id).neq("id", clubId).order("clubs(name)");
    if (error) throw error;
    return (data ?? []).map((row) => ({
      leagueClubId: row.id,
      clubName: one5(row.clubs).name
    }));
  }
  /**
   * Fetches players of an opponent club in the same league instance.
   */
  async clubTargets(userId, buyerClubId, targetClubId, page = 0, pageSize = 20) {
    const owner = await this.ownerLeague(userId, buyerClubId);
    if (targetClubId === buyerClubId) throw new Error("OWN_CLUB");
    const { data: target, error: targetError } = await this.database.from("league_clubs").select("id, league_instance_id, clubs!inner(name)").eq("id", targetClubId).maybeSingle();
    if (targetError || !target || target.league_instance_id !== owner.league_instance_id) {
      throw new Error("TARGET_CLUB_INVALID");
    }
    const from = page * pageSize;
    const { data, error } = await this.database.from("club_players").select(
      "id, resale_locked_until, players!inner(short_name, primary_position, market_value, age, nationality, player_attributes!inner(overall))"
    ).eq("league_club_id", targetClubId).range(from, from + pageSize - 1);
    if (error) throw error;
    const clubName = one5(target.clubs).name;
    const now = /* @__PURE__ */ new Date();
    return (data ?? []).map((row) => {
      const player = one5(row.players);
      const isResaleLocked = Boolean(row.resale_locked_until && new Date(row.resale_locked_until) > now);
      return {
        clubPlayerId: row.id,
        name: player.short_name,
        clubName,
        targetClubId,
        position: player.primary_position,
        overall: one5(player.player_attributes).overall,
        marketValue: Number(player.market_value),
        age: player.age,
        nationality: player.nationality,
        isResaleLocked
      };
    }).sort((a, b) => b.overall - a.overall);
  }
  /**
   * Fetches full profile for a single target player by clubPlayerId.
   */
  async targetPlayer(clubPlayerId, buyerClubId) {
    const { data, error } = await this.database.from("club_players").select(
      "id, league_club_id, resale_locked_until, players!inner(short_name, primary_position, market_value, age, nationality, player_attributes!inner(overall)), league_clubs!inner(league_instance_id, clubs!inner(name))"
    ).eq("id", clubPlayerId).maybeSingle();
    if (error || !data) return null;
    const player = one5(data.players);
    const leagueClub = one5(data.league_clubs);
    const club = one5(leagueClub.clubs);
    const isResaleLocked = Boolean(data.resale_locked_until && new Date(data.resale_locked_until) > /* @__PURE__ */ new Date());
    let activeNegotiation = void 0;
    if (buyerClubId) {
      const { data: offer } = await this.database.from("transfer_offers").select("id, status, amount, counter_amount").eq("buyer_club_id", buyerClubId).eq("club_player_id", clubPlayerId).in("status", ["PENDING", "COUNTERED"]).gt("expires_at", (/* @__PURE__ */ new Date()).toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (offer) {
        activeNegotiation = {
          offerId: offer.id,
          status: offer.status,
          amount: Number(offer.amount),
          counterAmount: offer.counter_amount ? Number(offer.counter_amount) : null
        };
      }
    }
    return {
      clubPlayerId: data.id,
      name: player.short_name,
      clubName: club.name,
      targetClubId: data.league_club_id,
      leagueInstanceId: leagueClub.league_instance_id,
      position: player.primary_position,
      overall: one5(player.player_attributes).overall,
      marketValue: Number(player.market_value),
      age: player.age,
      nationality: player.nationality,
      isResaleLocked,
      activeNegotiation
    };
  }
  async listForSale(userId, clubId, clubPlayerId, askingPrice) {
    const candidates = await this.saleCandidates(userId, clubId);
    const candidate = candidates.find((player) => player.clubPlayerId === clubPlayerId);
    if (!candidate) {
      throw new Error("PLAYER_NOT_AVAILABLE");
    }
    const { count, error: countError } = await this.database.from("club_players").select("id", { count: "exact", head: true }).eq("league_club_id", clubId);
    if (countError) throw countError;
    if ((count ?? 0) <= 18) throw new Error("SELLER_MIN_SQUAD");
    const { data: cp, error: cpError } = await this.database.from("club_players").select("player_id, league_clubs!inner(clubs!inner(name))").eq("id", clubPlayerId).single();
    if (cpError || !cp) throw new Error("PLAYER_NOT_FOUND");
    const sellerClubName = one5(cp.league_clubs)?.clubs?.name ?? "Klub";
    const availableUntil = new Date(Date.now() + 48 * 3600 * 1e3).toISOString();
    const { error } = await this.database.from("global_market_listings").insert({
      club_player_id: clubPlayerId,
      player_id: cp.player_id,
      seller_club_id: clubId,
      seller_name: sellerClubName,
      asking_price: askingPrice,
      available_until: availableUntil,
      status: "ACTIVE"
    });
    if (error) throw error;
  }
  /**
   * Delists an active player listing owned by the club.
   */
  async delist(userId, clubId, listingId) {
    await this.ownerLeague(userId, clubId);
    const { data: listing, error: findError } = await this.database.from("global_market_listings").select("id, seller_club_id, status").eq("id", listingId).eq("seller_club_id", clubId).eq("status", "ACTIVE").maybeSingle();
    if (findError || !listing) {
      throw new Error("LISTING_NOT_FOUND");
    }
    const { error } = await this.database.from("global_market_listings").update({ status: "CANCELLED" }).eq("id", listingId);
    if (error) throw error;
  }
  /**
   * Submits an offer for a player in the same league.
   */
  async offer(userId, buyerClubId, clubPlayerId, amount) {
    const { data, error } = await this.database.rpc("create_transfer_offer", {
      p_user_id: userId,
      p_buyer_club_id: buyerClubId,
      p_club_player_id: clubPlayerId,
      p_amount: amount
    });
    if (error) throw error;
    const result = data?.[0];
    return {
      offerId: result.offer_id,
      status: result.status,
      counterAmount: result.counter_amount ? Number(result.counter_amount) : null
    };
  }
  async incomingOffers(userId, clubId) {
    const { data: club, error: clubError } = await this.database.from("league_clubs").select("id").eq("id", clubId).eq("manager_user_id", userId).maybeSingle();
    if (clubError || !club) throw new Error("CLUB_NOT_OWNED");
    const { data, error } = await this.database.from("transfer_offers").select("id, buyer_club_id, club_player_id, amount, expires_at").eq("seller_club_id", clubId).eq("status", "PENDING").order("created_at", { ascending: false });
    if (error) throw error;
    const offers = data ?? [];
    if (!offers.length) return [];
    const playerIds = offers.map((row) => row.club_player_id);
    const buyerIds = offers.map((row) => row.buyer_club_id);
    const [playersResult, buyersResult] = await Promise.all([
      this.database.from("club_players").select("id, players!inner(short_name, primary_position, player_attributes!inner(overall))").in("id", playerIds),
      this.database.from("league_clubs").select("id, clubs!inner(name)").in("id", buyerIds)
    ]);
    if (playersResult.error) throw playersResult.error;
    if (buyersResult.error) throw buyersResult.error;
    const players = new Map(
      (playersResult.data ?? []).map((row) => {
        const p = one5(row.players);
        return [row.id, p];
      })
    );
    const buyers = new Map(
      (buyersResult.data ?? []).map((row) => [row.id, one5(row.clubs).name])
    );
    return offers.map((row) => {
      const p = players.get(row.club_player_id);
      return {
        offerId: row.id,
        buyerClub: buyers.get(row.buyer_club_id) ?? "Noma\u2019lum klub",
        playerName: p?.short_name ?? "Futbolchi",
        position: p?.primary_position ?? "",
        overall: p ? one5(p.player_attributes).overall : 0,
        amount: Number(row.amount),
        expiresAt: row.expires_at
      };
    });
  }
  async respondToOffer(userId, offerId, decision) {
    const { data, error } = await this.database.rpc("respond_transfer_offer", {
      p_user_id: userId,
      p_offer_id: offerId,
      p_decision: decision,
      p_counter: null
    });
    if (error) throw error;
    return String(data);
  }
  async counterOffer(userId, offerId, amount) {
    const { data, error } = await this.database.rpc("respond_transfer_offer", {
      p_user_id: userId,
      p_offer_id: offerId,
      p_decision: "COUNTER",
      p_counter: amount
    });
    if (error) throw error;
    return String(data);
  }
  async acceptCounterOffer(userId, offerId) {
    const { error } = await this.database.rpc("accept_counter_offer", {
      p_user_id: userId,
      p_offer_id: offerId
    });
    if (error) throw error;
  }
  async notification(offerId) {
    const { data: offer, error } = await this.database.from("transfer_offers").select("id, buyer_club_id, seller_club_id, club_player_id, amount, counter_amount").eq("id", offerId).maybeSingle();
    if (error || !offer) return null;
    const [clubsResult, playerResult] = await Promise.all([
      this.database.from("league_clubs").select("id, manager_user_id, clubs!inner(name)").in("id", [offer.buyer_club_id, offer.seller_club_id]),
      this.database.from("club_players").select("players!inner(short_name)").eq("id", offer.club_player_id).maybeSingle()
    ]);
    if (clubsResult.error) throw clubsResult.error;
    if (playerResult.error) throw playerResult.error;
    const clubs = new Map(
      (clubsResult.data ?? []).map((row) => [
        row.id,
        { name: one5(row.clubs).name, userId: row.manager_user_id }
      ])
    );
    const ids = [...new Set([...clubs.values()].map((c) => c.userId).filter(Boolean))];
    const { data: people, error: peopleError } = ids.length ? await this.database.from("users").select("id, telegram_id").in("id", ids) : { data: [], error: null };
    if (peopleError) throw peopleError;
    const telegram = new Map((people ?? []).map((row) => [row.id, row.telegram_id]));
    const buyer = clubs.get(offer.buyer_club_id);
    const seller = clubs.get(offer.seller_club_id);
    return {
      offerId: offer.id,
      playerName: one5(playerResult.data?.players).short_name,
      amount: Number(offer.amount),
      counterAmount: offer.counter_amount ? Number(offer.counter_amount) : null,
      buyerClub: buyer?.name ?? "Klub",
      sellerClub: seller?.name ?? "Klub",
      buyerClubId: offer.buyer_club_id,
      sellerClubId: offer.seller_club_id,
      buyerTelegramId: buyer?.userId ? telegram.get(buyer.userId) ?? null : null,
      sellerTelegramId: seller?.userId ? telegram.get(seller.userId) ?? null : null
    };
  }
  /**
   * Fetches incoming and outgoing transfer history for a club.
   */
  async transferHistory(clubId) {
    const { data, error } = await this.database.from("transfer_offers").select(
      "id, amount, responded_at, buyer_club_id, seller_club_id, club_players!inner(players!inner(short_name)), buyer:league_clubs!buyer_club_id(clubs!inner(name)), seller:league_clubs!seller_club_id(clubs!inner(name))"
    ).eq("status", "ACCEPTED").or(`buyer_club_id.eq.${clubId},seller_club_id.eq.${clubId}`).order("responded_at", { ascending: false }).limit(20);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const isBuyer = row.buyer_club_id === clubId;
      const player = one5(row.club_players).players;
      const buyerName = one5(row.buyer).clubs.name;
      const sellerName = one5(row.seller).clubs.name;
      return {
        id: row.id,
        type: isBuyer ? "INCOMING" : "OUTGOING",
        playerName: player.short_name,
        fromClub: sellerName,
        toClub: buyerName,
        fee: Number(row.amount),
        date: row.responded_at
      };
    });
  }
  /**
   * Database-backed session storage for custom user inputs (avoids in-memory Maps in serverless edge functions).
   */
  async saveInputSession(userId, mode, data) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1e3).toISOString();
    await this.database.from("user_input_sessions").upsert({
      user_id: userId,
      mode,
      data,
      expires_at: expiresAt
    }, { onConflict: "user_id" });
  }
  async getInputSession(userId) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data, error } = await this.database.from("user_input_sessions").select("mode, data, expires_at").eq("user_id", userId).gt("expires_at", now).maybeSingle();
    if (error || !data) return null;
    return { mode: data.mode, data: data.data };
  }
  async clearInputSession(userId) {
    await this.database.from("user_input_sessions").delete().eq("user_id", userId);
  }
  async ownerLeague(userId, clubId, requireActive = false) {
    const { data, error } = await this.database.from("league_clubs").select("league_instance_id, league_instances!inner(status)").eq("id", clubId).eq("manager_user_id", userId).maybeSingle();
    if (error || !data) throw new Error("CLUB_NOT_OWNED");
    const status = one5(data.league_instances)?.status ?? "ACTIVE";
    if (requireActive && status === "OPEN") {
      throw new Error("LEAGUE_PRE_SEASON_LOCKED");
    }
    return { league_instance_id: data.league_instance_id, league_status: status };
  }
  async maintain() {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.database.rpc("expire_transfer_offers");
    await this.database.from("global_market_listings").update({ status: "EXPIRED" }).eq("status", "ACTIVE").lte("available_until", now);
  }
};

// src/progression/progression.repository.ts
var ProgressionRepository = class {
  constructor(database) {
    this.database = database;
  }
  database;
  async profile(userId) {
    const { data, error } = await this.database.from("manager_profiles").select("manager_rating,matches,wins,draws,losses,titles,seasons,total_transfer_spend,total_transfer_income,biggest_transfer,users!inner(first_name,username)").eq("user_id", userId).single();
    if (error) throw error;
    const u = Array.isArray(data.users) ? data.users[0] : data.users;
    return { name: u.first_name, username: u.username, rating: data.manager_rating, matches: data.matches, wins: data.wins, draws: data.draws, losses: data.losses, titles: data.titles, seasons: data.seasons, spend: Number(data.total_transfer_spend), income: Number(data.total_transfer_income), biggest: Number(data.biggest_transfer) };
  }
  async leaderboard(limit = 20) {
    const { data, error } = await this.database.from("manager_profiles").select("manager_rating,matches,wins,draws,losses,titles,seasons,total_transfer_spend,total_transfer_income,biggest_transfer,users!inner(first_name,username)").order("manager_rating", { ascending: false }).order("wins", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => {
      const u = Array.isArray(r.users) ? r.users[0] : r.users;
      return { name: u.first_name, username: u.username, rating: r.manager_rating, matches: r.matches, wins: r.wins, draws: r.draws, losses: r.losses, titles: r.titles, seasons: r.seasons, spend: Number(r.total_transfer_spend), income: Number(r.total_transfer_income), biggest: Number(r.biggest_transfer) };
    });
  }
  async sponsors() {
    const { data, error } = await this.database.from("sponsors").select("id,name,payment_per_match,required_channel_id,required_channel_username,join_url").eq("is_active", true).order("payment_per_match");
    if (error) throw error;
    return (data ?? []).map((s) => ({ id: s.id, name: s.name, payment: Number(s.payment_per_match), channelId: s.required_channel_id ? Number(s.required_channel_id) : null, channelUsername: s.required_channel_username, joinUrl: s.join_url }));
  }
  async acceptSponsor(userId, clubId, sponsorId) {
    const { error } = await this.database.rpc("accept_sponsor", { p_user_id: userId, p_league_club_id: clubId, p_sponsor_id: sponsorId });
    if (error) throw error;
  }
  async setEligibility(userId, clubId, eligible) {
    const { error } = await this.database.rpc("update_sponsor_eligibility", { p_user_id: userId, p_league_club_id: clubId, p_eligible: eligible });
    if (error) throw error;
  }
};

// src/admin/admin.repository.ts
var AdminRepository = class {
  constructor(database) {
    this.database = database;
  }
  database;
  async stats() {
    const count = async (table, filters) => {
      let q = this.database.from(table).select("*", { count: "exact", head: true });
      if (filters) q = filters(q);
      const r = await q;
      if (r.error) throw r.error;
      return r.count ?? 0;
    };
    return { users: await count("users"), activeUsers: await count("users", (q) => q.eq("is_blocked", false)), blockedUsers: await count("users", (q) => q.eq("is_blocked", true)), humanClubs: await count("league_clubs", (q) => q.eq("manager_type", "HUMAN")), aiClubs: await count("league_clubs", (q) => q.eq("manager_type", "AI")), matches: await count("matches"), offers: await count("transfer_offers"), activeListings: await count("global_market_listings", (q) => q.eq("status", "ACTIVE")) };
  }
  async users() {
    const { data, error } = await this.database.from("users").select("id,telegram_id,first_name,username,is_blocked,last_seen_at").order("last_seen_at", { ascending: false }).limit(20);
    if (error) throw error;
    return (data ?? []).map((u) => ({ id: u.id, telegramId: Number(u.telegram_id), name: u.first_name, username: u.username, blocked: u.is_blocked, lastSeen: u.last_seen_at }));
  }
  async sponsors() {
    const { data, error } = await this.database.from("sponsors").select("id,name,payment_per_match,is_active,required_channel_id,required_channel_username,join_url").order("payment_per_match");
    if (error) throw error;
    return (data ?? []).map((s) => ({ id: s.id, name: s.name, payment: Number(s.payment_per_match), active: s.is_active, channelId: s.required_channel_id ? Number(s.required_channel_id) : null, channel: s.required_channel_username, joinUrl: s.join_url }));
  }
  async setBlocked(actor, target, blocked) {
    const { error } = await this.database.rpc("admin_set_user_blocked", { p_actor_user_id: actor, p_target_user_id: target, p_blocked: blocked, p_reason: "Telegram admin panel" });
    if (error) throw error;
  }
  async setSponsor(actor, id, active) {
    const { error } = await this.database.rpc("admin_set_sponsor_active", { p_actor_user_id: actor, p_sponsor_id: id, p_active: active });
    if (error) throw error;
  }
  async audit() {
    const { data, error } = await this.database.from("admin_audit_log").select("action,target_type,reason,created_at,users!inner(username,first_name)").order("created_at", { ascending: false }).limit(20);
    if (error) throw error;
    return data ?? [];
  }
};

// src/lib/profiler.ts
var RequestProfiler = class {
  start = performance.now();
  checkpoints = {};
  async time(stage, fn) {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      const elapsed = Number((performance.now() - t0).toFixed(2));
      this.checkpoints[stage] = Number(((this.checkpoints[stage] ?? 0) + elapsed).toFixed(2));
    }
  }
  timeSync(stage, fn) {
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      const elapsed = Number((performance.now() - t0).toFixed(2));
      this.checkpoints[stage] = Number(((this.checkpoints[stage] ?? 0) + elapsed).toFixed(2));
    }
  }
  record(stage, durationMs) {
    const rounded = Number(durationMs.toFixed(2));
    this.checkpoints[stage] = Number(((this.checkpoints[stage] ?? 0) + rounded).toFixed(2));
  }
  getMetrics() {
    return {
      totalDurationMs: Number((performance.now() - this.start).toFixed(2)),
      stages: { ...this.checkpoints }
    };
  }
};

// src/webhook/telegram-handler.ts
function verifySecretToken(req, expectedSecret) {
  if (!expectedSecret) return true;
  const headerToken = req.headers.get("x-telegram-bot-api-secret-token");
  return headerToken === expectedSecret;
}
async function claimTelegramUpdate(database, updateId) {
  try {
    const { error } = await database.from("telegram_processed_updates").insert({
      update_id: updateId,
      status: "processing",
      received_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (error) {
      if (error.code === "23505") {
        return false;
      }
      if (error.code === "42P01" || error.code === "PGRST204") {
        return true;
      }
      return true;
    }
    return true;
  } catch {
    return true;
  }
}
async function markTelegramUpdateComplete(database, updateId) {
  try {
    await database.from("telegram_processed_updates").update({
      status: "completed",
      processed_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("update_id", updateId);
  } catch {
  }
}
async function markTelegramUpdateFailed(database, updateId, errorMessage) {
  try {
    await database.from("telegram_processed_updates").update({
      status: "failed",
      error_message: errorMessage,
      processed_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("update_id", updateId);
  } catch {
  }
}
var botInitPromises = /* @__PURE__ */ new WeakMap();
async function ensureBotInitialized(bot) {
  if (typeof bot.isInited === "function" && bot.isInited()) {
    return;
  }
  if (typeof bot.init !== "function") {
    return;
  }
  let promise = botInitPromises.get(bot);
  if (!promise) {
    promise = bot.init().then(() => void 0).catch((err) => {
      botInitPromises.delete(bot);
      throw err;
    });
    botInitPromises.set(bot, promise);
  }
  await promise;
}
function getSbRegion(req) {
  if (typeof Deno !== "undefined" && typeof Deno.env?.get === "function") {
    const denoRegion = Deno.env.get("SB_REGION");
    if (denoRegion) return denoRegion;
  }
  if (typeof process !== "undefined" && process.env?.SB_REGION) {
    return process.env.SB_REGION;
  }
  if (req) {
    const headerRegion = req.headers.get("x-sb-edge-region") || req.headers.get("x-region");
    if (headerRegion) return headerRegion;
    try {
      const url = new URL(req.url);
      const forced = url.searchParams.get("forceFunctionRegion");
      if (forced) return forced;
    } catch {
    }
  }
  return "unknown";
}
var isColdStart = true;
function categorizeDurations(stages) {
  let databaseRpcDurationMs = 0;
  let telegramApiDurationMs = 0;
  let callbackAckDurationMs = 0;
  for (const [stage, duration] of Object.entries(stages)) {
    if (stage === "callback_ack") {
      callbackAckDurationMs += duration;
    } else if (stage.startsWith("telegram_api")) {
      telegramApiDurationMs += duration;
    } else if (stage.startsWith("idempotency") || stage.includes("rpc") || stage.includes("user_") || stage.includes("manager_") || stage.includes("league_") || stage.includes("db") || stage.includes("query") || stage.includes("fixture") || stage.includes("squad") || stage.includes("tactics")) {
      databaseRpcDurationMs += duration;
    }
  }
  return {
    databaseRpcDurationMs: Number(databaseRpcDurationMs.toFixed(2)),
    telegramApiDurationMs: Number(telegramApiDurationMs.toFixed(2)),
    callbackAckDurationMs: Number(callbackAckDurationMs.toFixed(2))
  };
}
async function handleTelegramWebhook(req, deps) {
  const profiler = new RequestProfiler();
  deps.bot.__currentProfiler = profiler;
  if (req.method === "GET") {
    const cold2 = isColdStart;
    isColdStart = false;
    let isWarmup = false;
    try {
      const url = new URL(req.url);
      isWarmup = url.searchParams.get("warmup") === "1";
    } catch {
    }
    if (isWarmup) {
      deps.logger.info(
        {
          event: "webhook_warmup_ping",
          cold_start: cold2,
          SB_REGION: getSbRegion(req)
        },
        `Warmup ping received (cold_start: ${cold2})`
      );
      return Response.json(
        {
          status: "ok",
          service: "telegram-webhook",
          warmup: true,
          cold_start: cold2,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        },
        { status: 200 }
      );
    }
    return Response.json(
      {
        status: "ok",
        service: "telegram-webhook",
        cold_start: cold2,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      },
      { status: 200 }
    );
  }
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { Allow: "GET, POST, OPTIONS" }
    });
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const cold = isColdStart;
  isColdStart = false;
  if (deps.secretToken && !verifySecretToken(req, deps.secretToken)) {
    deps.logger.warn({ event: "telegram_webhook_unauthorized" }, "Invalid Telegram secret token header");
    return Response.json({ error: "Unauthorized: invalid secret token" }, { status: 401 });
  }
  let update;
  try {
    update = await req.json();
  } catch (parseError) {
    deps.logger.error({ event: "telegram_update_json_parse_failed", err: parseError }, "Failed to parse update JSON");
    return Response.json({ error: "Bad request: invalid JSON payload" }, { status: 400 });
  }
  if (!update || typeof update.update_id !== "number") {
    return Response.json({ error: "Bad request: missing update_id" }, { status: 400 });
  }
  const isNewUpdate = await profiler.time("idempotency_claim", () => claimTelegramUpdate(deps.database, update.update_id));
  if (!isNewUpdate) {
    deps.logger.warn(
      { event: "duplicate_telegram_update_skipped", updateId: update.update_id },
      "Skipping duplicate Telegram update"
    );
    return Response.json({ ok: true, skipped: true, reason: "duplicate_update" }, { status: 200 });
  }
  try {
    await profiler.time("bot_init", () => ensureBotInitialized(deps.bot));
    await deps.bot.handleUpdate(update);
    const completePromise = profiler.time("idempotency_complete", () => markTelegramUpdateComplete(deps.database, update.update_id));
    if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
      EdgeRuntime.waitUntil(completePromise);
    } else {
      void completePromise;
    }
    const metrics = profiler.getMetrics();
    const sbRegion = getSbRegion(req);
    const { databaseRpcDurationMs, telegramApiDurationMs, callbackAckDurationMs } = categorizeDurations(metrics.stages);
    const botInitMs = Number((metrics.stages.bot_init ?? 0).toFixed(2));
    deps.logger.info(
      {
        event: "telegram_update_profiled",
        update_id: update.update_id,
        cold_start: cold,
        bot_init_ms: botInitMs,
        callback_ack_ms: callbackAckDurationMs,
        db_ms: databaseRpcDurationMs,
        telegram_api_ms: telegramApiDurationMs,
        total_ms: metrics.totalDurationMs,
        total_duration_ms: metrics.totalDurationMs,
        database_rpc_duration_ms: databaseRpcDurationMs,
        SB_REGION: sbRegion,
        stages: metrics.stages
      },
      `[${sbRegion}] Telegram update ${update.update_id} processed in ${metrics.totalDurationMs}ms (cold_start: ${cold}, bot_init: ${botInitMs}ms, callback_ack: ${callbackAckDurationMs}ms, db: ${databaseRpcDurationMs}ms, telegram_api: ${telegramApiDurationMs}ms)`
    );
    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markTelegramUpdateFailed(deps.database, update.update_id, message);
    const metrics = profiler.getMetrics();
    const sbRegion = getSbRegion(req);
    const { databaseRpcDurationMs, telegramApiDurationMs, callbackAckDurationMs } = categorizeDurations(metrics.stages);
    const botInitMs = Number((metrics.stages.bot_init ?? 0).toFixed(2));
    deps.logger.error(
      {
        event: "telegram_update_processing_failed",
        update_id: update.update_id,
        cold_start: cold,
        bot_init_ms: botInitMs,
        callback_ack_ms: callbackAckDurationMs,
        db_ms: databaseRpcDurationMs,
        telegram_api_ms: telegramApiDurationMs,
        total_ms: metrics.totalDurationMs,
        total_duration_ms: metrics.totalDurationMs,
        database_rpc_duration_ms: databaseRpcDurationMs,
        SB_REGION: sbRegion,
        stages: metrics.stages,
        err: error
      },
      `[${sbRegion}] Telegram update processing failed: ${message}`
    );
    return Response.json({ ok: false, error: message }, { status: 200 });
  }
}

// src/webhook/edge-entry.ts
function getEnv(key) {
  if (typeof Deno !== "undefined" && typeof Deno.env?.get === "function") {
    return Deno.env.get(key);
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }
  return void 0;
}
var edgeLogger = {
  info: (obj, msg) => console.log(JSON.stringify({ level: "info", time: (/* @__PURE__ */ new Date()).toISOString(), message: msg, ...obj })),
  warn: (obj, msg) => console.warn(JSON.stringify({ level: "warn", time: (/* @__PURE__ */ new Date()).toISOString(), message: msg, ...obj })),
  error: (obj, msg) => console.error(JSON.stringify({ level: "error", time: (/* @__PURE__ */ new Date()).toISOString(), message: msg, ...obj }))
};
var cachedBot = null;
var cachedDb = null;
function initializeContext() {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN environment variable kiritilmagan");
  if (!supabaseUrl) throw new Error("SUPABASE_URL environment variable kiritilmagan");
  if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable kiritilmagan");
  if (!cachedDb) {
    cachedDb = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  if (!cachedBot) {
    const squads = new SquadRepository(cachedDb);
    const leagues = new LeagueRepository(cachedDb);
    const matches = new MatchRepository(cachedDb);
    const transfers = new TransferRepository(cachedDb);
    const rawAdminIds = getEnv("ADMIN_TELEGRAM_IDS") ?? "6117815120";
    const adminTelegramIds = rawAdminIds.split(",").map((id) => Number(id.trim())).filter(Number.isSafeInteger);
    cachedBot = createBot({
      token,
      users: new UserRepository(cachedDb),
      leagues,
      squads,
      tactics: new TacticsRepository(cachedDb, squads),
      fixtures: new FixtureRepository(cachedDb),
      matches,
      transfers,
      progression: new ProgressionRepository(cachedDb),
      admin: new AdminRepository(cachedDb),
      adminTelegramIds,
      logger: edgeLogger
    });
  }
  return {
    bot: cachedBot,
    database: cachedDb,
    secretToken: getEnv("TELEGRAM_WEBHOOK_SECRET")
  };
}
async function handleRequest(req) {
  try {
    const { bot, database, secretToken } = initializeContext();
    return await handleTelegramWebhook(req, {
      bot,
      database,
      secretToken,
      logger: edgeLogger
    });
  } catch (initError) {
    const message = initError instanceof Error ? initError.message : String(initError);
    edgeLogger.error({ event: "edge_function_init_failed", error: message }, "Failed to initialize Edge Function");
    return Response.json(
      { error: "Internal Server Error: " + message },
      { status: 500 }
    );
  }
}
if (typeof Deno !== "undefined" && typeof Deno.serve === "function") {
  Deno.serve(handleRequest);
}
var edge_entry_default = {
  fetch: handleRequest
};
export {
  edge_entry_default as default,
  handleRequest
};
