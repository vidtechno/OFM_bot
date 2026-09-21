// src/webhook/edge-entry.ts
import { createClient } from "@supabase/supabase-js";

// src/bot/create-bot.ts
import { Bot, InlineKeyboard } from "grammy";

// src/leagues/presentation.ts
function formatMoney(amount) {
  return `\u20AC${(amount / 1e6).toFixed(1)}M`;
}
function formatClubDashboard(club, managerName, nextMatch) {
  return [
    club.clubName.toUpperCase(),
    "",
    `\u{1F454} Murabbiy: ${managerName}`,
    `\u{1F3C6} Liga: ${club.leagueName}`,
    `\u{1F4CA} O\u2018rin: ${club.position}`,
    `\u{1F3AF} Ochko: ${club.points}`,
    `\u{1F4B0} Budjet: ${formatMoney(club.budget)}`,
    "",
    "\u{1F4C5} KEYINGI UCHRASHUV",
    nextMatch ?? "Rejalashtirilgan o\u2018yin yo\u2018q."
  ].join("\n");
}
function claimErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("CLUB_ALREADY_CLAIMED")) return "Bu klubni boshqa manager olib bo\u2018ldi. Boshqa klub tanlang.";
  if (message.includes("COMPETITION_LIMIT_REACHED")) return "Siz bu competitionda allaqachon klub boshqaryapsiz.";
  if (message.includes("LEAGUE_NOT_ACTIVE")) return "Bu liga hozir faol emas.";
  return "Klubni olishda xato yuz berdi. Qayta urinib ko\u2018ring.";
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
function formatSquad(clubName, players) {
  const groups2 = /* @__PURE__ */ new Map([["GK", []], ["DEF", []], ["MID", []], ["ATT", []]]);
  for (const player of players) groups2.get(section(player.primaryPosition)).push(player);
  const lines = [`\u{1F465} ${clubName.toUpperCase()} \u2014 JAMOA`, "", `\u{1F4CB} ${players.length} nafar futbolchi`, ""];
  for (const [label, group] of groups2) {
    lines.push({ GK: "\u{1F9E4} DARVOZABONLAR", DEF: "\u{1F6E1} HIMOYACHILAR", MID: "\u{1F3AF} YARIM HIMOYACHILAR", ATT: "\u26A1 HUJUMCHILAR" }[label] ?? label);
    if (group.length === 0) lines.push("\u2014");
    for (let index = 0; index < group.length; index += 2) lines.push(group.slice(index, index + 2).map((player) => {
      const secondary = player.secondaryPosition ? `/${player.secondaryPosition}` : "";
      return `${player.shortName} (${player.primaryPosition}${secondary} \xB7 \u2B50${player.overall})`;
    }).join("  \u2022  "));
    lines.push("");
  }
  return lines.join("\n").trim();
}

// src/tactics/presentation.ts
var terms = { VERY_DEFENSIVE: "Juda himoyaviy", DEFENSIVE: "Himoyaviy", BALANCED: "Muvozanatli", ATTACKING: "Hujumkor", VERY_ATTACKING: "Juda hujumkor", SHORT: "Qisqa pas", MIXED: "Aralash", DIRECT: "To\u2018g\u2018ridan-to\u2018g\u2018ri", LEFT: "Chap qanot", CENTRE: "Markaz", RIGHT: "O\u2018ng qanot", BOTH_WINGS: "Ikki qanot", CAUTIOUS: "Ehtiyotkor", NORMAL: "Me\u2019yorida", AGGRESSIVE: "Keskin" };
var footballTerm = (value) => terms[value] ?? value;
var positionName = (value) => ({ GK: "Darvozabon", LB: "Chap himoyachi", LWB: "Chap qanot himoyachi", CB: "Markaziy himoyachi", RB: "O\u2018ng himoyachi", RWB: "O\u2018ng qanot himoyachi", LM: "Chap yarim himoyachi", CDM: "Tayanch yarim himoyachi", CM: "Markaziy yarim himoyachi", CAM: "Hujumkor yarim himoyachi", RM: "O\u2018ng yarim himoyachi", LW: "Chap qanot hujumchi", ST: "Markaziy hujumchi", RW: "O\u2018ng qanot hujumchi" })[value] ?? value;
var formatTactics = (t) => ["\u{1F9E0} TAKTIK REJA", "", `\u{1F4D0} Sxema: ${t.formationName}`, `\u2696\uFE0F O\u2018yin uslubi: ${footballTerm(t.mentality)}`, `\u{1F525} Pressing: ${t.pressing}/100`, `\u26A1 Sur\u2019at: ${t.tempo}/100`, `\u{1F6E1} Himoya chizig\u2018i: ${t.defensiveLine}/100`, `\u2194\uFE0F Maydon kengligi: ${t.width}/100`, `\u{1F3AF} Pas uslubi: ${footballTerm(t.passingStyle)}`, `\u{1F680} Hujum yo\u2018nalishi: ${footballTerm(t.attackFocus)}`, `\u{1F9B5} To\u2018p uchun kurash: ${footballTerm(t.tackling)}`].join("\n");
var formatLineup = (formation, players) => ["\u{1F465} BOSHLANG\u2018ICH 11 TALIK", `\u{1F4D0} Sxema: ${formation}`, "", ...players.map((p) => `${p.slotKey} \xB7 ${p.shortName}  \u2B50 ${p.overall}`), "", `Jamoaviy kuch: ${(players.reduce((sum, p) => sum + p.effectiveRating, 0) / Math.max(players.length, 1)).toFixed(1)}`].join("\n");

// src/fixtures/presentation.ts
var dateTime = new Intl.DateTimeFormat("uz-UZ", {
  timeZone: "Asia/Tashkent",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});
function formatFixtureLine(fixture) {
  const venue = fixture.isHome ? "UY" : "SAFAR";
  return `${fixture.round}-tur \xB7 ${dateTime.format(new Date(fixture.scheduledAt))}
${fixture.homeClub} \u2014 ${fixture.awayClub} \xB7 ${venue}`;
}
function formatUpcomingFixtures(fixtures) {
  if (fixtures.length === 0) return "MATCHLAR\n\nRejalashtirilgan o\u2018yin topilmadi.";
  return ["KEYINGI MATCHLAR", "", ...fixtures.flatMap((fixture, index) => [formatFixtureLine(fixture), ...index < fixtures.length - 1 ? [""] : []])].join("\n");
}

// src/matches/presentation.ts
function formatResults(results) {
  if (!results.length) return "NATIJALAR\n\nHali o\u2018yin o\u2018tkazilmagan.";
  return ["\u26BD SO\u2018NGGI NATIJALAR", "", ...results.map((r) => `${r.round}-tur \xB7 ${r.homeClub} ${r.homeGoals}:${r.awayGoals} ${r.awayClub}`)].join("\n");
}
function formatTable(rows) {
  const club = (name) => name.length > 17 ? `${name.slice(0, 16)}\u2026` : name.padEnd(17, " ");
  return ["\u{1F3C6} TURNIR JADVALI", "", "#  Klub               O\u2018  G\u2018  D  M  TF   P", "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500", ...rows.map((r) => `${String(r.position).padStart(2, " ")} ${club(r.club)} ${String(r.played).padStart(2, " ")}  ${String(r.wins).padStart(2, " ")}  ${String(r.draws).padStart(2, " ")}  ${String(r.losses).padStart(2, " ")} ${String(r.goalDifference).padStart(3, " ")} ${String(r.points).padStart(3, " ")}`), "", "O\u2018: o\u2018yin \xB7 G\u2018: g\u2018alaba \xB7 D: durang \xB7 M: mag\u2018lubiyat \xB7 TF: to\u2018plar farqi"].join("\n");
}
function formatLeaders(title, leaders, unit) {
  return leaders.length ? [title, "", ...leaders.map((leader, index) => `${index + 1}. ${leader.name} \xB7 ${leader.club}
   ${leader.total} ${unit}`)].join("\n") : [title, "", "Hali o\u2018yin statistikasi shakllanmagan."].join("\n");
}
function formatFinances(summary) {
  const money2 = (value) => `\u20AC${(value / 1e6).toFixed(2)}M`;
  return ["\u{1F4B0} KLUB MOLIYASI", "", `Hisobdagi mablag\u2018: ${money2(summary.cashBalance)}`, `Transfer budjeti: ${money2(summary.transferBudget)}`, "", "\u{1F9FE} SO\u2018NGGI OPERATSIYALAR", ...summary.transactions.length ? summary.transactions.map((t) => `${t.amount >= 0 ? "+" : ""}${money2(t.amount)} \xB7 ${t.description}`) : ["Hozircha moliyaviy operatsiya yo\u2018q."]].join("\n");
}
var reportDate = new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// src/transfers/presentation.ts
var transferMoney = (n) => `\u20AC${(n / 1e6).toFixed(1)}M`;
function formatMarket(players) {
  return players.length ? ["GLOBAL TRANSFER MARKET", "", ...players.map((p, i) => `${i + 1}. ${p.name} \xB7 ${p.position} \xB7 OVR ${p.overall} \xB7 ${transferMoney(p.askingPrice)}`)].join("\n") : "GLOBAL TRANSFER MARKET\n\nHozir faol listing yo\u2018q.";
}
function formatListing(p) {
  return ["PLAYER TRANSFER", "", p.name, `${p.position} \xB7 OVR ${p.overall} \xB7 ${p.age} yosh`, `Narx: ${transferMoney(p.askingPrice)}`, "", "Xarid pul va futbolchini atomik ko\u2018chiradi."].join("\n");
}

// src/progression/presentation.ts
var money = (n) => `\u20AC${(n / 1e6).toFixed(1)}M`;
function formatProfile(p, clubs = []) {
  return ["\u{1F464} MURABBIY PROFILI", `${p.username ? `@${p.username}` : p.name} \xB7 \u{1F3C5} Reyting ${p.rating}`, "", `\u{1F3C6} Mavsum: ${p.seasons} \xB7 Sovrin: ${p.titles}`, `\u26BD O\u2018yin: ${p.matches} \xB7 G\u2018alaba: ${p.wins} \xB7 Durang: ${p.draws} \xB7 Mag\u2018lubiyat: ${p.losses}`, "", `\u{1F504} Transfer xarajati: ${money(p.spend)}`, `\u{1F4B5} Transfer daromadi: ${money(p.income)}`, `\u{1F48E} Eng qimmat transfer: ${money(p.biggest)}`, "", `\u{1F3DF} KLUBLARIM (${clubs.length})`, ...clubs.length ? clubs.map((club, index) => `${index + 1}. ${club.clubName} \xB7 ${club.leagueName}
   ${club.points} ochko \xB7 ${money(club.budget)}`) : ["Hali klub tanlanmagan."]].join("\n");
}
function formatLeaderboard(rows) {
  return ["GLOBAL MANAGER RANKING", "", ...rows.map((p, i) => `${i + 1}. ${p.username ? `@${p.username}` : p.name} \xB7 ${p.rating} \xB7 ${p.wins}W`)].join("\n");
}
function formatSponsors(rows) {
  return ["HOMIYLAR", "", ...rows.map((s, i) => `${i + 1}. ${s.name} \xB7 ${money(s.payment)}/match${s.channelId ? " \xB7 Kanal a\u2019zoligi kerak" : ""}`)].join("\n");
}

// src/admin/presentation.ts
var formatAdminStats = (s) => ["ADMIN CONTROL CENTER", "", `Users: ${s.users} \xB7 Active: ${s.activeUsers} \xB7 Blocked: ${s.blockedUsers}`, `Clubs: ${s.humanClubs} human \xB7 ${s.aiClubs} AI`, `Matches: ${s.matches}`, `Transfer offers: ${s.offers}`, `Active listings: ${s.activeListings}`].join("\n");
var formatAdminUsers = (rows) => ["FOYDALANUVCHILAR", "", ...rows.map((u, i) => `${i + 1}. ${u.username ? `@${u.username}` : u.name} \xB7 ${u.telegramId} \xB7 ${u.blocked ? "BLOCKED" : "ACTIVE"}`)].join("\n");
var formatAdminSponsors = (rows) => ["HOMIYLAR", "", ...rows.map((s, i) => `${i + 1}. ${s.name} \xB7 \u20AC${(s.payment / 1e6).toFixed(1)}M \xB7 ${s.active ? "ACTIVE" : "PAUSED"}
   Majburiy kanal: ${s.channel ?? (s.channelId ? String(s.channelId) : "sozlanmagan")}`)].join("\n");

// src/bot/keyboards.ts
import { Keyboard } from "grammy";
var MAIN_MENU = {
  club: "\u26BD Klubim",
  leagues: "\u{1F3C6} Ligalar",
  transfer: "\u{1F30D} Transfer",
  profile: "\u{1F464} Profil",
  admin: "\u{1F6E0} Admin panel"
};
function createMainKeyboard(isAdmin = false) {
  const keyboard = new Keyboard().text(MAIN_MENU.club).text(MAIN_MENU.leagues).row().text(MAIN_MENU.profile);
  if (isAdmin) keyboard.row().text(MAIN_MENU.admin);
  return keyboard.resized().persistent();
}

// src/bot/create-bot.ts
var PAGE_SIZE = 10;
async function editOrReply(context, text, keyboard) {
  if (context.callbackQuery?.message) {
    try {
      await context.editMessageText(text, { reply_markup: keyboard });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("message is not modified")) throw error;
    }
  } else {
    await context.reply(text, { reply_markup: keyboard });
  }
}
function clubListKeyboard(clubs, leagueId, page) {
  const keyboard = new InlineKeyboard();
  for (const club of clubs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
    keyboard.text(club.clubName, `cf:${club.leagueClubId}`).row();
  }
  if (page > 0) keyboard.text("\u2190 Oldingi", `lg:${leagueId}:${page - 1}`);
  if ((page + 1) * PAGE_SIZE < clubs.length) keyboard.text("Keyingi \u2192", `lg:${leagueId}:${page + 1}`);
  if (page > 0 || (page + 1) * PAGE_SIZE < clubs.length) keyboard.row();
  return keyboard.text("\u2190 Competitionlar", "join");
}
function dashboardKeyboard(leagueClubId) {
  return new InlineKeyboard().text("\u{1F465} Tarkib", `sq:${leagueClubId}`).text("\u{1F9E0} Taktika", `tc:${leagueClubId}`).row().text("\u{1F504} Transferlar", `tr:${leagueClubId}`).text("\u{1F4B0} Moliya", `fn:${leagueClubId}`).row().text("\u26BD Uchrashuvlar", `mt:${leagueClubId}`).text("\u{1F3C6} Liga jadvali", `tb:${leagueClubId}`).row().text("\u{1F945} To\u2018purarlar", `sc:${leagueClubId}`).text("\u{1F3AF} Assistentlar", `asst:${leagueClubId}`);
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
  const lineupDrafts = /* @__PURE__ */ new Map();
  const transferClubSelection = /* @__PURE__ */ new Map();
  const privateLeagueJoinPending = /* @__PURE__ */ new Set();
  const transferInputs = /* @__PURE__ */ new Map();
  const saleBrowses = /* @__PURE__ */ new Map();
  const targetBrowses = /* @__PURE__ */ new Map();
  const targetClubBrowses = /* @__PURE__ */ new Map();
  const incomingOfferClubs = /* @__PURE__ */ new Map();
  const sendUpdate = async (telegramId, text, keyboard) => {
    if (!telegramId) return;
    try {
      await bot.api.sendMessage(telegramId, text, { reply_markup: keyboard });
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
  const showCompetitions = async (context) => {
    const profiler = context.profiler;
    const competitions = profiler ? await profiler.time("league_club_query", () => leagues.listCompetitions()) : await leagues.listCompetitions();
    const keyboard = new InlineKeyboard();
    for (const competition of competitions) keyboard.text(competition.name, `cmp:${competition.id}`).row();
    keyboard.text("\u{1F512} Private liga yaratish", "pv").text("\u{1F511} Kod bilan qo\u2018shilish", "pj");
    await editOrReply(context, "\u{1F30D} GLOBAL LIGALAR\n\nChempionatni tanlang. Global ligalar bot tomonidan belgilangan vaqtlarda ochiladi.\n\nPrivate ligada esa faqat taklif kodi bilan do\u2018stlaringiz qo\u2018shila oladi:", keyboard);
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
    logger.info({ event: "user_registered", userId: user.id, telegramId: user.telegram_id }, "User registered or updated");
    const welcomeLines = [
      `\u26BD Xush kelibsiz, ${telegramUser.first_name}!`,
      "",
      "OFM Game\u2019da sevimli klubingizni boshqaring: tarkib tuzing, taktika tanlang, transfer qiling va chempionlik uchun kurashing! \u{1F3C6}"
    ];
    if (managedClubs.length === 0) {
      welcomeLines.push("", "\u{1F4A1} Boshlash uchun ligaga qo\u2018shiling \u{1F447}");
    }
    const inlineMarkup = new InlineKeyboard().text("\u26BD Klubim", "home:club").text("\u{1F3C6} Ligaga qo\u2018shilish", "join").row().text("\u{1F464} Profilim", "pf:0");
    const mainKeyboard = createMainKeyboard(isAdmin(telegramUser.id));
    await Promise.all([
      context.reply(welcomeLines.join("\n"), { reply_markup: inlineMarkup }),
      context.reply("Asosiy menyu doimo quyida \u{1F447}", { reply_markup: mainKeyboard })
    ]);
  });
  bot.hears(MAIN_MENU.club, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const profiler = context.profiler;
    const clubs = profiler ? await profiler.time("league_club_query", () => leagues.listManagedClubs(user.id)) : await leagues.listManagedClubs(user.id);
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
    const profiler = context.profiler;
    const clubs = profiler ? await profiler.time("league_club_query", () => leagues.listManagedClubs(user.id)) : await leagues.listManagedClubs(user.id);
    if (!clubs.length) return showCompetitions(context);
    return showDashboard(context, clubs[0]);
  });
  bot.hears(MAIN_MENU.leagues, showCompetitions);
  bot.hears(MAIN_MENU.profile, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const profiler = context.profiler;
    const [profile, clubs] = profiler ? await Promise.all([
      profiler.time("manager_profile", () => progression.profile(user.id)),
      profiler.time("league_club_query", () => leagues.listManagedClubs(user.id))
    ]) : await Promise.all([progression.profile(user.id), leagues.listManagedClubs(user.id)]);
    await context.reply(formatProfile(profile, clubs), { reply_markup: new InlineKeyboard().text("\u{1F3C5} Global reyting", "lb:0") });
  });
  bot.callbackQuery("lb:0", async (context) => {
    await context.answerCallbackQuery();
    const profiler = context.profiler;
    const leaders = profiler ? await profiler.time("manager_profile", () => progression.leaderboard()) : await progression.leaderboard();
    await editOrReply(context, formatLeaderboard(leaders), new InlineKeyboard().text("\u2190 Profil", "pf:0"));
  });
  bot.callbackQuery("pf:0", async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const profiler = context.profiler;
    const profile = profiler ? await profiler.time("manager_profile", () => progression.profile(user.id)) : await progression.profile(user.id);
    await editOrReply(context, formatProfile(profile), new InlineKeyboard().text("Global reyting", "lb:0"));
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
    const actor = await users.upsertFromTelegram(context.from);
    await admin.setBlocked(actor.id, context.match[2], context.match[1] === "ab");
    await context.reply("User holati yangilandi.");
  });
  bot.callbackQuery(/^as:([0-9a-f-]{36}):([01])$/, async (context) => {
    if (!context.from || !isAdmin(context.from.id)) return;
    await context.answerCallbackQuery();
    const actor = await users.upsertFromTelegram(context.from);
    await admin.setSponsor(actor.id, context.match[1], context.match[2] === "1");
    await context.reply("Sponsor holati yangilandi.");
  });
  const showMarket = async (context, clubId, page, group = "ALL") => {
    if (!context.from) return;
    transferClubSelection.set(context.from.id, clubId);
    const user = await users.upsertFromTelegram(context.from), items = await transfers.market(user.id, clubId, page, 8, group);
    const keyboard = new InlineKeyboard();
    for (const item of items) keyboard.text(`\u26BD ${item.name} \xB7 \u2B50${item.overall} \xB7 ${transferMoney(item.askingPrice)}`, `gb:${item.listingId}`).row();
    keyboard.text("\u{1F31F} Barchasi", `gm:${clubId}:0:ALL`).text("\u{1F945} Darvozabon", `gm:${clubId}:0:GK`).row().text("\u{1F6E1} Himoyachi", `gm:${clubId}:0:DEF`).text("\u{1F9E0} Yarimhimoya", `gm:${clubId}:0:MID`).row().text("\u26A1 Hujumchi", `gm:${clubId}:0:ATT`);
    if (page > 0) keyboard.row().text("\u2190 Oldingi", `gm:${clubId}:${page - 1}:${group}`);
    if (items.length === 8) keyboard.text("Keyingi \u2192", `gm:${clubId}:${page + 1}:${group}`);
    keyboard.row().text("\u2190 Transfer markazi", `tr:${clubId}`);
    await editOrReply(context, `\u{1F30D} BOZOR \xB7 ${group === "ALL" ? "ENG KUCHLILAR" : group === "GK" ? "DARVOZABONLAR" : group === "DEF" ? "HIMOYACHILAR" : group === "MID" ? "YARIMHIMOYACHILAR" : "HUJUMCHILAR"}

${formatMarket(items).split("\n\n")[1] ?? "Hozir faol listing yo\u2018q."}`, keyboard);
  };
  bot.callbackQuery(/^tr:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from), clubId = context.match[1];
    if (!(await leagues.listManagedClubs(user.id)).some((club) => club.leagueClubId === clubId)) return;
    await editOrReply(context, "\u{1F504} TRANSFER MARKAZI\n\nBu bo\u2018lim faqat tanlangan klubingiz uchun ishlaydi. Xarid, sotuv va takliflar shu klub budjetiga bog\u2018langan.", new InlineKeyboard().text("\u{1F30D} Bozor", `gm:${clubId}:0`).text("\u{1F50E} Ligadan izlash", `tf:${clubId}:0`).row().text("\u{1F4E4} Sotuvga qo\u2018yish", `ts:${clubId}`).text("\u{1F4E9} Kelgan takliflar", `io:${clubId}`).row().text("\u2190 Klub", `db:${clubId}`));
  });
  bot.callbackQuery(/^ts:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from), clubId = context.match[1], players = await transfers.saleCandidates(user.id, clubId), kb = new InlineKeyboard(), browse = { clubId, players: /* @__PURE__ */ new Map() };
    for (const [index, player] of players.slice(0, 20).entries()) {
      browse.players.set(String(index), player);
      kb.text(`${player.name} \xB7 ${player.position} \xB7 \u2B50${player.overall}`, `tl:${index}`).row();
    }
    saleBrowses.set(context.from.id, browse);
    kb.text("\u2190 Transfer markazi", `tr:${clubId}`);
    await editOrReply(context, players.length ? "\u{1F4E4} FUTBOLCHINI SOTUVGA QO\u2018YISH\n\nNarxini belgilash uchun futbolchini tanlang:" : "Sotuvga qo\u2018yish mumkin bo\u2018lgan futbolchi yo\u2018q.", kb);
  });
  bot.callbackQuery(/^tl:(\d+)$/, async (context) => {
    if (!context.from) return;
    const browse = saleBrowses.get(context.from.id), player = browse?.players.get(context.match[1]);
    if (!browse || !player) return context.answerCallbackQuery({ text: "Ro\u2018yxat eskirgan, qayta oching" });
    transferInputs.set(context.from.id, { mode: "SELL", clubId: browse.clubId, clubPlayerId: player.clubPlayerId, playerName: player.name, minimum: Math.max(1e5, Math.round(player.marketValue * 0.5)) });
    await context.answerCallbackQuery();
    await editOrReply(context, `\u{1F4B0} ${player.name} uchun sotuv narxini yuboring.

Minimal narx: ${transferMoney(Math.max(1e5, Math.round(player.marketValue * 0.5)))}
Misol: 45M yoki 45000000`, new InlineKeyboard().text("\u2190 Bekor qilish", `ts:${browse.clubId}`));
  });
  bot.callbackQuery(/^tf:([0-9a-f-]{36}):(\d+)$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from), clubId = context.match[1], page = Number(context.match[2]), clubs = await transfers.leagueClubs(user.id, clubId), kb = new InlineKeyboard(), browse = { clubId, clubs: /* @__PURE__ */ new Map() };
    for (const [index, club] of clubs.slice(page * 10, (page + 1) * 10).entries()) {
      browse.clubs.set(String(index), club.leagueClubId);
      kb.text(`\u{1F3DF} ${club.clubName}`, `tk:${index}:0`).row();
    }
    targetClubBrowses.set(context.from.id, browse);
    if (page) kb.text("\u2190 Oldingi", `tf:${clubId}:${page - 1}`);
    if ((page + 1) * 10 < clubs.length) kb.text("Keyingi \u2192", `tf:${clubId}:${page + 1}`);
    kb.row().text("\u2190 Transfer markazi", `tr:${clubId}`);
    await editOrReply(context, clubs.length ? "\u{1F50E} LIGADAN IZLASH\n\nAvval raqib klubni tanlang, keyin uning barcha futbolchilaridan biriga taklif yuboring:" : "Bu ligada raqib klublar topilmadi.", kb);
  });
  bot.callbackQuery(/^tk:(\d+):(\d+)$/, async (context) => {
    if (!context.from) return;
    const clubs = targetClubBrowses.get(context.from.id), targetClubId = clubs?.clubs.get(context.match[1]);
    if (!clubs || !targetClubId) return context.answerCallbackQuery({ text: "Klublar ro\u2018yxati eskirgan, qayta oching" });
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from), page = Number(context.match[2]), players = await transfers.clubTargets(user.id, clubs.clubId, targetClubId, page), kb = new InlineKeyboard(), browse = { clubId: clubs.clubId, players: /* @__PURE__ */ new Map() };
    for (const [index, player] of players.entries()) {
      browse.players.set(String(index), player);
      kb.text(`${player.name} \xB7 ${player.position} \xB7 \u2B50${player.overall}`, `to:${index}`).row();
    }
    targetBrowses.set(context.from.id, browse);
    if (page) kb.text("\u2190 Oldingi", `tk:${context.match[1]}:${page - 1}`);
    if (players.length === 25) kb.text("Keyingi \u2192", `tk:${context.match[1]}:${page + 1}`);
    kb.row().text("\u2190 Klublar", `tf:${clubs.clubId}:0`).text("\u2190 Transfer markazi", `tr:${clubs.clubId}`);
    await editOrReply(context, players.length ? `\u{1F3DF} ${players[0].clubName.toUpperCase()} FUTBOLCHILARI

Taklif yuborish uchun futbolchini tanlang:` : "Bu klubda transferga taklif yuborish mumkin bo\u2018lgan futbolchi yo\u2018q.", kb);
  });
  bot.callbackQuery(/^to:(\d+)$/, async (context) => {
    if (!context.from) return;
    const browse = targetBrowses.get(context.from.id), target = browse?.players.get(context.match[1]);
    if (!browse || !target) return context.answerCallbackQuery({ text: "Ro\u2018yxat eskirgan, qayta oching" });
    transferInputs.set(context.from.id, { mode: "OFFER", clubId: browse.clubId, clubPlayerId: target.clubPlayerId, playerName: target.name, minimum: Math.max(1e5, Math.round(target.marketValue * 0.5)) });
    await context.answerCallbackQuery();
    await editOrReply(context, `\u{1F91D} ${target.name} uchun taklif miqdorini yuboring.

Bozor qiymati: ${transferMoney(target.marketValue)}
Minimal taklif: ${transferMoney(Math.max(1e5, Math.round(target.marketValue * 0.5)))}
Misol: 55M yoki 55000000`, new InlineKeyboard().text("\u2190 Futbolchilar", `tf:${browse.clubId}:0`));
  });
  bot.callbackQuery(/^io:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from), clubId = context.match[1], offers = await transfers.incomingOffers(user.id, clubId), kb = new InlineKeyboard();
    incomingOfferClubs.set(context.from.id, clubId);
    for (const offer of offers) kb.text(`${offer.playerName} \xB7 ${offer.buyerClub} \xB7 ${transferMoney(offer.amount)}`, `iv:${offer.offerId}`).row();
    kb.text("\u2190 Transfer markazi", `tr:${clubId}`);
    await editOrReply(context, offers.length ? "\u{1F4E9} KELGAN TAKLIFLAR\n\nTaklifni ochib qabul qiling yoki rad eting:" : "\u{1F4E9} Hozircha sizning klubingizga kelgan faol taklif yo\u2018q.", kb);
  });
  bot.callbackQuery(/^iv:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    const clubId = incomingOfferClubs.get(context.from.id);
    if (!clubId) return context.answerCallbackQuery({ text: "Transfer markazini qayta oching" });
    const user = await users.upsertFromTelegram(context.from), offer = (await transfers.incomingOffers(user.id, clubId)).find((item) => item.offerId === context.match[1]);
    if (!offer) return context.answerCallbackQuery({ text: "Taklif endi faol emas" });
    await context.answerCallbackQuery();
    await editOrReply(context, `\u{1F4E9} TAKLIF

\u26BD ${offer.playerName} \xB7 ${offer.position} \xB7 \u2B50${offer.overall}
\u{1F3DF} Xaridor: ${offer.buyerClub}
\u{1F4B0} Taklif: ${transferMoney(offer.amount)}
\u23F3 Amal qiladi: ${new Date(offer.expiresAt).toLocaleString("uz-UZ")}`, new InlineKeyboard().text("\u2705 Qabul qilish", `ia:${offer.offerId}`).text("\u274C Rad etish", `ir:${offer.offerId}`).row().text("\u{1F4AC} Qarshi taklif", `ic:${offer.offerId}`).row().text("\u2190 Takliflar", `io:${clubId}`));
  });
  bot.callbackQuery(/^ic:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    const user = await users.upsertFromTelegram(context.from), offer = await transfers.notification(context.match[1]);
    if (!offer || offer.sellerTelegramId !== context.from.id) return context.answerCallbackQuery({ text: "Taklif endi faol emas" });
    transferInputs.set(context.from.id, { mode: "COUNTER", clubId: "", offerId: offer.offerId, playerName: offer.playerName, minimum: offer.amount + 1e5 });
    await context.answerCallbackQuery();
    await editOrReply(context, `\u{1F4AC} ${offer.playerName} uchun qarshi taklif summasini yuboring.

Asl taklif: ${transferMoney(offer.amount)}
Minimal: ${transferMoney(offer.amount + 1e5)}`, new InlineKeyboard().text("\u2190 Taklif", `iv:${offer.offerId}`));
  });
  bot.callbackQuery(/^ac:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    const user = await users.upsertFromTelegram(context.from), offer = await transfers.notification(context.match[1]);
    if (!offer || offer.buyerTelegramId !== context.from.id) return context.answerCallbackQuery({ text: "Taklif endi faol emas" });
    await context.answerCallbackQuery({ text: "Transfer yakunlanmoqda\u2026" });
    try {
      await transfers.acceptCounterOffer(user.id, offer.offerId);
      await sendUpdate(offer.sellerTelegramId, `\u2705 ${offer.playerName} bo\u2018yicha qarshi taklif qabul qilindi. Transfer yakunlandi.`, new InlineKeyboard());
      await editOrReply(context, `\u2705 ${offer.playerName} transferi yakunlandi.`, new InlineKeyboard());
    } catch {
      await context.reply("Qarshi taklif endi faol emas yoki budjet yetarli emas.");
    }
  });
  bot.callbackQuery(/^(ia|ir):([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    const user = await users.upsertFromTelegram(context.from), offer = await transfers.notification(context.match[2]);
    if (!offer || offer.sellerTelegramId !== context.from.id) return context.answerCallbackQuery({ text: "Taklif endi faol emas" });
    await context.answerCallbackQuery({ text: "Taklif qayta ishlanmoqda\u2026" });
    try {
      const accepted = context.match[1] === "ia", result = await transfers.respondToOffer(user.id, offer.offerId, accepted ? "ACCEPT" : "REJECT");
      await sendUpdate(offer.buyerTelegramId, accepted ? `\u2705 ${offer.playerName} uchun ${transferMoney(offer.amount)} taklifingiz qabul qilindi. Transfer yakunlandi.` : `\u274C ${offer.playerName} uchun taklifingiz rad etildi.`, new InlineKeyboard());
      await editOrReply(context, result === "ACCEPTED" ? "\u2705 Transfer qabul qilindi. Futbolchi xaridor klubiga o\u2018tdi." : "\u274C Taklif rad etildi.", new InlineKeyboard().text("\u2190 Transfer markazi", `tr:${offer.sellerClubId}`));
    } catch (error) {
      logger.warn({ event: "incoming_offer_response_failed", err: error }, "Incoming offer response failed");
      await context.reply("Taklifni qayta ishlab bo\u2018lmadi. U muddatidan o\u2018tgan bo\u2018lishi mumkin.");
    }
  });
  bot.callbackQuery(/^gm:([0-9a-f-]{36}):(\d+)(?::(ALL|GK|DEF|MID|ATT))?$/, async (context) => {
    await context.answerCallbackQuery();
    await showMarket(context, context.match[1], Number(context.match[2]), context.match[3] ?? "ALL");
  });
  bot.callbackQuery(/^gb:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const clubId = transferClubSelection.get(context.from.id);
    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    const user = await users.upsertFromTelegram(context.from), item = await transfers.listing(user.id, clubId, context.match[1]);
    if (!item) return editOrReply(context, "Bu futbolchi sizning ligangiz bozorida faol emas.", new InlineKeyboard().text("\u2190 Bozor", `gm:${clubId}:0`));
    await editOrReply(context, formatListing(item), new InlineKeyboard().text("Xaridni tasdiqlash", `gc:${item.listingId}`).row().text("\u2190 Bozor", `gm:${clubId}:0`));
  });
  bot.callbackQuery(/^gc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Transfer tekshirilmoqda\u2026" });
    const user = await users.upsertFromTelegram(context.from), clubId = transferClubSelection.get(context.from.id);
    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    try {
      const result = await transfers.buy(user.id, clubId, context.match[1]);
      const msg = result.status === "ACCEPTED" ? "\u2705 TRANSFER YAKUNLANDI\n\nFutbolchi klubingizga qo\u2018shildi." : result.status === "COUNTERED" ? `\u{1F91D} AI qarshi taklifi: ${transferMoney(result.counterAmount)}` : "\u274C Taklif rad etildi.";
      await editOrReply(context, msg, new InlineKeyboard().text("\u2190 Bozor", `gm:${clubId}:0`).text("\u{1F3DF} Klub", `db:${clubId}`));
    } catch (error) {
      logger.warn({ event: "transfer_failed", err: error }, "Transfer failed");
      await context.reply("Transfer amalga oshmadi: budjet, tarkib limiti yoki listing holatini tekshiring.");
    }
  });
  bot.on("message:text", async (context, next) => {
    if (!context.from) return next();
    const pending = transferInputs.get(context.from.id);
    if (!pending) return next();
    const raw = context.message.text.trim().replace(/\s/g, "").replace(",", ".");
    const isMillions = raw.toLowerCase().endsWith("m"), amount = Number(isMillions ? raw.slice(0, -1) : raw) * (isMillions ? 1e6 : 1);
    if (!Number.isFinite(amount) || amount < pending.minimum) {
      await context.reply(`Miqdor noto\u2018g\u2018ri. Kamida ${transferMoney(pending.minimum)} yuboring.`);
      return;
    }
    const user = await users.upsertFromTelegram(context.from);
    try {
      if (pending.mode === "SELL") {
        await transfers.listForSale(user.id, pending.clubId, pending.clubPlayerId, Math.round(amount));
        await context.reply(`\u2705 ${pending.playerName} ${transferMoney(Math.round(amount))} narxda transfer bozoriga qo\u2018yildi.`, { reply_markup: new InlineKeyboard().text("\u2190 Transfer markazi", `tr:${pending.clubId}`) });
      } else if (pending.mode === "COUNTER") {
        await transfers.counterOffer(user.id, pending.offerId, Math.round(amount));
        const offer = await transfers.notification(pending.offerId);
        await sendUpdate(offer?.buyerTelegramId ?? null, `\u{1F4AC} ${offer?.sellerClub ?? "Murabbiy"} ${pending.playerName} uchun qarshi taklif yubordi: ${transferMoney(Math.round(amount))}`, new InlineKeyboard().text("\u2705 Qarshi taklifni qabul qilish", `ac:${pending.offerId}`));
        await context.reply("\u2705 Qarshi taklif xaridor murabbiyiga yuborildi.");
      } else {
        const result = await transfers.offer(user.id, pending.clubId, pending.clubPlayerId, Math.round(amount));
        const offer = await transfers.notification(result.offerId);
        if (result.status === "PENDING") await sendUpdate(offer?.sellerTelegramId ?? null, `\u{1F4E9} YANGI TRANSFER TAKLIFI

\u26BD ${pending.playerName}
\u{1F3DF} Xaridor: ${offer?.buyerClub ?? "Klub"}
\u{1F4B0} Taklif: ${transferMoney(Math.round(amount))}`, new InlineKeyboard().text("\u2705 Qabul qilish", `ia:${result.offerId}`).text("\u274C Rad etish", `ir:${result.offerId}`).row().text("\u{1F4AC} Qarshi taklif", `ic:${result.offerId}`));
        const text = result.status === "ACCEPTED" ? `\u2705 ${pending.playerName} transferi yakunlandi!` : result.status === "COUNTERED" ? `\u{1F91D} Qarshi taklif: ${transferMoney(result.counterAmount)}` : result.status === "PENDING" ? "\u23F3 Taklif klub murabbiyiga yuborildi." : "\u274C Taklif rad etildi.";
        await context.reply(text, { reply_markup: new InlineKeyboard().text("\u2190 Transfer markazi", `tr:${pending.clubId}`) });
      }
      transferInputs.delete(context.from.id);
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
    const user = await users.upsertFromTelegram(context.from);
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
    const user = await users.upsertFromTelegram(context.from);
    try {
      const result = await leagues.claimPrivateClub(user.id, context.match[2], context.match[1]);
      const club = (await leagues.listManagedClubs(user.id)).find((item) => item.leagueClubId === result.leagueClubId);
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
      await editOrReply(context, "Hozir bo\u2018sh public liga yo\u2018q. Keyinroq qayta urinib ko\u2018ring.", new InlineKeyboard().text("\u2190 Orqaga", "join"));
      return;
    }
    const keyboard = new InlineKeyboard();
    for (const league of leagueList) keyboard.text(`${league.name} \xB7 ${league.availableClubs} klub`, `lg:${league.id}:0`).row();
    keyboard.text("\u2190 Orqaga", "join");
    await editOrReply(context, "\u{1F3DF} OCHIQ LIGALAR\n\nKlub olish uchun ligani tanlang:", keyboard);
  });
  bot.callbackQuery(/^lg:([0-9a-f-]{36}):(\d+)$/, async (context) => {
    await context.answerCallbackQuery();
    const leagueId = context.match[1];
    const requestedPage = Number(context.match[2]);
    const clubs = await leagues.listAvailableClubs(leagueId);
    if (clubs.length === 0) {
      await editOrReply(context, "Bu ligadagi barcha klublar band bo\u2018ldi.", new InlineKeyboard().text("\u2190 Competitionlar", "join"));
      return;
    }
    const lastPage = Math.max(0, Math.ceil(clubs.length / PAGE_SIZE) - 1);
    const page = Math.min(requestedPage, lastPage);
    await editOrReply(context, `Klub tanlang (${clubs.length} ta mavjud):`, clubListKeyboard(clubs, leagueId, page));
  });
  bot.callbackQuery(/^cf:([0-9a-f-]{36})$/, async (context) => {
    await context.answerCallbackQuery();
    const leagueClubId = context.match[1];
    const club = await leagues.getAvailableClub(leagueClubId);
    if (!club) {
      await editOrReply(context, "Bu klub endi mavjud emas. Ro\u2018yxatdan boshqa klub tanlang.", new InlineKeyboard().text("\u2190 Competitionlar", "join"));
      return;
    }
    const keyboard = new InlineKeyboard().text("Tasdiqlash", `cl:${club.leagueClubId}`).row().text("\u2190 Orqaga", "join");
    await editOrReply(context, `${club.clubName} klubini boshqarishni tasdiqlaysizmi?

Klubning mavjud holati saqlanadi.`, keyboard);
  });
  bot.callbackQuery(/^cl:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Klub tekshirilmoqda\u2026" });
    const user = await users.upsertFromTelegram(context.from);
    try {
      const result = await leagues.claimClub(user.id, context.match[1]);
      logger.info({ event: "club_claimed", userId: user.id, leagueClubId: result.leagueClubId }, "Club claimed");
      const club = (await leagues.listManagedClubs(user.id)).find((item) => item.leagueClubId === result.leagueClubId);
      if (!club) throw new Error("CLAIMED_CLUB_NOT_FOUND");
      await showDashboard(context, club);
    } catch (error) {
      logger.warn({ event: "club_claim_failed", err: error, userId: user.id }, "Club claim failed");
      await editOrReply(context, claimErrorMessage(error), new InlineKeyboard().text("\u2190 Boshqa klub", "join"));
    }
  });
  bot.callbackQuery(/^db:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from);
    const club = (await leagues.listManagedClubs(user.id)).find((item) => item.leagueClubId === context.match[1]);
    if (!club) {
      await context.reply("Bu klub sizga tegishli emas.");
      return;
    }
    await showDashboard(context, club);
  });
  bot.callbackQuery(/^sq:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from);
    const leagueClubId = context.match[1];
    const club = (await leagues.listManagedClubs(user.id)).find((item) => item.leagueClubId === leagueClubId);
    if (!club) {
      await context.reply("Bu klub sizga tegishli emas.");
      return;
    }
    const players = await squads.listOwnedClubSquad(user.id, leagueClubId);
    await editOrReply(
      context,
      formatSquad(club.clubName, players),
      new InlineKeyboard().text("Starting XI", `xi:${leagueClubId}`).text("\u2190 Klub", `db:${leagueClubId}`)
    );
  });
  bot.callbackQuery(/^mt:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from);
    const leagueClubId = context.match[1];
    const upcoming = await fixtures.listUpcoming(user.id, leagueClubId);
    await editOrReply(context, formatUpcomingFixtures(upcoming), new InlineKeyboard().text("Natijalar", `rs:${leagueClubId}`).text("Liga jadvali", `tb:${leagueClubId}`).row().text("\u2190 Klub", `db:${leagueClubId}`));
  });
  bot.callbackQuery(/^rs:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from);
    const club = context.match[1];
    await editOrReply(context, formatResults(await matches.history(user.id, club)), new InlineKeyboard().text("Keyingi matchlar", `mt:${club}`).text("\u2190 Klub", `db:${club}`));
  });
  bot.callbackQuery(/^tb:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from);
    const club = context.match[1];
    await editOrReply(context, formatTable(await matches.table(user.id, club)), new InlineKeyboard().text("\u2190 Klub", `db:${club}`));
  });
  bot.callbackQuery(/^sc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from), club = context.match[1];
    await editOrReply(context, formatLeaders("\u{1F945} LIGA TO\u2018PURARLARI", await matches.leaders(user.id, club, "goals"), "gol"), new InlineKeyboard().text("\u{1F3AF} Assistentlar", `asst:${club}`).row().text("\u2190 Klub", `db:${club}`));
  });
  bot.callbackQuery(/^asst:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from), club = context.match[1];
    await editOrReply(context, formatLeaders("\u{1F3AF} LIGA ASSISTENTLARI", await matches.leaders(user.id, club, "assists"), "assist"), new InlineKeyboard().text("\u{1F945} To\u2018purarlar", `sc:${club}`).row().text("\u2190 Klub", `db:${club}`));
  });
  bot.callbackQuery(/^fn:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from);
    const club = context.match[1];
    await editOrReply(context, formatFinances(await matches.finances(user.id, club)), new InlineKeyboard().text("Homiylar", `sp:${club}`).row().text("\u2190 Klub", `db:${club}`));
  });
  bot.callbackQuery(/^sp:([0-9a-f-]{36})$/, async (context) => {
    await context.answerCallbackQuery();
    const club = context.match[1], rows = await progression.sponsors();
    const keyboard = new InlineKeyboard();
    for (const s of rows) keyboard.text(`${s.name} \xB7 ${transferMoney(s.payment)}`, `sa:${s.id}`).row();
    keyboard.text("\u2190 Moliya", `fn:${club}`);
    await editOrReply(context, formatSponsors(rows), keyboard);
  });
  bot.callbackQuery(/^sa:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from), club = (await leagues.listManagedClubs(user.id))[0]?.leagueClubId, sponsor = context.match[1];
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
      await context.reply(eligible ? "Homiy faol. Kanal a\u2019zoligi tasdiqlandi." : "Homiy tanlandi, ammo kanal a\u2019zoligi tasdiqlanmadi.");
    } else await context.reply("Homiy shartnomasi faol qilindi.");
  });
  const tacticKeyboard = (clubId, tactic) => new InlineKeyboard().text("\u{1F4D0} Sxema", `fm:${clubId}`).text("\u2696\uFE0F O\u2018yin uslubi", `cy:${clubId}:mentality`).row().text(`\u{1F525} Pressing ${tactic.pressing} \u2212`, `nu:${clubId}:pressing:-`).text(`\u{1F525} ${tactic.pressing} +`, `nu:${clubId}:pressing:+`).row().text(`\u26A1 Sur\u2019at ${tactic.tempo} \u2212`, `nu:${clubId}:tempo:-`).text(`\u26A1 ${tactic.tempo} +`, `nu:${clubId}:tempo:+`).row().text(`\u{1F6E1} Himoya ${tactic.defensiveLine} \u2212`, `nu:${clubId}:defensiveLine:-`).text(`\u{1F6E1} ${tactic.defensiveLine} +`, `nu:${clubId}:defensiveLine:+`).row().text(`\u2194\uFE0F Kenglik ${tactic.width} \u2212`, `nu:${clubId}:width:-`).text(`\u2194\uFE0F ${tactic.width} +`, `nu:${clubId}:width:+`).row().text("\u{1F3AF} Pas uslubi", `cy:${clubId}:passingStyle`).row().text("\u{1F680} Hujum yo\u2018nalishi", `cy:${clubId}:attackFocus`).row().text("\u{1F9B5} To\u2018p uchun kurash", `cy:${clubId}:tackling`).row().text("\u{1F465} Boshlang\u2018ich 11", `xi:${clubId}`).text("\u2190 Klub", `db:${clubId}`);
  const showTactics = async (context, userId, clubId) => {
    const tactic = await tactics.get(userId, clubId);
    await editOrReply(context, formatTactics(tactic), tacticKeyboard(clubId, tactic));
  };
  bot.callbackQuery(/^tc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from);
    await showTactics(context, user.id, context.match[1]);
  });
  bot.callbackQuery(/^fm:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from);
    await tactics.get(user.id, context.match[1]);
    const keyboard = new InlineKeyboard();
    for (const formation of await tactics.listFormations()) keyboard.text(`\u{1F4D0} ${formation.name}`, `fs:${context.match[1]}:${formation.code}`).row();
    keyboard.text("\u2190 Taktika", `tc:${context.match[1]}`);
    await editOrReply(context, "\u{1F4D0} SXEMANI TANLANG\n\nMasalan, 4-3-3: 4 himoyachi, 3 yarim himoyachi va 3 hujumchi.", keyboard);
  });
  bot.callbackQuery(/^fs:([0-9a-f-]{36}):(\d+)$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Boshlang\u2018ich tarkib moslanmoqda\u2026" });
    const user = await users.upsertFromTelegram(context.from);
    await tactics.autoSave(user.id, context.match[1], context.match[2]);
    await showTactics(context, user.id, context.match[1]);
  });
  bot.callbackQuery(/^xi:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from);
    const lineup = await tactics.lineup(user.id, context.match[1]);
    await editOrReply(context, formatLineup(lineup.formation, lineup.players), new InlineKeyboard().text("\u270F\uFE0F 11 talikni tanlash", `xe:${context.match[1]}`).row().text("\u{1F916} Avtomatik tanlash", `xa:${context.match[1]}`).row().text("\u2190 Taktika", `tc:${context.match[1]}`).text("\u2190 Klub", `db:${context.match[1]}`));
  });
  const showLineupDraft = async (context, draft) => {
    const slot = draft.slots[draft.picks.length], selected = draft.picks.map((pick, index) => {
      const player = draft.players.find((p) => p.clubPlayerId === pick.clubPlayerId);
      return `${index + 1}. ${draft.slots[index].key} \u2014 ${player.shortName}`;
    });
    const text = ["\u270F\uFE0F BOSHLANG\u2018ICH 11 TALIK", `\u{1F4D0} Sxema: ${draft.formationName}`, `\u2705 Tanlandi: ${draft.picks.length}/11`, "", ...selected, "", slot ? `Navbat: ${slot.key} \u2014 ${positionName(slot.position)}
Futbolchini tanlang:` : "Tarkib tayyor. Endi saqlang \u{1F447}"].join("\n");
    const kb = new InlineKeyboard();
    if (slot) {
      const used = new Set(draft.picks.map((p) => p.clubPlayerId));
      const candidates = draft.players.filter((p) => !used.has(p.clubPlayerId)).sort((a, b) => Number(b.primaryPosition === slot.position) - Number(a.primaryPosition === slot.position) || b.overall - a.overall);
      for (const player of candidates) kb.text(`${player.primaryPosition === slot.position ? "\u2705" : "\u25AB\uFE0F"} ${player.shortName} \xB7 ${player.primaryPosition} \xB7 \u2B50${player.overall}`, `xp:${player.clubPlayerId}`).row();
    } else kb.text("\u{1F4BE} Tarkibni saqlash", "xs").row();
    if (draft.picks.length) kb.text("\u21A9\uFE0F Oxirgi tanlovni bekor qilish", "xb").row();
    kb.text("\u274C Bekor qilish", "xc");
    await editOrReply(context, text, kb);
  };
  bot.callbackQuery(/^xe:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from), clubId = context.match[1], tactic = await tactics.get(user.id, clubId), formation = (await tactics.listFormations()).find((f) => f.code === tactic.formationCode);
    if (!formation) return;
    const draft = { clubId, formationCode: formation.code, formationName: formation.name, slots: formation.slots, players: await squads.listOwnedClubSquad(user.id, clubId), picks: [] };
    lineupDrafts.set(context.from.id, draft);
    await showLineupDraft(context, draft);
  });
  bot.callbackQuery(/^xp:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    const draft = lineupDrafts.get(context.from.id);
    if (!draft) return context.answerCallbackQuery({ text: "Tanlash muddati tugadi. Qayta boshlang." });
    if (draft.picks.some((p) => p.clubPlayerId === context.match[1])) return context.answerCallbackQuery({ text: "Bu futbolchi allaqachon tanlangan" });
    const slot = draft.slots[draft.picks.length];
    if (!slot) return;
    draft.picks.push({ slotKey: slot.key, clubPlayerId: context.match[1] });
    await context.answerCallbackQuery({ text: `${draft.picks.length}/11 tanlandi` });
    await showLineupDraft(context, draft);
  });
  bot.callbackQuery("xb", async (context) => {
    if (!context.from) return;
    const draft = lineupDrafts.get(context.from.id);
    if (!draft) return context.answerCallbackQuery();
    draft.picks.pop();
    await context.answerCallbackQuery();
    await showLineupDraft(context, draft);
  });
  bot.callbackQuery("xc", async (context) => {
    if (!context.from) return;
    const draft = lineupDrafts.get(context.from.id);
    lineupDrafts.delete(context.from.id);
    await context.answerCallbackQuery({ text: "Tanlash bekor qilindi" });
    if (draft) {
      const user = await users.upsertFromTelegram(context.from);
      await showTactics(context, user.id, draft.clubId);
    }
  });
  bot.callbackQuery("xs", async (context) => {
    if (!context.from) return;
    const draft = lineupDrafts.get(context.from.id);
    if (!draft || draft.picks.length !== 11) return context.answerCallbackQuery({ text: "Avval 11 futbolchini tanlang" });
    await context.answerCallbackQuery({ text: "Tarkib saqlanmoqda\u2026" });
    const user = await users.upsertFromTelegram(context.from);
    await tactics.saveManual(user.id, draft.clubId, draft.formationCode, draft.picks);
    lineupDrafts.delete(context.from.id);
    const lineup = await tactics.lineup(user.id, draft.clubId);
    await editOrReply(context, `${formatLineup(lineup.formation, lineup.players)}

\u2705 Boshlang\u2018ich tarkib saqlandi!`, new InlineKeyboard().text("\u2190 Taktika", `tc:${draft.clubId}`).text("\u2190 Klub", `db:${draft.clubId}`));
  });
  bot.callbackQuery(/^xa:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Eng mos futbolchilar tanlanmoqda\u2026" });
    const user = await users.upsertFromTelegram(context.from), clubId = context.match[1], tactic = await tactics.get(user.id, clubId);
    await tactics.autoSave(user.id, clubId, tactic.formationCode);
    const lineup = await tactics.lineup(user.id, clubId);
    await editOrReply(context, `${formatLineup(lineup.formation, lineup.players)}

\u2705 Avtomatik tarkib saqlandi!`, new InlineKeyboard().text("\u270F\uFE0F Qo\u2018lda o\u2018zgartirish", `xe:${clubId}`).row().text("\u2190 Taktika", `tc:${clubId}`));
  });
  bot.callbackQuery(/^nu:([0-9a-f-]{36}):(pressing|tempo|defensiveLine|width):([+-])$/, async (context) => {
    if (!context.from) return;
    const user = await users.upsertFromTelegram(context.from);
    const club = context.match[1], field = context.match[2];
    const current = await tactics.get(user.id, club);
    const value = Math.max(0, Math.min(100, current[field] + (context.match[3] === "+" ? 10 : -10)));
    const updated = await tactics.update(user.id, club, { [field]: value });
    await context.answerCallbackQuery({ text: `\u2705 ${field === "tempo" ? "Sur\u2019at" : field === "defensiveLine" ? "Himoya chizig\u2018i" : field === "width" ? "Kenglik" : "Pressing"}: ${updated[field]}` });
    await showTactics(context, user.id, club);
  });
  bot.callbackQuery(/^cy:([0-9a-f-]{36}):(mentality|passingStyle|attackFocus|tackling)$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from);
    const club = context.match[1], field = context.match[2];
    const current = await tactics.get(user.id, club);
    const options = { mentality: ["VERY_DEFENSIVE", "DEFENSIVE", "BALANCED", "ATTACKING", "VERY_ATTACKING"], passingStyle: ["SHORT", "MIXED", "DIRECT"], attackFocus: ["LEFT", "CENTRE", "RIGHT", "BOTH_WINGS", "MIXED"], tackling: ["CAUTIOUS", "NORMAL", "AGGRESSIVE"] }[field];
    const next = options[(options.indexOf(current[field]) + 1) % options.length];
    await tactics.update(user.id, club, { [field]: next });
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
var LeagueRepository = class {
  constructor(database) {
    this.database = database;
  }
  database;
  competitionsCache = null;
  async listCompetitions(forceRefresh = false) {
    if (!forceRefresh && this.competitionsCache && Date.now() < this.competitionsCache.expiresAt) {
      return this.competitionsCache.data;
    }
    const { data, error } = await this.database.from("competitions").select("id, code, name").eq("is_active", true).order("name");
    if (error) throw new Error(`Competitionlarni olishda xato: ${error.message}`);
    const list = data;
    this.competitionsCache = { data: list, expiresAt: Date.now() + 6e4 };
    return list;
  }
  async listJoinableLeagues(competitionId) {
    const { data, error } = await this.database.from("league_instances").select("id, instance_number, competitions!inner(name), league_clubs(manager_type)").eq("competition_id", competitionId).eq("status", "ACTIVE").eq("access_mode", "GLOBAL").or(`registration_closes_at.is.null,registration_closes_at.gt.${(/* @__PURE__ */ new Date()).toISOString()}`).order("instance_number");
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
  async listManagedClubs(userId) {
    const { data, error } = await this.database.from("league_clubs").select("id, points, cash_balance, clubs!inner(name, starting_budget), league_instances!inner(instance_number, competitions!inner(name))").eq("manager_user_id", userId).order("created_at");
    if (error) throw new Error(`Manager klublarini olishda xato: ${error.message}`);
    return (data ?? []).map((row) => {
      const club = one(row.clubs);
      const league = one(row.league_instances);
      const competition = one(league.competitions);
      return {
        leagueClubId: row.id,
        clubName: club.name,
        competitionName: competition.name,
        leagueName: `${competition.name} #${String(league.instance_number).padStart(4, "0")}`,
        position: 1,
        points: row.points,
        budget: Number(row.cash_balance ?? club.starting_budget)
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
var TacticsRepository = class {
  constructor(db, squads) {
    this.db = db;
    this.squads = squads;
  }
  db;
  squads;
  formationsCache = null;
  async listFormations(forceRefresh = false) {
    if (!forceRefresh && this.formationsCache) return this.formationsCache;
    const { data, error } = await this.db.from("formations").select("id,code,name,slots").order("name");
    if (error) throw error;
    this.formationsCache = data;
    return this.formationsCache;
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
      this.database.from("tactics").select("mentality,pressing,tempo").eq("league_club_id", clubId).single(),
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
    return { clubId, strength: ratings.reduce((sum, rating) => sum + rating, 0) / Math.max(1, ratings.length), mentality: tactic.mentality, pressing: tactic.pressing, tempo: tactic.tempo };
  }
  async due(limit = 20) {
    const { data, error } = await this.database.from("fixtures").select("id,home_club_id,away_club_id").eq("status", "SCHEDULED").lte("scheduled_at", (/* @__PURE__ */ new Date()).toISOString()).order("scheduled_at").limit(limit);
    if (error) throw error;
    return Promise.all((data ?? []).map(async (fixture) => ({ fixtureId: fixture.id, home: await this.team(fixture.home_club_id), away: await this.team(fixture.away_club_id) })));
  }
  async complete(fixtureId, simulation) {
    const { data, error } = await this.database.rpc("complete_match", { p_fixture_id: fixtureId, p_home_goals: simulation.homeGoals, p_away_goals: simulation.awayGoals, p_stats: simulation.stats, p_events: simulation.events, p_engine_version: "v1" });
    if (error) throw error;
    const matchId = data;
    await this.recordPlayerStats(matchId);
    return matchId;
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
    const { data: club, error: clubError } = await this.database.from("league_clubs").select("cash_balance,transfer_budget").eq("id", leagueClubId).eq("manager_user_id", userId).maybeSingle();
    if (clubError) throw clubError;
    if (!club) throw new Error("CLUB_NOT_OWNED");
    const { data, error } = await this.database.from("finance_transactions").select("kind,amount,description,created_at").eq("league_club_id", leagueClubId).order("created_at", { ascending: false }).limit(10);
    if (error) throw error;
    return { cashBalance: Number(club.cash_balance), transferBudget: Number(club.transfer_budget), transactions: (data ?? []).map((row) => ({ kind: row.kind, amount: Number(row.amount), description: row.description, createdAt: row.created_at })) };
  }
};

// src/transfers/transfer.repository.ts
var one5 = (value) => Array.isArray(value) ? value[0] : value;
var TransferRepository = class {
  constructor(database) {
    this.database = database;
  }
  database;
  async market(userId, buyerClubId, page = 0, pageSize = 8, group = "ALL") {
    const owner = await this.ownerLeague(userId, buyerClubId);
    const { data, error } = await this.database.from("global_market_listings").select("id,asking_price,available_until,seller_club_id,club_players!inner(league_club_id,players!inner(short_name,age,primary_position,player_attributes!inner(overall)),league_clubs!inner(league_instance_id))").eq("status", "ACTIVE").gt("available_until", (/* @__PURE__ */ new Date()).toISOString()).order("asking_price");
    if (error) throw error;
    const groups2 = { GK: ["GK"], DEF: ["CB", "LB", "RB", "LWB", "RWB"], MID: ["CDM", "CM", "CAM", "LM", "RM"], ATT: ["ST", "CF", "LW", "RW"] };
    return (data ?? []).filter((row) => {
      const player = one5(row.club_players), position = one5(player.players).primary_position;
      return row.seller_club_id !== buyerClubId && player.league_club_id !== buyerClubId && player.league_club_id === row.seller_club_id && one5(player.league_clubs).league_instance_id === owner.league_instance_id && (!groups2[group] || groups2[group].includes(position));
    }).map((row) => {
      const p = one5(one5(row.club_players).players);
      return { listingId: row.id, name: p.short_name, age: p.age, position: p.primary_position, overall: one5(p.player_attributes).overall, askingPrice: Number(row.asking_price), availableUntil: row.available_until };
    }).sort((a, b) => b.overall - a.overall || a.askingPrice - b.askingPrice).slice(page * pageSize, (page + 1) * pageSize);
  }
  async listing(userId, buyerClubId, id) {
    for (const group of ["ALL", "GK", "DEF", "MID", "ATT"]) {
      const item = (await this.market(userId, buyerClubId, 0, 500, group)).find((player) => player.listingId === id);
      if (item) return item;
    }
    return null;
  }
  async buy(userId, buyerClubId, listingId) {
    const listing = await this.listing(userId, buyerClubId, listingId);
    if (!listing) throw new Error("LISTING_NOT_AVAILABLE");
    const { data: l, error: le } = await this.database.from("global_market_listings").select("asking_price,club_player_id").eq("id", listingId).eq("status", "ACTIVE").gt("available_until", (/* @__PURE__ */ new Date()).toISOString()).single();
    if (le) throw le;
    const { data, error } = await this.database.rpc("create_transfer_offer", { p_user_id: userId, p_buyer_club_id: buyerClubId, p_club_player_id: l.club_player_id, p_amount: l.asking_price });
    if (error) throw error;
    const r = data?.[0];
    return { offerId: r.offer_id, status: r.status, counterAmount: r.counter_amount ? Number(r.counter_amount) : null };
  }
  async saleCandidates(userId, clubId) {
    const { data, error } = await this.database.from("club_players").select("id,resale_locked_until,players!inner(short_name,primary_position,market_value,player_attributes!inner(overall)),league_clubs!inner(manager_user_id,clubs!inner(name))").eq("league_club_id", clubId).eq("league_clubs.manager_user_id", userId);
    if (error) throw error;
    return (data ?? []).filter((row) => !row.resale_locked_until || new Date(row.resale_locked_until) <= /* @__PURE__ */ new Date()).map((row) => {
      const player = one5(row.players), club = one5(one5(row.league_clubs).clubs);
      return { clubPlayerId: row.id, name: player.short_name, clubName: club.name, position: player.primary_position, overall: one5(player.player_attributes).overall, marketValue: Number(player.market_value) };
    }).sort((a, b) => b.overall - a.overall);
  }
  async leagueClubs(userId, clubId) {
    const owner = await this.ownerLeague(userId, clubId);
    const { data, error } = await this.database.from("league_clubs").select("id,clubs!inner(name)").eq("league_instance_id", owner.league_instance_id).neq("id", clubId).order("clubs(name)");
    if (error) throw error;
    return (data ?? []).map((row) => ({ leagueClubId: row.id, clubName: one5(row.clubs).name }));
  }
  async clubTargets(userId, clubId, targetClubId, page = 0, pageSize = 25) {
    const owner = await this.ownerLeague(userId, clubId);
    if (targetClubId === clubId) throw new Error("OWN_CLUB");
    const { data: target, error: targetError } = await this.database.from("league_clubs").select("id,league_instance_id,clubs!inner(name)").eq("id", targetClubId).maybeSingle();
    if (targetError || !target || target.league_instance_id !== owner.league_instance_id) throw new Error("TARGET_CLUB_INVALID");
    const from = page * pageSize;
    const { data, error } = await this.database.from("club_players").select("id,resale_locked_until,players!inner(short_name,primary_position,market_value,player_attributes!inner(overall))").eq("league_club_id", targetClubId).range(from, from + pageSize - 1);
    if (error) throw error;
    const clubName = one5(target.clubs).name;
    return (data ?? []).filter((row) => !row.resale_locked_until || new Date(row.resale_locked_until) <= /* @__PURE__ */ new Date()).map((row) => {
      const player = one5(row.players);
      return { clubPlayerId: row.id, name: player.short_name, clubName, position: player.primary_position, overall: one5(player.player_attributes).overall, marketValue: Number(player.market_value) };
    }).sort((a, b) => b.overall - a.overall);
  }
  async leagueTargets(userId, clubId, page = 0, pageSize = 10) {
    const { data: owner, error: ownerError } = await this.database.from("league_clubs").select("league_instance_id").eq("id", clubId).eq("manager_user_id", userId).maybeSingle();
    if (ownerError || !owner) throw new Error("CLUB_NOT_OWNED");
    const from = page * pageSize;
    const { data, error } = await this.database.from("club_players").select("id,league_club_id,resale_locked_until,players!inner(short_name,primary_position,market_value,player_attributes!inner(overall)),league_clubs!inner(league_instance_id,clubs!inner(name))").eq("league_clubs.league_instance_id", owner.league_instance_id).neq("league_club_id", clubId).range(from, from + pageSize - 1);
    if (error) throw error;
    return (data ?? []).filter((row) => row.league_club_id !== clubId && (!row.resale_locked_until || new Date(row.resale_locked_until) <= /* @__PURE__ */ new Date())).map((row) => {
      const player = one5(row.players), club = one5(one5(row.league_clubs).clubs);
      return { clubPlayerId: row.id, name: player.short_name, clubName: club.name, position: player.primary_position, overall: one5(player.player_attributes).overall, marketValue: Number(player.market_value) };
    }).sort((a, b) => b.overall - a.overall);
  }
  async listForSale(userId, clubId, clubPlayerId, askingPrice) {
    const candidates = await this.saleCandidates(userId, clubId);
    if (!candidates.some((player) => player.clubPlayerId === clubPlayerId)) throw new Error("PLAYER_NOT_AVAILABLE");
    const { count, error: countError } = await this.database.from("club_players").select("id", { count: "exact", head: true }).eq("league_club_id", clubId);
    if (countError) throw countError;
    if ((count ?? 0) <= 18) throw new Error("SELLER_MIN_SQUAD");
    const { error } = await this.database.from("global_market_listings").insert({ club_player_id: clubPlayerId, seller_club_id: clubId, asking_price: askingPrice });
    if (error) throw error;
  }
  async offer(userId, buyerClubId, clubPlayerId, amount) {
    const { data, error } = await this.database.rpc("create_transfer_offer", { p_user_id: userId, p_buyer_club_id: buyerClubId, p_club_player_id: clubPlayerId, p_amount: amount });
    if (error) throw error;
    const result = data?.[0];
    return { offerId: result.offer_id, status: result.status, counterAmount: result.counter_amount ? Number(result.counter_amount) : null };
  }
  async incomingOffers(userId, clubId) {
    const { data: club, error: clubError } = await this.database.from("league_clubs").select("id").eq("id", clubId).eq("manager_user_id", userId).maybeSingle();
    if (clubError || !club) throw new Error("CLUB_NOT_OWNED");
    const { data, error } = await this.database.from("transfer_offers").select("id,buyer_club_id,club_player_id,amount,expires_at").eq("seller_club_id", clubId).eq("status", "PENDING").order("created_at", { ascending: false });
    if (error) throw error;
    const offers = data ?? [];
    if (!offers.length) return [];
    const playerIds = offers.map((row) => row.club_player_id), buyerIds = offers.map((row) => row.buyer_club_id);
    const [playersResult, buyersResult] = await Promise.all([this.database.from("club_players").select("id,players!inner(short_name,primary_position,player_attributes!inner(overall))").in("id", playerIds), this.database.from("league_clubs").select("id,clubs!inner(name)").in("id", buyerIds)]);
    if (playersResult.error) throw playersResult.error;
    if (buyersResult.error) throw buyersResult.error;
    const players = new Map((playersResult.data ?? []).map((row) => {
      const p = one5(row.players);
      return [row.id, p];
    })), buyers = new Map((buyersResult.data ?? []).map((row) => [row.id, one5(row.clubs).name]));
    return offers.map((row) => {
      const p = players.get(row.club_player_id);
      return { offerId: row.id, buyerClub: buyers.get(row.buyer_club_id) ?? "Noma\u2019lum klub", playerName: p?.short_name ?? "Futbolchi", position: p?.primary_position ?? "", overall: p ? one5(p.player_attributes).overall : 0, amount: Number(row.amount), expiresAt: row.expires_at };
    });
  }
  async respondToOffer(userId, offerId, decision) {
    const { data, error } = await this.database.rpc("respond_transfer_offer", { p_user_id: userId, p_offer_id: offerId, p_decision: decision, p_counter: null });
    if (error) throw error;
    return String(data);
  }
  async counterOffer(userId, offerId, amount) {
    const { data, error } = await this.database.rpc("respond_transfer_offer", { p_user_id: userId, p_offer_id: offerId, p_decision: "COUNTER", p_counter: amount });
    if (error) throw error;
    return String(data);
  }
  async acceptCounterOffer(userId, offerId) {
    const { error } = await this.database.rpc("accept_counter_offer", { p_user_id: userId, p_offer_id: offerId });
    if (error) throw error;
  }
  async notification(offerId) {
    const { data: offer, error } = await this.database.from("transfer_offers").select("id,buyer_club_id,seller_club_id,club_player_id,amount,counter_amount").eq("id", offerId).maybeSingle();
    if (error) throw error;
    if (!offer) return null;
    const [clubsResult, playerResult] = await Promise.all([this.database.from("league_clubs").select("id,manager_user_id,clubs!inner(name)").in("id", [offer.buyer_club_id, offer.seller_club_id]), this.database.from("club_players").select("players!inner(short_name)").eq("id", offer.club_player_id).maybeSingle()]);
    if (clubsResult.error) throw clubsResult.error;
    if (playerResult.error) throw playerResult.error;
    const clubs = new Map((clubsResult.data ?? []).map((row) => [row.id, { name: one5(row.clubs).name, userId: row.manager_user_id }]));
    const ids = [...new Set([...clubs.values()].map((c) => c.userId).filter(Boolean))];
    const { data: people, error: peopleError } = ids.length ? await this.database.from("users").select("id,telegram_id").in("id", ids) : { data: [], error: null };
    if (peopleError) throw peopleError;
    const telegram = new Map((people ?? []).map((row) => [row.id, row.telegram_id]));
    const buyer = clubs.get(offer.buyer_club_id), seller = clubs.get(offer.seller_club_id);
    return { offerId: offer.id, playerName: one5(playerResult.data?.players).short_name, amount: Number(offer.amount), counterAmount: offer.counter_amount ? Number(offer.counter_amount) : null, buyerClub: buyer?.name ?? "Klub", sellerClub: seller?.name ?? "Klub", buyerClubId: offer.buyer_club_id, sellerClubId: offer.seller_club_id, buyerTelegramId: buyer?.userId ? telegram.get(buyer.userId) ?? null : null, sellerTelegramId: seller?.userId ? telegram.get(seller.userId) ?? null : null };
  }
  async ownerLeague(userId, clubId) {
    const { data, error } = await this.database.from("league_clubs").select("league_instance_id").eq("id", clubId).eq("manager_user_id", userId).maybeSingle();
    if (error || !data) throw new Error("CLUB_NOT_OWNED");
    return data;
  }
  async maintain() {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.database.rpc("expire_transfer_offers");
    const { error } = await this.database.from("global_market_listings").update({ status: "EXPIRED" }).eq("status", "ACTIVE").lte("available_until", now);
    if (error) throw error;
    const { count } = await this.database.from("global_market_listings").select("id", { count: "exact", head: true }).eq("status", "ACTIVE");
    const needed = Math.max(0, 80 - (count ?? 0));
    if (!needed) return;
    const { data: expired, error: expiredError } = await this.database.from("global_market_listings").select("id").eq("status", "EXPIRED").limit(needed);
    if (expiredError) throw expiredError;
    if (expired?.length) {
      const until = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
      const { error: refreshError } = await this.database.from("global_market_listings").update({ status: "ACTIVE", available_until: until }).in("id", expired.map((row) => row.id));
      if (refreshError) throw refreshError;
    }
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
function categorizeDurations(stages) {
  let databaseRpcDurationMs = 0;
  let telegramApiDurationMs = 0;
  for (const [stage, duration] of Object.entries(stages)) {
    if (stage.startsWith("telegram_api")) {
      telegramApiDurationMs += duration;
    } else if (stage.startsWith("idempotency") || stage.includes("rpc") || stage.includes("user_") || stage.includes("manager_") || stage.includes("league_") || stage.includes("db") || stage.includes("query") || stage.includes("fixture") || stage.includes("squad") || stage.includes("tactics")) {
      databaseRpcDurationMs += duration;
    }
  }
  return {
    databaseRpcDurationMs: Number(databaseRpcDurationMs.toFixed(2)),
    telegramApiDurationMs: Number(telegramApiDurationMs.toFixed(2))
  };
}
async function handleTelegramWebhook(req, deps) {
  const profiler = new RequestProfiler();
  deps.bot.__currentProfiler = profiler;
  if (req.method === "GET") {
    return Response.json(
      {
        status: "ok",
        service: "telegram-webhook",
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
    const { databaseRpcDurationMs, telegramApiDurationMs } = categorizeDurations(metrics.stages);
    deps.logger.info(
      {
        event: "telegram_update_profiled",
        update_id: update.update_id,
        SB_REGION: sbRegion,
        total_duration_ms: metrics.totalDurationMs,
        database_rpc_duration_ms: databaseRpcDurationMs,
        telegram_api_duration_ms: telegramApiDurationMs,
        stages: metrics.stages
      },
      `[${sbRegion}] Telegram update ${update.update_id} processed in ${metrics.totalDurationMs}ms (DB/RPC: ${databaseRpcDurationMs}ms, Telegram API: ${telegramApiDurationMs}ms)`
    );
    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markTelegramUpdateFailed(deps.database, update.update_id, message);
    const metrics = profiler.getMetrics();
    const sbRegion = getSbRegion(req);
    const { databaseRpcDurationMs, telegramApiDurationMs } = categorizeDurations(metrics.stages);
    deps.logger.error(
      {
        event: "telegram_update_processing_failed",
        update_id: update.update_id,
        SB_REGION: sbRegion,
        total_duration_ms: metrics.totalDurationMs,
        database_rpc_duration_ms: databaseRpcDurationMs,
        telegram_api_duration_ms: telegramApiDurationMs,
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
