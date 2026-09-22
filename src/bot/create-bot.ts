import { Bot, InlineKeyboard, type Context } from "grammy";
import type { UserRepository, RegisteredUser } from "../users/user.repository.js";
import type { Logger } from "../lib/logger.js";
import type { RequestProfiler } from "../lib/profiler.js";
import { escapeHtml, formatMoney } from "../lib/html.js";
import type { LeagueRepository } from "../leagues/league.repository.js";
import type { AvailableClub, ManagedClub } from "../leagues/types.js";
import { claimErrorMessage, formatClubDashboard, formatOpenLobbies } from "../leagues/presentation.js";
import type { SquadRepository } from "../squads/squad.repository.js";
import { formatSquad } from "../squads/presentation.js";
import type { TacticsRepository, Tactic } from "../tactics/tactics.repository.js";
import { footballTerm, formatLineup, formatStartingXi, formatTactics, positionName } from "../tactics/presentation.js";
import type { SquadPlayer } from "../squads/squad.repository.js";
import type { FixtureRepository } from "../fixtures/fixture.repository.js";
import { formatFixtureLine, formatUpcomingFixtures } from "../fixtures/presentation.js";
import type { MatchRepository } from "../matches/match.repository.js";
import { formatFinances, formatLeaders, formatResults, formatTable } from "../matches/presentation.js";
import type { TransferRepository } from "../transfers/transfer.repository.js";
import {
  formatClubPlayers,
  formatLeagueListing,
  formatLeagueMarket,
  formatListing,
  formatMarket,
  formatPlayerProfile,
  formatTransferHistory,
  formatTransferHub,
  transferMoney,
} from "../transfers/presentation.js";
import type { ProgressionRepository } from "../progression/progression.repository.js";
import { formatLeaderboard, formatProfile, formatSponsors } from "../progression/presentation.js";
import type { AdminRepository } from "../admin/admin.repository.js";
import { formatAdminSponsors, formatAdminStats, formatAdminUsers } from "../admin/presentation.js";
import { createMainKeyboard, MAIN_MENU } from "./keyboards.js";

interface BotDependencies {
  token: string;
  users: UserRepository;
  leagues: LeagueRepository;
  squads: SquadRepository;
  tactics: TacticsRepository;
  fixtures: FixtureRepository;
  matches: MatchRepository;
  transfers: TransferRepository;
  progression: ProgressionRepository;
  admin: AdminRepository;
  adminTelegramIds: number[];
  logger: Logger;
}

const PAGE_SIZE = 10;

async function editOrReply(context: Context, text: string, keyboard: InlineKeyboard): Promise<void> {
  if (context.callbackQuery?.message) {
    try { await context.editMessageText(text, { reply_markup: keyboard, parse_mode: "HTML" }); }
    catch (error: unknown) {
      if (!(error instanceof Error) || !error.message.includes("message is not modified")) throw error;
    }
  } else {
    await context.reply(text, { reply_markup: keyboard, parse_mode: "HTML" });
  }
}

function clubListKeyboard(clubs: AvailableClub[], leagueId: string, page: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const club of clubs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
    keyboard.text(club.clubName, `cf:${club.leagueClubId}`).row();
  }
  if (page > 0) keyboard.text("⬅️", `lg:${leagueId}:${page - 1}`);
  if ((page + 1) * PAGE_SIZE < clubs.length) keyboard.text("➡️", `lg:${leagueId}:${page + 1}`);
  if (page > 0 || (page + 1) * PAGE_SIZE < clubs.length) keyboard.row();
  return keyboard.text("↩️ Orqaga", "join");
}

function dashboardKeyboard(leagueClubId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("👥 Jamoa", `sq:${leagueClubId}`).text("🔥 Asosiy XI", `xi:${leagueClubId}`).row()
    .text("🧠 Taktika", `tc:${leagueClubId}`).text("🔁 Transfer", `tr:${leagueClubId}`).row()
    .text("📅 O‘yinlar", `mt:${leagueClubId}`).text("📊 Liga", `tb:${leagueClubId}`).row()
    .text("🚪 Ligadan chiqish", `lx:${leagueClubId}`).row();
}

export function createBot({ token, users, leagues, squads, tactics, fixtures, matches, transfers, progression, admin, adminTelegramIds, logger }: BotDependencies): Bot {
  const bot = new Bot(token);
  const isAdmin=(telegramId:number)=>adminTelegramIds.includes(telegramId);

  // Time all outgoing Telegram API calls for instrumentation
  bot.api.config.use(async (prev, method, payload, signal) => {
    const t0 = performance.now();
    try {
      return await prev(method, payload, signal);
    } finally {
      const elapsed = performance.now() - t0;
      const profiler: RequestProfiler | undefined = (bot as any).__currentProfiler;
      if (profiler) {
        profiler.record(`telegram_api:${method}`, elapsed);
      }
    }
  });

  const getContextUser = async (context: Context): Promise<RegisteredUser> => {
    const cached = (context as any).sessionUser as RegisteredUser | undefined;
    if (cached) return cached;
    if (!context.from) throw new Error("No telegram user");
    const profiler: RequestProfiler | undefined = (context as any).profiler;
    const user = profiler
      ? await profiler.time("user_upsert", () => users.upsertFromTelegram(context.from!))
      : await users.upsertFromTelegram(context.from!);
    (context as any).sessionUser = user;
    return user;
  };

  const getContextManagedClubs = async (context: Context, userId: string): Promise<ManagedClub[]> => {
    const cached = (context as any).managedClubs as ManagedClub[] | undefined;
    if (cached) return cached;
    const profiler: RequestProfiler | undefined = (context as any).profiler;
    const clubs = profiler
      ? await profiler.time("league_club_query", () => leagues.listManagedClubs(userId))
      : await leagues.listManagedClubs(userId);
    (context as any).managedClubs = clubs;
    return clubs;
  };

  const privateLeagueJoinPending = new Set<number>();
  const sendUpdate = async (telegramId: number | null, text: string, keyboard: InlineKeyboard): Promise<void> => {
    if (!telegramId) return;
    try {
      await bot.api.sendMessage(telegramId, text, { reply_markup: keyboard, parse_mode: "HTML" });
    } catch (error) {
      logger.warn({ event: "transfer_notification_failed", err: error }, "Transfer notification failed");
    }
  };

  bot.use(async(context,next)=>{
    (context as any).profiler = (bot as any).__currentProfiler;
    if(!context.from)return next();
    const user = await getContextUser(context);
    if(user.is_blocked&&!isAdmin(context.from.id)){
      await context.reply("Botdan foydalanish huquqingiz vaqtincha bloklangan.");
      return;
    }
    await next();
  });

  bot.on("callback_query", async (context, next) => {
    const profiler: RequestProfiler | undefined = (context as any).profiler;
    let answered = false;
    const originalAnswer = context.answerCallbackQuery.bind(context);

    // Make context.answerCallbackQuery idempotent and track callback_ack_ms
    context.answerCallbackQuery = async (params?: any) => {
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

    // Immediate network ACK to dismiss Telegram button spinner in 100-300ms
    await context.answerCallbackQuery().catch(() => {});

    await next();
  });

  const showCompetitions = async (context: Context): Promise<void> => {
    const user = await getContextUser(context);
    const profiler: RequestProfiler | undefined = (context as any).profiler;
    const [lobbies, managedClubs] = await Promise.all([
      profiler ? profiler.time("league_club_query", () => leagues.listOpenLobbies()) : leagues.listOpenLobbies(),
      getContextManagedClubs(context, user.id),
    ]);

    const keyboard = new InlineKeyboard();
    for (const lobby of lobbies) {
      const flag = lobby.competitionCode === "UZB" ? "🇺🇿" : "🌍";
      keyboard.text(`${flag} ${lobby.competitionName} — Klub tanlash`, `lg:${lobby.leagueId}`).row();
    }
    if (managedClubs.length > 0) {
      for (const mc of managedClubs) {
        keyboard.text(`⚽ ${mc.clubName} — Boshqarish`, `db:${mc.leagueClubId}`)
                .text(`🚪 Chiqish`, `lx:${mc.leagueClubId}`).row();
      }
    }
    keyboard.text("🔄 Yangilash", "refresh:leagues");

    await editOrReply(context, formatOpenLobbies(lobbies, managedClubs), keyboard);
  };

  const showDashboard = async (context: Context, club: ManagedClub): Promise<void> => {
    const telegramUser = context.from;
    const managerName = telegramUser?.username ? `@${telegramUser.username}` : telegramUser?.first_name ?? "Manager";
    const user = await getContextUser(context);
    const profiler: RequestProfiler | undefined = (context as any).profiler;
    const [next] = profiler
      ? await profiler.time("league_club_query", () => fixtures.listUpcoming(user.id, club.leagueClubId, 1, true))
      : await fixtures.listUpcoming(user.id, club.leagueClubId, 1, true);
    await editOrReply(context, formatClubDashboard(club, managerName, next ? formatFixtureLine(next) : undefined), dashboardKeyboard(club.leagueClubId));
  };

  bot.command("start", async (context) => {
    const telegramUser = context.from;
    if (!telegramUser) {
      await context.reply("Telegram profilingizni aniqlab bo‘lmadi. Iltimos, qayta urinib ko‘ring.");
      return;
    }

    const profiler: RequestProfiler | undefined = (context as any).profiler;
    // Fast single round-trip RPC or cached fetch
    const startState = profiler
      ? await profiler.time("user_upsert", () => users.getStartState(telegramUser))
      : await users.getStartState(telegramUser);

    const user = startState.user;
    (context as any).sessionUser = user;
    const managedClubs = startState.managedClubs;
    (context as any).managedClubs = managedClubs;

    logger.info({ event: "user_registered", userId: user.id, telegramId: user.telegram_id }, "User registered or updated");

    const welcomeLines = [
      `⚽ Xush kelibsiz, ${telegramUser.first_name}!`,
      "",
      "OFM Game’da sevimli klubingizni boshqaring: tarkib tuzing, taktika tanlang, transfer qiling va chempionlik uchun kurashing! 🏆",
    ];
    if (managedClubs.length === 0) {
      welcomeLines.push("", "💡 Boshlash uchun quyidagi «🏆 Ligalar» bo‘limiga o‘ting va bo‘sh klubni tanlang 👇");
    } else {
      welcomeLines.push("", `🏟 Boshqarayotgan klublaringiz: ${managedClubs.length} ta`, "Kerakli bo‘limni tanlang 👇");
    }

    const mainKeyboard = createMainKeyboard(isAdmin(telegramUser.id));

    // Single consolidated message with reply keyboard (50% reduction in Telegram API roundtrips)
    await context.reply(welcomeLines.join("\n"), { reply_markup: mainKeyboard });
  });

  bot.hears(MAIN_MENU.club, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const clubs = await getContextManagedClubs(context, user.id);
    if (clubs.length === 0) return showCompetitions(context);
    if (clubs.length === 1) return showDashboard(context, clubs[0]!);
    const keyboard = new InlineKeyboard();
    for (const club of clubs) keyboard.text(`${club.clubName} · ${club.competitionName}`, `db:${club.leagueClubId}`).row();
    await context.reply("Klubingizni tanlang:", { reply_markup: keyboard });
  });

  bot.callbackQuery("home:club", async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubs = await getContextManagedClubs(context, user.id);
    if (!clubs.length) return showCompetitions(context);
    return showDashboard(context, clubs[0]!);
  });

  bot.hears(MAIN_MENU.leagues, showCompetitions);

  bot.hears(MAIN_MENU.profile, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const profiler: RequestProfiler | undefined = (context as any).profiler;
    const [profile, clubs] = await Promise.all([
      profiler
        ? profiler.time("manager_profile", () => progression.profile(user.id))
        : progression.profile(user.id),
      getContextManagedClubs(context, user.id),
    ]);
    await context.reply(formatProfile(profile, clubs), {
      reply_markup: new InlineKeyboard().text("🏅 Global reyting", "lb:0"),
      parse_mode: "HTML",
    });
  });

  bot.callbackQuery("lb:0", async (context) => {
    await context.answerCallbackQuery();
    const profiler: RequestProfiler | undefined = (context as any).profiler;
    const leaders = profiler
      ? await profiler.time("manager_profile", () => progression.leaderboard())
      : await progression.leaderboard();
    await editOrReply(context, formatLeaderboard(leaders), new InlineKeyboard().text("↩️ Orqaga", "pf:0"));
  });

  bot.callbackQuery("pf:0", async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const profiler: RequestProfiler | undefined = (context as any).profiler;
    const profile = profiler
      ? await profiler.time("manager_profile", () => progression.profile(user.id))
      : await progression.profile(user.id);
    await editOrReply(context, formatProfile(profile), new InlineKeyboard().text("🏅 Global reyting", "lb:0"));
  });

  bot.callbackQuery("refresh:leagues", async (context) => {
    await context.answerCallbackQuery();
    await showCompetitions(context);
  });

  const adminHome = async (context: Context) => {
    await editOrReply(context, formatAdminStats(await admin.stats()), new InlineKeyboard().text("Users", "ad:u").text("Sponsors", "ad:s").row().text("Audit log", "ad:a").text("Refresh", "ad:h"));
  };
  bot.hears(MAIN_MENU.admin, async (context) => {
    if (!context.from || !isAdmin(context.from.id)) return;
    await adminHome(context);
  });
  bot.callbackQuery(/^ad:([usah])$/,async context=>{if(!context.from||!isAdmin(context.from.id))return context.answerCallbackQuery({text:"Ruxsat yo‘q"});await context.answerCallbackQuery();const section=context.match[1];if(section==='h')return adminHome(context);if(section==='u'){const rows=await admin.users();const kb=new InlineKeyboard();for(const u of rows){if(u.telegramId===context.from.id)continue;kb.text(`${u.blocked?'✅ Unblock':'⛔ Block'} ${u.username?`@${u.username}`:u.name}`,`${u.blocked?'au':'ab'}:${u.id}`).row();}kb.text("← Admin","ad:h");return editOrReply(context,formatAdminUsers(rows),kb);}if(section==='s'){const rows=await admin.sponsors();const kb=new InlineKeyboard();for(const s of rows)kb.text(`${s.active?'⏸':'▶️'} ${s.name}`,`as:${s.id}:${s.active?'0':'1'}`).row();kb.text("← Admin","ad:h");return editOrReply(context,formatAdminSponsors(rows),kb);}const rows=await admin.audit();return editOrReply(context,["AUDIT LOG","",...(rows.length?rows.map((r:any)=>`${r.action} · ${r.target_type}\n${new Date(r.created_at).toLocaleString('uz-UZ')}`):["Hozircha audit yozuvlari yo‘q."])].join('\n'),new InlineKeyboard().text("← Admin","ad:h"));});
  bot.callbackQuery(/^(ab|au):([0-9a-f-]{36})$/,async context=>{if(!context.from||!isAdmin(context.from.id))return;await context.answerCallbackQuery();const actor=await getContextUser(context);await admin.setBlocked(actor.id,context.match[2]!,context.match[1]==='ab');await context.reply("User holati yangilandi.");});
  bot.callbackQuery(/^as:([0-9a-f-]{36}):([01])$/,async context=>{if(!context.from||!isAdmin(context.from.id))return;await context.answerCallbackQuery();const actor=await getContextUser(context);await admin.setSponsor(actor.id,context.match[1]!,context.match[2]==='1');await context.reply("Sponsor holati yangilandi.");});

  const showTransferHub = async (context: Context, clubId: string): Promise<void> => {
    const user = await getContextUser(context);
    const clubs = await getContextManagedClubs(context, user.id);
    const club = clubs.find((c) => c.leagueClubId === clubId);
    const clubName = club?.clubName ?? "Klub";
    const finances = await matches.finances(user.id, clubId);
    const owner = await (transfers as any).ownerLeague(user.id, clubId, false);

    await transfers.saveInputSession(user.id, "ACTIVE_CLUB", { clubId });

    const keyboard = new InlineKeyboard()
      .text("🛒 Transfer bozori", `lm:${clubId}:0:ALL`)
      .text("🔎 Ligadan izlash", `tf:${clubId}:0`)
      .row()
      .text("🌍 Global Transfer", `gm:${clubId}:0:ALL`)
      .text("📤 Futbolchi sotish", `ts:${clubId}`)
      .row()
      .text("📥 Takliflar", `io:${clubId}`)
      .text("📜 Transfer tarixi", `th:${clubId}`)
      .row()
      .text("↩️ Orqaga", `db:${clubId}`);

    let hubText = formatTransferHub(
      clubName,
      finances.transferBudget,
      finances.cashBalance,
      finances.reservedTransferBudget ?? 0
    );

    if (owner.league_status === "OPEN") {
      hubText = `⏳ <b>Liga hali boshlanmagan</b>\n<i>Transferlar liga startidan keyin ochiladi.</i>\n\n${hubText}`;
    }

    await editOrReply(context, hubText, keyboard);
  };

  const showLeagueMarket = async (
    context: Context,
    clubId: string,
    page: number,
    group = "ALL"
  ): Promise<void> => {
    if (!context.from) return;
    const user = await getContextUser(context);
    await transfers.saveInputSession(user.id, "ACTIVE_CLUB", { clubId });
    const clubs = await getContextManagedClubs(context, user.id);
    const club = clubs.find((c) => c.leagueClubId === clubId);
    const items = await transfers.leagueMarket(user.id, clubId, page, 8, group);
    const keyboard = new InlineKeyboard();

    for (const item of items) {
      keyboard
        .text(
          `${item.name} · ${item.position} · ⭐${item.overall} · ${transferMoney(item.askingPrice)}${item.isOwnListing ? " 🏷" : ""}`,
          `lb:${item.listingId}`
        )
        .row();
    }

    keyboard
      .text(group === "ALL" ? "ALL ✅" : "ALL", `lm:${clubId}:0:ALL`)
      .row()
      .text(group === "GK" ? "GK ✅" : "GK", `lm:${clubId}:0:GK`)
      .text(group === "DEF" ? "DEF ✅" : "DEF", `lm:${clubId}:0:DEF`)
      .row()
      .text(group === "MID" ? "MID ✅" : "MID", `lm:${clubId}:0:MID`)
      .text(group === "ATT" ? "ATT ✅" : "ATT", `lm:${clubId}:0:ATT`)
      .row();

    if (page > 0) keyboard.text("⬅️", `lm:${clubId}:${page - 1}:${group}`);
    keyboard.text(`${page + 1}`, `lm:${clubId}:${page}:${group}`);
    if (items.length === 8) keyboard.text("➡️", `lm:${clubId}:${page + 1}:${group}`);
    keyboard.row().text("↩️ Orqaga", `tr:${clubId}`);

    await editOrReply(context, formatLeagueMarket(items, club?.leagueName), keyboard);
  };

  const showMarket = async (
    context: Context,
    clubId: string,
    page: number,
    group = "ALL"
  ): Promise<void> => {
    if (!context.from) return;
    const user = await getContextUser(context);
    await transfers.saveInputSession(user.id, "ACTIVE_CLUB", { clubId });
    const items = await transfers.market(user.id, clubId, page, 8, group);
    const keyboard = new InlineKeyboard();

    for (const item of items) {
      keyboard.text(`${item.name} · ${item.position} · ⭐${item.overall} · ${transferMoney(item.askingPrice)}`, `gb:${item.listingId}`).row();
    }

    keyboard
      .text(group === "ALL" ? "ALL ✅" : "ALL", `gm:${clubId}:0:ALL`)
      .row()
      .text(group === "GK" ? "GK ✅" : "GK", `gm:${clubId}:0:GK`)
      .text(group === "DEF" ? "DEF ✅" : "DEF", `gm:${clubId}:0:DEF`)
      .row()
      .text(group === "MID" ? "MID ✅" : "MID", `gm:${clubId}:0:MID`)
      .text(group === "ATT" ? "ATT ✅" : "ATT", `gm:${clubId}:0:ATT`)
      .row();

    if (page > 0) keyboard.text("⬅️", `gm:${clubId}:${page - 1}:${group}`);
    keyboard.text(`${page + 1}`, `gm:${clubId}:${page}:${group}`);
    if (items.length === 8) keyboard.text("➡️", `gm:${clubId}:${page + 1}:${group}`);
    keyboard.row().text("↩️ Orqaga", `tr:${clubId}`);

    await editOrReply(context, formatMarket(items), keyboard);
  };

  bot.callbackQuery(/^tr:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubId = context.match[1]!;
    if (!(await getContextManagedClubs(context, user.id)).some((c) => c.leagueClubId === clubId)) return;
    await showTransferHub(context, clubId);
  });

  bot.callbackQuery(/^lm:([0-9a-f-]{36}):(\d+)(?::(ALL|GK|DEF|MID|ATT))?$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    await showLeagueMarket(context, context.match[1]!, Number(context.match[2]), context.match[3] ?? "ALL");
  });

  bot.callbackQuery(/^lb:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? (session.data.clubId as string) : undefined)
      ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;

    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    const item = await transfers.listing(user.id, clubId, context.match[1]!);
    if (!item) {
      return editOrReply(context, "<i>Bu futbolchi transfer bozorida faol emas.</i>", new InlineKeyboard().text("↩️ Orqaga", `lm:${clubId}:0:ALL`));
    }

    const kb = new InlineKeyboard();
    if (item.isOwnListing) {
      kb.text("❌ Sotuvdan olish", `ld:${item.listingId}`).row();
    } else {
      kb.text("✅ Xaridni tasdiqlash", `lc:${item.listingId}`).row();
    }
    kb.text("↩️ Orqaga", `lm:${clubId}:0:ALL`);

    await editOrReply(context, formatLeagueListing(item), kb);
  });

  bot.callbackQuery(/^lc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Transfer amalga oshirilmoqda…" });
    const user = await getContextUser(context);
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? (session.data.clubId as string) : undefined)
      ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;

    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    try {
      await transfers.buy(user.id, clubId, context.match[1]!);
      await editOrReply(
        context,
        "✅ <b>Transfer yakunlandi!</b>\n\n<i>Futbolchi klubingizga muvaffaqiyatli qo‘shildi.</i>",
        new InlineKeyboard().text("↩️ Orqaga", `lm:${clubId}:0:ALL`).text("🏟 Klub", `db:${clubId}`)
      );
    } catch (error: any) {
      logger.warn({ event: "league_transfer_failed", err: error }, "League transfer failed");
      const err = error?.message ?? "";
      let text = "❌ <b>Transfer amalga oshmadi</b>\n<i>Qayta urinib ko‘ring.</i>";
      if (err.includes("INSUFFICIENT_BUDGET")) {
        text = "❌ <b>Transfer amalga oshmadi</b>\n<i>Klub budjetida yetarli mablag‘ yo‘q.</i>";
      } else if (err.includes("SQUAD_LIMIT_REACHED")) {
        text = "❌ <b>Transfer amalga oshmadi</b>\n<i>Tarkibda bo‘sh joy yo‘q (maksimal 30 futbolchi).</i>";
      } else if (err.includes("LISTING_NOT_AVAILABLE") || err.includes("LISTING_EXPIRED")) {
        text = "❌ <b>Transfer amalga oshmadi</b>\n<i>Ushbu futbolchi allaqachon sotilgan yoki listing muddati tugagan.</i>";
      } else if (err.includes("LEAGUE_PRE_SEASON_LOCKED")) {
        text = "⏳ <b>Liga hali boshlanmagan</b>\n<i>Transferlar liga startidan keyin ochiladi.</i>";
      }
      await editOrReply(context, text, new InlineKeyboard().text("↩️ Orqaga", `lm:${clubId}:0:ALL`));
    }
  });

  bot.callbackQuery(/^ld:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? (session.data.clubId as string) : undefined)
      ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;

    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    try {
      await transfers.delist(user.id, clubId, context.match[1]!);
      await context.answerCallbackQuery({ text: "✅ Futbolchi sotuvdan olindi." });
      await showTransferHub(context, clubId);
    } catch (error: any) {
      await context.answerCallbackQuery({ text: `Xato: ${error?.message ?? "Amal bajarilmadi"}` });
    }
  });

  bot.callbackQuery(/^ts:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubId = context.match[1]!;
    await transfers.saveInputSession(user.id, "ACTIVE_CLUB", { clubId });
    const players = await transfers.saleCandidates(user.id, clubId);
    const kb = new InlineKeyboard();

    for (const player of players.slice(0, 20)) {
      const statusTag = player.isListed ? " 🏷 [Sotuvda]" : player.isStarting ? " ⚠️ [Asosiy]" : "";
      kb.text(`${player.name} · ${player.position} · ⭐${player.overall}${statusTag}`, `tl:${player.clubPlayerId}`).row();
    }
    kb.text("← Transfer markazi", `tr:${clubId}`);

    await editOrReply(
      context,
      players.length
        ? "📤 FUTBOLCHINI SOTUVGA QO‘YISH\n\nNarxini belgilash uchun futbolchini tanlang:\n(⚠️ = Asosiy tarkib o‘yinchisi, 🏷 = Allaqachon sotuvda)"
        : "Sotuvga qo‘yish mumkin bo‘lgan futbolchi yo‘q (kamida 18 futbolchi qolishi kerak).",
      kb
    );
  });

  const showPricePresets = async (
    context: Context,
    userId: string,
    clubId: string,
    player: any
  ): Promise<void> => {
    const p10 = Math.round((player.marketValue * 1.1) / 100_000) * 100_000;
    const p20 = Math.round((player.marketValue * 1.2) / 100_000) * 100_000;
    const p30 = Math.round((player.marketValue * 1.3) / 100_000) * 100_000;

    const kb = new InlineKeyboard()
      .text(`+10% (${transferMoney(p10)})`, `tp:${player.clubPlayerId}:1.1`)
      .row()
      .text(`+20% (${transferMoney(p20)})`, `tp:${player.clubPlayerId}:1.2`)
      .row()
      .text(`+30% (${transferMoney(p30)})`, `tp:${player.clubPlayerId}:1.3`)
      .row()
      .text("⌨️ Boshqa narx yozish", `tkb:${player.clubPlayerId}`)
      .row()
      .text("← Orqaga", `ts:${clubId}`);

    await editOrReply(
      context,
      `💰 ${player.name} (${player.position}, ⭐${player.overall})\n\nBozor narxi: ${transferMoney(player.marketValue)}\n\nSotuv narxini tanlang:`,
      kb
    );
  };

  bot.callbackQuery(/^tl:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubPlayerId = context.match[1]!;
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? (session.data.clubId as string) : undefined)
      ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;

    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    const candidates = await transfers.saleCandidates(user.id, clubId);
    const player = candidates.find((p) => p.clubPlayerId === clubPlayerId);
    if (!player) {
      await context.reply("Futbolchi topilmadi.");
      return;
    }

    if (player.isListed && player.listingId) {
      const kb = new InlineKeyboard()
        .text("❌ Sotuvdan olish", `ld:${player.listingId}`)
        .row()
        .text("← Orqaga", `ts:${clubId}`);
      return editOrReply(
        context,
        `🏷 ${player.name} hozirda transfer bozorida sotuvga qo‘yilgan.\n\nNarxi: ${transferMoney(player.marketValue)}\nSotuvdan olishni xohlaysizmi?`,
        kb
      );
    }

    if (player.isStarting) {
      const kb = new InlineKeyboard()
        .text("✅ Baribir sotuvga qo‘yish", `tn:${player.clubPlayerId}`)
        .row()
        .text("❌ Bekor qilish", `ts:${clubId}`);
      return editOrReply(
        context,
        `⚠️ Bu futbolchi Starting XI tarkibida.\n\nBaribir sotuvga qo‘ymoqchimisiz?`,
        kb
      );
    }

    await showPricePresets(context, user.id, clubId, player);
  });

  bot.callbackQuery(/^tn:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubPlayerId = context.match[1]!;
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? (session.data.clubId as string) : undefined)
      ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;

    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    const candidates = await transfers.saleCandidates(user.id, clubId);
    const player = candidates.find((p) => p.clubPlayerId === clubPlayerId);
    if (!player) return context.reply("Futbolchi topilmadi.");
    await showPricePresets(context, user.id, clubId, player);
  });

  bot.callbackQuery(/^tp:([0-9a-f-]{36}):([0-9.]+)$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Sotuvga qo‘yilmoqda…" });
    const user = await getContextUser(context);
    const clubPlayerId = context.match[1]!;
    const mult = Number(context.match[2]);
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? (session.data.clubId as string) : undefined)
      ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;

    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    const candidates = await transfers.saleCandidates(user.id, clubId);
    const player = candidates.find((p) => p.clubPlayerId === clubPlayerId);
    if (!player) return context.reply("Futbolchi topilmadi.");

    const askingPrice = Math.round((player.marketValue * mult) / 100_000) * 100_000;
    try {
      await transfers.listForSale(user.id, clubId, clubPlayerId, askingPrice);
      await editOrReply(
        context,
        `✅ <b>${escapeHtml(player.name)}</b> <b>${formatMoney(askingPrice)}</b> narxida transfer bozoriga qo‘yildi!`,
        new InlineKeyboard().text("🛒 Transfer bozorini ko‘rish", `lm:${clubId}:0:ALL`).row().text("↩️ Orqaga", `ts:${clubId}`)
      );
    } catch (error: any) {
      const err = error?.message ?? "";
      let text = "❌ <b>Futbolchini sotuvga qo‘yib bo‘lmadi</b>\n<i>Qayta urinib ko‘ring.</i>";
      if (err.includes("LEAGUE_PRE_SEASON_LOCKED")) {
        text = "⏳ <b>Liga hali boshlanmagan</b>\n<i>Transferlar liga startidan keyin ochiladi.</i>";
      }
      await editOrReply(
        context,
        text,
        new InlineKeyboard().text("↩️ Orqaga", `ts:${clubId}`)
      );
    }
  });

  bot.callbackQuery(/^tkb:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubPlayerId = context.match[1]!;
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? (session.data.clubId as string) : undefined)
      ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;

    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    const candidates = await transfers.saleCandidates(user.id, clubId);
    const player = candidates.find((p) => p.clubPlayerId === clubPlayerId);
    if (!player) return context.reply("Futbolchi topilmadi.");

    const minimum = Math.max(100_000, Math.round(player.marketValue * 0.5));
    await transfers.saveInputSession(user.id, "SELL", {
      clubId,
      clubPlayerId,
      playerName: player.name,
      minimum,
    });

    await editOrReply(
      context,
      `💰 <b>${escapeHtml(player.name)}</b> uchun sotuv narxini yuboring.\n\nMinimal narx: <b>${formatMoney(minimum)}</b>\n<i>Misol: 45M yoki 45000000</i>`,
      new InlineKeyboard().text("↩️ Orqaga", `ts:${clubId}`)
    );
  });

  bot.callbackQuery(/^tf:([0-9a-f-]{36}):(\d+)$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubId = context.match[1]!;
    const page = Number(context.match[2]);
    const clubs = await transfers.leagueClubs(user.id, clubId);
    const kb = new InlineKeyboard();

    for (const club of clubs.slice(page * 10, (page + 1) * 10)) {
      kb.text(`🏟 ${club.clubName}`, `tk:${club.leagueClubId}:0`).row();
    }

    if (page > 0) kb.text("⬅️", `tf:${clubId}:${page - 1}`);
    if ((page + 1) * 10 < clubs.length) kb.text("➡️", `tf:${clubId}:${page + 1}`);
    if (page > 0 || (page + 1) * 10 < clubs.length) kb.row();
    kb.text("↩️ Orqaga", `tr:${clubId}`);

    await editOrReply(
      context,
      clubs.length
        ? "🔎 <b>LIGADAN IZLASH</b>\n\n<i>Raqib klubni tanlang va uning futbolchilariga taklif yuboring:</i>"
        : "🔎 <b>LIGADAN IZLASH</b>\n\n<i>Bu ligada boshqa raqib klublar topilmadi.</i>",
      kb
    );
  });

  bot.callbackQuery(/^tk:([0-9a-f-]{36}):(\d+)$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const targetClubId = context.match[1]!;
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
      kb.text(`⚽ ${player.name} · ${player.position} · ⭐${player.overall}`, `tp:${player.clubPlayerId}`).row();
    }

    if (page > 0) kb.text("⬅️", `tk:${targetClubId}:${page - 1}`);
    if (players.length === 15) kb.text("➡️", `tk:${targetClubId}:${page + 1}`);
    if (page > 0 || players.length === 15) kb.row();
    kb.text("↩️ Orqaga", `tf:${buyerClubId}:0`);

    await editOrReply(context, formatClubPlayers(targetClubName, players), kb);
  });

  bot.callbackQuery(/^tp:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubPlayerId = context.match[1]!;
    const buyerClubId = await transfers.buyerClubForPlayer(user.id, clubPlayerId);
    const player = await transfers.targetPlayer(clubPlayerId, buyerClubId ?? undefined);
    if (!player) {
      await context.reply("Futbolchi ma’lumotlari topilmadi.");
      return;
    }

    if (player.activeNegotiation) {
      const kb = new InlineKeyboard();
      if (player.activeNegotiation.status === "COUNTERED") {
        kb.text("✅ Qabul qilish", `ia:${player.activeNegotiation.offerId}`)
          .text("❌ Rad etish", `ir:${player.activeNegotiation.offerId}`)
          .row();
      }
      kb.text("↩️ Orqaga", player.targetClubId ? `tk:${player.targetClubId}:0` : "home:club");

      const negText = [
        "⏳ <b>Muzokara davom etmoqda</b>",
        "",
        `👤 <b>${escapeHtml(player.name.toUpperCase())}</b>`,
        `🏟 ${escapeHtml(player.clubName)}`,
        `📍 ${escapeHtml(player.position)} · ⭐<b>${player.overall}</b>`,
        "",
        player.activeNegotiation.status === "COUNTERED"
          ? `<b>${escapeHtml(player.clubName)}</b> qarshi taklifi: <b>${formatMoney(player.activeNegotiation.counterAmount!)}</b>`
          : `<i>Yuborilgan taklifingiz (${formatMoney(player.activeNegotiation.amount)}) ko‘rib chiqilmoqda…</i>`,
      ].join("\n");

      return editOrReply(context, negText, kb);
    }

    if (player.isResaleLocked) {
      const kb = new InlineKeyboard().text("↩️ Orqaga", player.targetClubId ? `tk:${player.targetClubId}:0` : "home:club");
      return editOrReply(
        context,
        `👤 <b>${escapeHtml(player.name.toUpperCase())}</b>\n\n🔒 <i>Bu futbolchi yaqinda transfer qilingan va qayta sotilishi vaqtincha cheklangan.</i>`,
        kb
      );
    }

    const kb = new InlineKeyboard()
      .text(`120% (${transferMoney(Math.round(player.marketValue * 1.2))})`, `of:${player.clubPlayerId}:120`)
      .text(`130% (${transferMoney(Math.round(player.marketValue * 1.3))})`, `of:${player.clubPlayerId}:130`)
      .row()
      .text(`140% (${transferMoney(Math.round(player.marketValue * 1.4))})`, `of:${player.clubPlayerId}:140`)
      .text(`150% (${transferMoney(Math.round(player.marketValue * 1.5))})`, `of:${player.clubPlayerId}:150`)
      .row()
      .text("✍️ Boshqa summa kiritish", `oc:${player.clubPlayerId}`)
      .row()
      .text("↩️ Orqaga", player.targetClubId ? `tk:${player.targetClubId}:0` : "home:club");

    await editOrReply(context, formatPlayerProfile(player), kb);
  });

  bot.callbackQuery(/^of:([0-9a-f-]{36}):(\d+)$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Taklif yuborilmoqda…" });
    const user = await getContextUser(context);
    const clubPlayerId = context.match[1]!;
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
            "📥 <b>TRANSFER TAKLIFI</b>",
            "",
            `<b>${escapeHtml(offer.buyerClub)}</b>`,
            `sizning <b>${escapeHtml(player.name)}</b> futbolchingiz uchun`,
            "",
            `💶 <b>${formatMoney(amount)}</b> taklif qildi.`,
          ].join("\n"),
          new InlineKeyboard()
            .text("✅ Qabul qilish", `ia:${result.offerId}`)
            .text("❌ Rad etish", `ir:${result.offerId}`)
            .row()
            .text("↔️ Counter", `ic:${result.offerId}`)
        );
      }

      const text =
        result.status === "ACCEPTED"
          ? `✅ <b>Transfer yakunlandi!</b>\n\n<b>${escapeHtml(player.name)}</b> klubingiz safiga qo‘shildi.`
          : result.status === "COUNTERED"
          ? `⏳ <b>Muzokara davom etmoqda</b>\n\n<b>${escapeHtml(player.clubName)}</b> qarshi taklifi: <b>${formatMoney(result.counterAmount!)}</b>`
          : result.status === "PENDING"
          ? `⏳ <b>Taklif yuborildi</b>\n\n<i>Taklif ${escapeHtml(player.clubName)} murabbiyiga yuborildi.</i>`
          : `❌ <b>Taklif rad etildi</b>\n\n<i>${escapeHtml(player.clubName)} taklifni rad etdi.</i>`;

      await editOrReply(
        context,
        text,
        new InlineKeyboard()
          .text("↩️ Orqaga", player.targetClubId ? `tk:${player.targetClubId}:0` : `tr:${buyerClubId}`)
      );
    } catch (error: any) {
      const code = error?.message ?? "";
      const msg =
        code === "INSUFFICIENT_BUDGET"
          ? "❌ <b>Taklif yuborilmadi</b>\n<i>Klub budjetida yetarli mablag‘ yo‘q.</i>"
          : code === "PLAYER_NOT_AVAILABLE"
          ? "❌ <b>Transfer cheklangan</b>\n<i>Futbolchi transfer uchun ochiq emas yoki yaqinda sotib olingan.</i>"
          : code === "LEAGUE_PRE_SEASON_LOCKED"
          ? "⏳ <b>Liga hali boshlanmagan</b>\n<i>Transferlar liga startidan keyin ochiladi.</i>"
          : "❌ <b>Taklif yuborilmadi</b>\n<i>Qayta urinib ko‘ring.</i>";
      await context.reply(msg, { parse_mode: "HTML" });
    }
  });

  bot.callbackQuery(/^oc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubPlayerId = context.match[1]!;

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

    const minimum = Math.max(100_000, Math.round(player.marketValue * 0.5));
    await transfers.saveInputSession(user.id, "OFFER", {
      clubId: buyerClubId,
      clubPlayerId,
      playerName: player.name,
      minimum,
    });

    await editOrReply(
      context,
      `🤝 ${player.name} uchun taklif miqdorini yuboring.\n\nBozor qiymati: ${transferMoney(player.marketValue)}\nMinimal taklif: ${transferMoney(minimum)}\nMisol: 55M yoki 55000000`,
      new InlineKeyboard().text("← Bekor qilish", `tp:${clubPlayerId}`)
    );
  });

  bot.callbackQuery(/^io:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubId = context.match[1]!;
    const offers = await transfers.incomingOffers(user.id, clubId);
    const kb = new InlineKeyboard();

    for (const offer of offers) {
      kb.text(`${offer.playerName} · ${offer.buyerClub} · ${transferMoney(offer.amount)}`, `iv:${offer.offerId}`).row();
    }
    kb.text("↩️ Orqaga", `tr:${clubId}`);

    await editOrReply(
      context,
      offers.length
        ? "📥 <b>TAKLIFLAR</b>\n\n<i>Taklifni ochib qabul qiling yoki rad eting:</i>"
        : "📥 <b>TAKLIFLAR</b>\n\n<i>Hozircha aktiv takliflar yo‘q.</i>",
      kb
    );
  });

  bot.callbackQuery(/^iv:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const offerId = context.match[1]!;
    const offer = await transfers.notification(offerId);
    if (!offer) return context.answerCallbackQuery({ text: "Taklif endi faol emas" });

    const text = [
      "📥 <b>TRANSFER TAKLIFI</b>",
      "",
      `<b>${escapeHtml(offer.buyerClub)}</b>`,
      `sizning <b>${escapeHtml(offer.playerName)}</b> futbolchingiz uchun`,
      "",
      `💶 <b>${formatMoney(offer.amount)}</b> taklif qildi.`,
    ].join("\n");

    await editOrReply(
      context,
      text,
      new InlineKeyboard()
        .text("✅ Qabul qilish", `ia:${offer.offerId}`)
        .text("❌ Rad etish", `ir:${offer.offerId}`)
        .row()
        .text("↔️ Counter", `ic:${offer.offerId}`)
        .row()
        .text("↩️ Orqaga", `io:${offer.sellerClubId}`)
    );
  });

  bot.callbackQuery(/^ic:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const offer = await transfers.notification(context.match[1]!);
    if (!offer || offer.sellerTelegramId !== context.from.id) {
      return context.answerCallbackQuery({ text: "Taklif endi faol emas" });
    }

    const minimum = offer.amount + 100_000;
    await transfers.saveInputSession(user.id, "COUNTER", {
      offerId: offer.offerId,
      playerName: offer.playerName,
      minimum,
    });

    await editOrReply(
      context,
      `↔️ <b>${escapeHtml(offer.playerName)}</b> uchun qarshi taklif summasini yuboring.\n\nAsl taklif: <b>${formatMoney(offer.amount)}</b>\nMinimal: <b>${formatMoney(minimum)}</b>`,
      new InlineKeyboard().text("↩️ Orqaga", `iv:${offer.offerId}`)
    );
  });

  bot.callbackQuery(/^ac:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const offer = await transfers.notification(context.match[1]!);
    if (!offer || offer.buyerTelegramId !== context.from.id) {
      return context.answerCallbackQuery({ text: "Taklif endi faol emas" });
    }
    await context.answerCallbackQuery({ text: "Transfer yakunlanmoqda…" });
    try {
      await transfers.acceptCounterOffer(user.id, offer.offerId);
      await sendUpdate(offer.sellerTelegramId, `✅ ${offer.playerName} bo‘yicha qarshi taklif qabul qilindi. Transfer yakunlandi.`, new InlineKeyboard());
      await editOrReply(context, `✅ ${offer.playerName} transferi yakunlandi.`, new InlineKeyboard().text("← Transfer markazi", `tr:${offer.buyerClubId}`));
    } catch {
      await context.reply("Qarshi taklif endi faol emas yoki budjet yetarli emas.");
    }
  });

  bot.callbackQuery(/^(ia|ir):([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const offer = await transfers.notification(context.match[2]!);
    if (!offer || offer.sellerTelegramId !== context.from.id) {
      return context.answerCallbackQuery({ text: "Taklif endi faol emas" });
    }
    await context.answerCallbackQuery({ text: "Taklif qayta ishlanmoqda…" });
    try {
      const accepted = context.match[1] === "ia";
      const result = await transfers.respondToOffer(user.id, offer.offerId, accepted ? "ACCEPT" : "REJECT");
      await sendUpdate(
        offer.buyerTelegramId,
        accepted
          ? `✅ ${offer.playerName} uchun ${transferMoney(offer.amount)} taklifingiz qabul qilindi. Transfer yakunlandi.`
          : `❌ ${offer.playerName} uchun taklifingiz rad etildi.`,
        new InlineKeyboard()
      );
      await editOrReply(
        context,
        result === "ACCEPTED" ? "✅ Transfer qabul qilindi. Futbolchi xaridor klubiga o‘tdi." : "❌ Taklif rad etildi.",
        new InlineKeyboard().text("← Transfer markazi", `tr:${offer.sellerClubId}`)
      );
    } catch (error) {
      logger.warn({ event: "incoming_offer_response_failed", err: error }, "Incoming offer response failed");
      await context.reply("Taklifni qayta ishlab bo‘lmadi. U muddatidan o‘tgan bo‘lishi mumkin.");
    }
  });

  bot.callbackQuery(/^th:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubId = context.match[1]!;
    const history = await transfers.transferHistory(clubId);

    await editOrReply(
      context,
      formatTransferHistory(history),
      new InlineKeyboard().text("← Transfer markazi", `tr:${clubId}`)
    );
  });

  bot.callbackQuery(/^gm:([0-9a-f-]{36}):(\d+)(?::(ALL|GK|DEF|MID|ATT))?$/, async (context) => {
    await context.answerCallbackQuery();
    await showMarket(context, context.match[1]!, Number(context.match[2]), context.match[3] ?? "ALL");
  });

  bot.callbackQuery(/^gb:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? (session.data.clubId as string) : undefined)
      ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;

    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    const item = await transfers.listing(user.id, clubId, context.match[1]!);
    if (!item) {
      return editOrReply(context, "<i>Bu futbolchi Global Transfer bozorida faol emas.</i>", new InlineKeyboard().text("↩️ Orqaga", `gm:${clubId}:0:ALL`));
    }
    await editOrReply(
      context,
      formatListing(item),
      new InlineKeyboard().text("✅ Xaridni tasdiqlash", `gc:${item.listingId}`).row().text("↩️ Orqaga", `gm:${clubId}:0:ALL`)
    );
  });

  bot.callbackQuery(/^gc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Transfer tekshirilmoqda…" });
    const user = await getContextUser(context);
    const session = await transfers.getInputSession(user.id);
    const clubId = (session?.mode === "ACTIVE_CLUB" ? (session.data.clubId as string) : undefined)
      ?? (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;

    if (!clubId) return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");
    try {
      await transfers.buy(user.id, clubId, context.match[1]!);
      await editOrReply(
        context,
        "✅ <b>Transfer yakunlandi!</b>\n\n<i>Futbolchi klubingizga qo‘shildi va asosiy tarkibingizga kiritildi.</i>",
        new InlineKeyboard().text("↩️ Orqaga", `gm:${clubId}:0:ALL`).text("🏟 Klub", `db:${clubId}`)
      );
    } catch (error: any) {
      logger.warn({ event: "global_transfer_failed", err: error }, "Global transfer failed");
      const err = error?.message ?? "";
      let text = "❌ <b>Transfer amalga oshmadi</b>\n<i>Qayta urinib ko‘ring.</i>";
      if (err.includes("INSUFFICIENT_BUDGET")) {
        text = "❌ <b>Transfer amalga oshmadi</b>\n<i>Klub budjetida yetarli mablag‘ yo‘q.</i>";
      } else if (err.includes("SQUAD_LIMIT_REACHED")) {
        text = "❌ <b>Transfer amalga oshmadi</b>\n<i>Tarkibda bo‘sh joy yo‘q (maksimal 30 futbolchi).</i>";
      } else if (err.includes("LISTING_NOT_ACTIVE") || err.includes("LISTING_NOT_AVAILABLE") || err.includes("LISTING_EXPIRED")) {
        text = "❌ <b>Transfer amalga oshmadi</b>\n<i>Ushbu futbolchi allaqachon sotilgan yoki listing muddati tugagan.</i>";
      } else if (err.includes("LEAGUE_PRE_SEASON_LOCKED")) {
        text = "⏳ <b>Liga hali boshlanmagan</b>\n<i>Transferlar liga startidan keyin ochiladi.</i>";
      }
      await editOrReply(context, text, new InlineKeyboard().text("↩️ Orqaga", `gm:${clubId}:0:ALL`));
    }
  });

  bot.on("message:text", async (context, next) => {
    if (!context.from) return next();
    const user = await getContextUser(context);
    const pending = await transfers.getInputSession(user.id);
    if (!pending || (pending.mode !== "SELL" && pending.mode !== "OFFER" && pending.mode !== "COUNTER")) {
      return next();
    }

    const data = pending.data as any;
    const raw = context.message.text.trim().replace(/\s/g, "").replace(",", ".");
    const isMillions = raw.toLowerCase().endsWith("m");
    const amount = Number(isMillions ? raw.slice(0, -1) : raw) * (isMillions ? 1_000_000 : 1);

    if (!Number.isFinite(amount) || amount < data.minimum) {
      await context.reply(`Miqdor noto‘g‘ri. Kamida ${transferMoney(data.minimum)} yuboring.`);
      return;
    }

    await transfers.clearInputSession(user.id);

    try {
      if (pending.mode === "SELL") {
        await transfers.listForSale(user.id, data.clubId, data.clubPlayerId, Math.round(amount));
        await context.reply(`✅ ${data.playerName} ${transferMoney(Math.round(amount))} narxda transfer bozoriga qo‘yildi.`, {
          reply_markup: new InlineKeyboard().text("← Transfer markazi", `tr:${data.clubId}`),
        });
      } else if (pending.mode === "COUNTER") {
        await transfers.counterOffer(user.id, data.offerId, Math.round(amount));
        const offer = await transfers.notification(data.offerId);
        await sendUpdate(
          offer?.buyerTelegramId ?? null,
          `💬 ${offer?.sellerClub ?? "Murabbiy"} ${data.playerName} uchun qarshi taklif yubordi: ${transferMoney(Math.round(amount))}`,
          new InlineKeyboard().text("✅ Qarshi taklifni qabul qilish", `ac:${data.offerId}`)
        );
        await context.reply("✅ Qarshi taklif xaridor murabbiyiga yuborildi.");
      } else {
        const result = await transfers.offer(user.id, data.clubId, data.clubPlayerId, Math.round(amount));
        const offer = await transfers.notification(result.offerId);
        if (result.status === "PENDING") {
          await sendUpdate(
            offer?.sellerTelegramId ?? null,
            `📩 YANGI TRANSFER TAKLIFI\n\n⚽ ${data.playerName}\n🏟 Xaridor: ${offer?.buyerClub ?? "Klub"}\n💰 Taklif: ${transferMoney(Math.round(amount))}`,
            new InlineKeyboard()
              .text("✅ Qabul qilish", `ia:${result.offerId}`)
              .text("❌ Rad etish", `ir:${result.offerId}`)
              .row()
              .text("💬 Qarshi taklif", `ic:${result.offerId}`)
          );
        }
        const text =
          result.status === "ACCEPTED"
            ? `✅ ${data.playerName} transferi yakunlandi!`
            : result.status === "COUNTERED"
            ? `🤝 Qarshi taklif: ${transferMoney(result.counterAmount!)}`
            : result.status === "PENDING"
            ? "⏳ Taklif klub murabbiyiga yuborildi."
            : "❌ Taklif rad etildi.";
        await context.reply(text, {
          reply_markup: new InlineKeyboard().text("← Transfer markazi", `tr:${data.clubId}`),
        });
      }
    } catch (error: any) {
      logger.warn({ event: "transfer_input_failed", err: error }, "Transfer input failed");
      await context.reply("Transfer amalga oshmadi: budjet, tarkib limiti yoki futbolchi holatini tekshiring.");
    }
  });
  bot.on("message:text",async(context,next)=>{if(!context.from)return next();if(!privateLeagueJoinPending.delete(context.from.id))return next();const code=context.message.text.trim().toUpperCase();if(!/^[A-Z0-9]{8}$/.test(code)){await context.reply("Kod 8 ta harf yoki raqamdan iborat bo‘lishi kerak. Qaytadan “Kod bilan qo‘shilish” ni bosing.");return;}const privateLeague=await leagues.privateLeagueByCode(code);if(!privateLeague){await context.reply("Bunday private liga kodi topilmadi.");return;}const clubs=await leagues.listPrivateAvailableClubs(privateLeague.leagueId);await context.reply(`🔒 PRIVATE LIGA · ${code}\n\nKlub tanlang:`,{reply_markup:privateClubKeyboard(clubs,code,0)});});

  bot.callbackQuery("join", async (context) => {
    await context.answerCallbackQuery();
    await showCompetitions(context);
  });

  bot.callbackQuery("pv",async context=>{if(!context.from)return;await context.answerCallbackQuery();const competitions=await leagues.listCompetitions(),kb=new InlineKeyboard();for(const competition of competitions)kb.text(`🔒 ${competition.name}`,`pc:${competition.id}`).row();kb.text("← Ligalar","join");await editOrReply(context,"🔒 PRIVATE LIGA YARATISH\n\nChempionatni tanlang. Keyin sizga do‘stlaringizga yuboriladigan 8 belgili taklif kodi beriladi:",kb);});
  bot.callbackQuery(/^pc:([0-9a-f-]{36})$/,async context=>{if(!context.from)return;await context.answerCallbackQuery({text:"Private liga yaratilmoqda…"});const user=await getContextUser(context);try{const league=await leagues.createPrivateLeague(user.id,context.match[1]!);await editOrReply(context,`✅ PRIVATE LIGA TAYYOR\n\n🔑 Taklif kodi: ${league.inviteCode}\n\nKodni do‘stlaringizga yuboring. Ular “Kod bilan qo‘shilish” bo‘limida yozadi. Endi o‘zingiz klub tanlang:`,privateClubKeyboard(await leagues.listPrivateAvailableClubs(league.leagueId),league.inviteCode,0));}catch(error){logger.warn({event:"private_league_create_failed",err:error},"Private league create failed");await context.reply("Private liga yaratilmadi. Keyinroq qayta urinib ko‘ring.");}});
  bot.callbackQuery("pj",async context=>{if(!context.from)return;privateLeagueJoinPending.add(context.from.id);await context.answerCallbackQuery();await editOrReply(context,"🔑 PRIVATE LIGAGA QO‘SHILISH\n\nDo‘stingiz yuborgan 8 belgili taklif kodini bitta xabar qilib yozing:",new InlineKeyboard().text("← Ligalar","join"));});
  const privateClubKeyboard=(clubs:AvailableClub[],code:string,page:number):InlineKeyboard=>{const kb=new InlineKeyboard();for(const club of clubs.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE))kb.text(`⚽ ${club.clubName}`,`pcf:${club.leagueClubId}:${code}`).row();if(page>0)kb.text("← Oldingi",`ppi:${code}:${page-1}`);if((page+1)*PAGE_SIZE<clubs.length)kb.text("Keyingi →",`ppi:${code}:${page+1}`);if(page>0||(page+1)*PAGE_SIZE<clubs.length)kb.row();return kb.text("← Ligalar","join");};
  bot.callbackQuery(/^ppi:([A-Z0-9]{8}):(\d+)$/,async context=>{await context.answerCallbackQuery();const privateLeague=await leagues.privateLeagueByCode(context.match[1]!);if(!privateLeague)return;await editOrReply(context,"⚽ PRIVATE LIGADA KLUB TANLANG:",privateClubKeyboard(await leagues.listPrivateAvailableClubs(privateLeague.leagueId),privateLeague.inviteCode,Number(context.match[2])));});
  bot.callbackQuery(/^pcf:([0-9a-f-]{36}):([A-Z0-9]{8})$/,async context=>{await context.answerCallbackQuery();const clubId=context.match[1]!,code=context.match[2]!;await editOrReply(context,"⚽ Shu klubni private ligada boshqarishni tasdiqlaysizmi?",new InlineKeyboard().text("✅ Tasdiqlash",`pcl:${clubId}:${code}`).row().text("← Orqaga",`ppi:${code}:0`));});
  bot.callbackQuery(/^pcl:([0-9a-f-]{36}):([A-Z0-9]{8})$/,async context=>{if(!context.from)return;await context.answerCallbackQuery({text:"Klub biriktirilmoqda…"});const user=await getContextUser(context);try{const result=await leagues.claimPrivateClub(user.id,context.match[2]!,context.match[1]!);const club=(await getContextManagedClubs(context,user.id)).find(item=>item.leagueClubId===result.leagueClubId);if(club)await showDashboard(context,club);}catch(error){logger.warn({event:"private_club_claim_failed",err:error},"Private club claim failed");await context.reply("Klub band bo‘lib qolgan yoki taklif kodi yaroqsiz.");}});

  bot.callbackQuery(/^cmp:([0-9a-f-]{36})$/, async (context) => {
    await context.answerCallbackQuery();
    const competitionId = context.match[1]!;
    const leagueList = await leagues.listJoinableLeagues(competitionId);
    if (leagueList.length === 0) {
      await editOrReply(context, "<i>Hozir bo‘sh public liga yo‘q. Keyinroq qayta urinib ko‘ring.</i>", new InlineKeyboard().text("↩️ Orqaga", "join"));
      return;
    }
    const keyboard = new InlineKeyboard();
    for (const league of leagueList) keyboard.text(`${league.name} · ${league.availableClubs} klub`, `lg:${league.id}:0`).row();
    keyboard.text("↩️ Orqaga", "join");
    await editOrReply(context, "🏟 <b>OCHIQ LIGALAR</b>\n\n<i>Klub olish uchun ligani tanlang:</i>", keyboard);
  });

  bot.callbackQuery(/^lg:([0-9a-f-]{36}):(\d+)$/, async (context) => {
    await context.answerCallbackQuery();
    const leagueId = context.match[1]!;
    const requestedPage = Number(context.match[2]);
    const clubs = await leagues.listAvailableClubs(leagueId);
    if (clubs.length === 0) {
      await editOrReply(context, "<i>Bu ligadagi barcha klublar band bo‘ldi.</i>", new InlineKeyboard().text("↩️ Orqaga", "join"));
      return;
    }
    const lastPage = Math.max(0, Math.ceil(clubs.length / PAGE_SIZE) - 1);
    const page = Math.min(requestedPage, lastPage);
    await editOrReply(context, `<b>Klub tanlang</b> (${clubs.length} ta mavjud):`, clubListKeyboard(clubs, leagueId, page));
  });

  bot.callbackQuery(/^cf:([0-9a-f-]{36})$/, async (context) => {
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const managed = await getContextManagedClubs(context, user.id);
    if (managed.length >= 2) {
      await editOrReply(
        context,
        "❌ <b>Turnir limiti to‘lgan</b>\n\n<i>Siz allaqachon maksimal 2 ta turnirda ishtirok etmoqdasiz. Yangi klub tanlash uchun avval mavjud ligalaringizdan biridan chiqing.</i>",
        new InlineKeyboard().text("🏆 Ligalar", "menu:leagues")
      );
      return;
    }

    const leagueClubId = context.match[1]!;
    const club = await leagues.getAvailableClub(leagueClubId);
    if (!club) {
      await editOrReply(context, "<i>Bu klub endi mavjud emas. Ro‘yxatdan boshqa klub tanlang.</i>", new InlineKeyboard().text("↩️ Orqaga", "join"));
      return;
    }
    const keyboard = new InlineKeyboard().text("✅ Tasdiqlash", `cl:${club.leagueClubId}`).row().text("↩️ Orqaga", "join");
    await editOrReply(context, `<b>${escapeHtml(club.clubName)}</b> klubini boshqarishni tasdiqlaysizmi?\n\n<i>Klubning mavjud holati saqlanadi.</i>`, keyboard);
  });

  bot.callbackQuery(/^cl:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Klub tekshirilmoqda…" });
    const user = await getContextUser(context);
    try {
      const result = await leagues.claimClub(user.id, context.match[1]!);
      logger.info({ event: "club_claimed", userId: user.id, leagueClubId: result.leagueClubId }, "Club claimed");
      delete (context as any).managedClubs;
      const club = (await leagues.listManagedClubs(user.id)).find((item) => item.leagueClubId === result.leagueClubId);
      if (!club) throw new Error("CLAIMED_CLUB_NOT_FOUND");
      await showDashboard(context, club);
    } catch (error: unknown) {
      logger.warn({ event: "club_claim_failed", err: error, userId: user.id }, "Club claim failed");
      await editOrReply(context, claimErrorMessage(error), new InlineKeyboard().text("↩️ Orqaga", "join"));
    }
  });

  bot.callbackQuery(/^lx:([0-9a-f-]{36})$/, async (context) => {
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const leagueClubId = context.match[1]!;
    const clubs = await leagues.listManagedClubs(user.id);
    const club = clubs.find((c) => c.leagueClubId === leagueClubId);
    if (!club) {
      await editOrReply(context, "<i>Klub topilmadi yoki sizga tegishli emas.</i>", new InlineKeyboard().text("↩️ Orqaga", "menu:leagues"));
      return;
    }

    const isPending = club.status === "OPEN";
    const statusNote = isPending
      ? "• Ushbu liga hali boshlanmagan (OPEN). Chiqsangiz, klub darhol boshqa managerlar uchun bo‘shaydi."
      : "• Ushbu liga allaqachon FAOL (ACTIVE). Chiqsangiz, klub AI boshqaruviga o‘tkaziladi (tarkib, ochkolar va byudjet saqlanadi). Siz ushbu mavsumda bu ligaga qayta kira olmaysiz.";

    const text = [
      `⚠️ <b>Ligadan chiqishni tasdiqlaysizmi?</b>`,
      "",
      `🏟 Klub: <b>${escapeHtml(club.clubName)}</b>`,
      `🏆 Liga: <i>${escapeHtml(club.leagueName)}</i>`,
      "",
      statusNote,
      "",
      `<i>Rostdan ham ushbu ligani tark etmoqchimisiz?</i>`,
    ].join("\n");

    const keyboard = new InlineKeyboard()
      .text("✅ Ha, chiqish", `lxc:${club.leagueClubId}`)
      .row()
      .text("❌ Bekor qilish", `db:${club.leagueClubId}`);

    await editOrReply(context, text, keyboard);
  });

  bot.callbackQuery(/^lxc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Ligadan chiqilmoqda…" });
    const user = await getContextUser(context);
    const leagueClubId = context.match[1]!;
    try {
      const result = await leagues.exitLeagueClub(user.id, leagueClubId);
      logger.info({ event: "league_exited", userId: user.id, leagueClubId, result }, "User exited league");
      delete (context as any).managedClubs;

      const message = [
        "✅ <b>Siz ligadan muvaffaqiyatli chiqdingiz!</b>",
        "",
        `🏟 Klub: <b>${escapeHtml(result.clubName)}</b>`,
        `🏆 Liga: <i>${escapeHtml(result.leagueName)}</i>`,
        "",
        result.leagueStatus === "OPEN"
          ? "<i>Klub boshqa managerlar uchun bo‘shatildi.</i>"
          : "<i>Klub AI boshqaruviga o‘tkazildi.</i>",
      ].join("\n");

      const keyboard = new InlineKeyboard().text("🏆 Ligalar ro‘yxati", "menu:leagues");
      await editOrReply(context, message, keyboard);
    } catch (error: unknown) {
      logger.warn({ event: "league_exit_failed", err: error, userId: user.id }, "League exit failed");
      await editOrReply(
        context,
        "❌ <b>Xatolik yuz berdi</b>\n<i>Ligadan chiqishda xatolik yuz berdi yoki ruxsat berilmadi.</i>",
        new InlineKeyboard().text("↩️ Orqaga", "menu:leagues")
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
    const leagueClubId = context.match[1]!;
    const club = (await getContextManagedClubs(context, user.id)).find((item) => item.leagueClubId === leagueClubId);
    if (!club) {
      await context.reply("Bu klub sizga tegishli emas.");
      return;
    }
    const players = await squads.listOwnedClubSquad(user.id, leagueClubId);
    await editOrReply(
      context,
      formatSquad(club.clubName, players),
      new InlineKeyboard()
        .text("🔥 Asosiy XI", `xi:${leagueClubId}`)
        .row()
        .text("🧠 Taktika", `tc:${leagueClubId}`)
        .text("↩️ Orqaga", `db:${leagueClubId}`),
    );
  });

  bot.callbackQuery(/^mt:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const leagueClubId = context.match[1]!;
    const upcoming = await fixtures.listUpcoming(user.id, leagueClubId);
    await editOrReply(
      context,
      formatUpcomingFixtures(upcoming),
      new InlineKeyboard()
        .text("⚽ Natijalar", `rs:${leagueClubId}`)
        .text("📊 Liga jadvali", `tb:${leagueClubId}`)
        .row()
        .text("↩️ Orqaga", `db:${leagueClubId}`)
    );
  });

  bot.callbackQuery(/^rs:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const club = context.match[1]!;
    await editOrReply(
      context,
      formatResults(await matches.history(user.id, club)),
      new InlineKeyboard()
        .text("📅 Keyingi o‘yinlar", `mt:${club}`)
        .row()
        .text("↩️ Orqaga", `db:${club}`)
    );
  });

  bot.callbackQuery(/^tb:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const club = context.match[1]!;
    const clubs = await getContextManagedClubs(context, user.id);
    const clubObj = clubs.find((c) => c.leagueClubId === club);
    const leagueTitle = clubObj?.competitionName ? `${clubObj.competitionName.toUpperCase()} — JADVAL` : "LALIGA — JADVAL";
    await editOrReply(
      context,
      formatTable(await matches.table(user.id, club), clubObj?.clubName, leagueTitle),
      new InlineKeyboard()
        .text("🥅 To‘purarlar", `sc:${club}`)
        .text("🎯 Assistentlar", `asst:${club}`)
        .row()
        .text("↩️ Orqaga", `db:${club}`)
    );
  });

  bot.callbackQuery(/^sc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const club = context.match[1]!;
    await editOrReply(
      context,
      formatLeaders("TO‘PURARLAR", await matches.leaders(user.id, club, "goals"), "gol"),
      new InlineKeyboard()
        .text("🎯 Assistentlar", `asst:${club}`)
        .text("📊 Liga jadvali", `tb:${club}`)
        .row()
        .text("↩️ Orqaga", `db:${club}`)
    );
  });

  bot.callbackQuery(/^asst:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const club = context.match[1]!;
    await editOrReply(
      context,
      formatLeaders("ASSISTLAR", await matches.leaders(user.id, club, "assists"), "assist"),
      new InlineKeyboard()
        .text("🥅 To‘purarlar", `sc:${club}`)
        .text("📊 Liga jadvali", `tb:${club}`)
        .row()
        .text("↩️ Orqaga", `db:${club}`)
    );
  });

  bot.callbackQuery(/^fn:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const club = context.match[1]!;
    await editOrReply(
      context,
      formatFinances(await matches.finances(user.id, club)),
      new InlineKeyboard()
        .text("💰 Homiylar", `sp:${club}`)
        .row()
        .text("↩️ Orqaga", `db:${club}`)
    );
  });

  bot.callbackQuery(/^sp:([0-9a-f-]{36})$/, async (context) => {
    await context.answerCallbackQuery();
    const club = context.match[1]!;
    const rows = await progression.sponsors();
    const keyboard = new InlineKeyboard();
    for (const s of rows) {
      keyboard.text(`${s.name} · ${transferMoney(s.payment)}`, `sa:${s.id}`).row();
    }
    keyboard.text("↩️ Orqaga", `fn:${club}`);
    await editOrReply(context, formatSponsors(rows), keyboard);
  });

  bot.callbackQuery(/^sa:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const club = (await getContextManagedClubs(context, user.id))[0]?.leagueClubId;
    const sponsor = context.match[1]!;
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
        eligible
          ? "✅ <b>Homiy shartnomasi faol!</b>\n<i>Kanal a’zoligi tasdiqlandi.</i>"
          : "⚠️ <b>Homiy tanlandi</b>\n<i>Kanal a’zoligi tasdiqlanmadi. Mukofot olish uchun kanalga a’zo bo‘ling.</i>",
        { parse_mode: "HTML" }
      );
    } else {
      await context.reply("✅ <b>Homiy shartnomasi faol qilindi.</b>", { parse_mode: "HTML" });
    }
  });

  const tacticKeyboard = (clubId: string, tactic: Tactic): InlineKeyboard => new InlineKeyboard()
    .text(`🧩 Formation: ${tactic.formationName}`, `fm:${clubId}`).row()
    .text(`🎯 Mentalitet: ${footballTerm(tactic.mentality)} [✅]`, `cy:${clubId}:mentality`).row()
    .text(`⚡ Pressing: ${tactic.pressing}`, `tc:${clubId}`)
    .text("−10", `nu:${clubId}:pressing:-`).text("+10", `nu:${clubId}:pressing:+`).row()
    .text(`⏱ Temp: ${tactic.tempo}`, `tc:${clubId}`)
    .text("−10", `nu:${clubId}:tempo:-`).text("+10", `nu:${clubId}:tempo:+`).row()
    .text(`📏 Himoya: ${tactic.defensiveLine}`, `tc:${clubId}`)
    .text("−10", `nu:${clubId}:defensiveLine:-`).text("+10", `nu:${clubId}:defensiveLine:+`).row()
    .text(`↔️ Kenglik: ${tactic.width}`, `tc:${clubId}`)
    .text("−10", `nu:${clubId}:width:-`).text("+10", `nu:${clubId}:width:+`).row()
    .text(`🎯 Pas: ${footballTerm(tactic.passingStyle)} [✅]`, `cy:${clubId}:passingStyle`).row()
    .text(`⚔️ Hujum: ${footballTerm(tactic.attackFocus)} [✅]`, `cy:${clubId}:attackFocus`).row()
    .text(`🛡 Kurash: ${footballTerm(tactic.tackling)} [✅]`, `cy:${clubId}:tackling`).row()
    .text("🔥 Asosiy XI", `xi:${clubId}`).text("↩️ Orqaga", `db:${clubId}`);

  const showTactics = async (context: Context, userId: string, clubId: string): Promise<void> => {
    const tactic = await tactics.get(userId, clubId);
    await editOrReply(context, formatTactics(tactic), tacticKeyboard(clubId, tactic));
  };

  bot.callbackQuery(/^tc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return; await context.answerCallbackQuery();
    const user = await getContextUser(context); await showTactics(context, user.id, context.match[1]!);
  });
  bot.callbackQuery(/^fm:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return; await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubId = context.match[1]!;
    const currentTactic = await tactics.get(user.id, clubId);
    const keyboard = new InlineKeyboard();
    for (const formation of await tactics.listFormations()) {
      const isSelected = formation.name === currentTactic.formationName;
      keyboard.text(`${isSelected ? "✅ " : "📐 "}${formation.name}`, `fs:${clubId}:${formation.code}`).row();
    }
    keyboard.text("← Taktika", `tc:${clubId}`);
    await editOrReply(context, "📐 SXEMANI TANLANG\n\nMasalan, 4-3-3: 4 himoyachi, 3 yarim himoyachi va 3 hujumchi.", keyboard);
  });
  bot.callbackQuery(/^fs:([0-9a-f-]{36}):(\d+)$/, async (context) => {
    if (!context.from) return; await context.answerCallbackQuery({text:"Boshlang‘ich tarkib moslanmoqda…"});
    const user=await getContextUser(context);await tactics.autoSave(user.id,context.match[1]!,context.match[2]!);await showTactics(context,user.id,context.match[1]!);
  });
  const showStartingXi = async (context: Context, clubId: string, alertText?: string): Promise<void> => {
    const user = await getContextUser(context);
    const clubs = await getContextManagedClubs(context, user.id);
    const club = clubs.find((c) => c.leagueClubId === clubId);
    const clubName = club?.clubName ?? "Klub";
    const lineup = await tactics.lineup(user.id, clubId);

    const keyboard = new InlineKeyboard()
      .text("🔄 O‘yinchini almashtirish", `xsl:${clubId}`)
      .text("🤖 Avtomatik tanlash", `xa:${clubId}`)
      .row()
      .text("🧩 Formation", `fm:${clubId}`)
      .row()
      .text("↩️ Orqaga", `db:${clubId}`);

    const text = formatStartingXi(clubName, lineup.formation, lineup.players) + (alertText ? `\n\n${alertText}` : "");
    await editOrReply(context, text, keyboard);
  };

  bot.callbackQuery(/^xi:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    await showStartingXi(context, context.match[1]!);
  });

  bot.callbackQuery(/^xsl:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const clubId = context.match[1]!;
    const lineup = await tactics.lineup(user.id, clubId);
    const keyboard = new InlineKeyboard();

    let count = 0;
    for (const player of lineup.players) {
      keyboard.text(`${player.slotKey}: ${player.shortName}`, `xslot:${player.slotKey}:${clubId}`);
      count++;
      if (count % 2 === 0) keyboard.row();
    }
    if (count % 2 !== 0) keyboard.row();
    keyboard.text("← Asosiy XI", `xi:${clubId}`);

    await editOrReply(
      context,
      "🔄 Qaysi pozitsiyadagi futbolchini almashtirmoqchisiz?\n\nKerakli pozitsiyani tanlang:",
      keyboard,
    );
  });

  bot.callbackQuery(/^xslot:([A-Za-z0-9]+):([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const slotKey = context.match[1]!;
    const clubId = context.match[2]!;

    const [squad, lineup, tactic, formations] = await Promise.all([
      squads.listOwnedClubSquad(user.id, clubId),
      tactics.lineup(user.id, clubId),
      tactics.get(user.id, clubId),
      tactics.listFormations(),
    ]);

    const formation = formations.find((f) => f.code === tactic.formationCode);
    const slotDef = formation?.slots.find((s) => s.key === slotKey);
    const currentPick = lineup.players.find((p) => p.slotKey === slotKey);
    const slotPosition = slotDef?.position ?? currentPick?.slotPosition ?? "CM";

    const xiPlayerMap = new Map(lineup.players.map((p) => [p.clubPlayerId, p.slotKey]));

    const naturalMatches: SquadPlayer[] = [];
    const secondaryMatches: SquadPlayer[] = [];
    const otherPlayers: SquadPlayer[] = [];

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
      ...otherPlayers.sort((a, b) => b.overall - a.overall),
    ];

    const keyboard = new InlineKeyboard();
    for (const player of sortedCandidates) {
      const isCurrentInSlot = currentPick?.clubPlayerId === player.clubPlayerId;
      const inOtherSlotKey = xiPlayerMap.get(player.clubPlayerId);

      let icon = "▫️";
      if (player.primaryPosition === slotPosition) {
        icon = "✅";
      } else if (player.secondaryPosition === slotPosition) {
        icon = "🔹";
      }

      let status = "";
      if (isCurrentInSlot) {
        status = " (Hozirgi)";
      } else if (inOtherSlotKey) {
        status = ` (XI: ${inOtherSlotKey})`;
      }

      const label = `${icon} ${player.shortName} · ${player.primaryPosition} · ⭐${player.overall}${status}`;
      keyboard.text(label.slice(0, 40), `xpick:${slotKey}:${player.clubPlayerId}`).row();
    }

    keyboard.text("← Pozitsiyalar", `xsl:${clubId}`).text("← Asosiy XI", `xi:${clubId}`);

    const messageLines = [
      `🔄 [${slotKey}] POZITSIYASIGA FUTBOLCHI TANLANG`,
      `📍 Talab etilgan amplua: ${slotPosition} (${positionName(slotPosition)})`,
      `👤 Hozirgi: ${currentPick ? `${currentPick.shortName} (⭐${currentPick.overall})` : "Bo‘sh"}`,
      "",
      "Belgilar:",
      "✅ — Asosiy ampluasi mos",
      "🔹 — Ikkinchi ampluasi mos",
      "▫️ — Boshqa amplua",
      "Agar futbolchi boshqa slotda bo‘lsa, tanlansa o‘rni almashadi (swap).",
    ];

    await editOrReply(context, messageLines.join("\n"), keyboard);
  });

  bot.callbackQuery(/^xpick:([A-Za-z0-9]+):([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Tarkib yangilanmoqda…" });
    const user = await getContextUser(context);
    const slotKey = context.match[1]!;
    const clubPlayerId = context.match[2]!;

    const clubs = await getContextManagedClubs(context, user.id);
    if (!clubs.length) return;

    let targetClubId = clubs[0]!.leagueClubId;
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
    await showStartingXi(context, targetClubId, "✅ Tarkib muvaffaqiyatli saqlandi!");
  });

  bot.callbackQuery(/^xa:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Eng mos futbolchilar tanlanmoqda…" });
    const user = await getContextUser(context), clubId = context.match[1]!, tactic = await tactics.get(user.id, clubId);
    await tactics.autoSave(user.id, clubId, tactic.formationCode);
    await showStartingXi(context, clubId, "✅ Avtomatik tarkib saqlandi!");
  });
  bot.callbackQuery(/^nu:([0-9a-f-]{36}):(pressing|tempo|defensiveLine|width):([+-])$/,async context=>{
    if(!context.from)return;const user=await getContextUser(context);const club=context.match[1]!,field=context.match[2] as "pressing"|"tempo"|"defensiveLine"|"width";const current=await tactics.get(user.id,club);const value=Math.max(0,Math.min(100,current[field]+(context.match[3]==="+"?10:-10)));await tactics.update(user.id,club,{[field]:value});await context.answerCallbackQuery({text:"✅ Saqlandi"});await showTactics(context,user.id,club);
  });
  bot.callbackQuery(/^cy:([0-9a-f-]{36}):(mentality|passingStyle|attackFocus|tackling)$/, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const club = context.match[1]!;
    const field = context.match[2] as "mentality" | "passingStyle" | "attackFocus" | "tackling";
    const current = await tactics.get(user.id, club);
    const options = {
      mentality: ["VERY_DEFENSIVE", "DEFENSIVE", "BALANCED", "ATTACKING", "VERY_ATTACKING"],
      passingStyle: ["SHORT", "MIXED", "DIRECT"],
      attackFocus: ["LEFT", "CENTRE", "RIGHT", "BOTH_WINGS", "MIXED"],
      tackling: ["CAUTIOUS", "NORMAL", "AGGRESSIVE"],
    }[field];
    const next = options[(options.indexOf(current[field]) + 1) % options.length]!;
    await tactics.update(user.id, club, { [field]: next });
    await context.answerCallbackQuery({ text: "✅ Saqlandi" });
    await showTactics(context, user.id, club);
  });

  bot.callbackQuery(/^soon:/, async (context) => {
    await context.answerCallbackQuery({ text: "Bu bo‘lim keyingi PHASEda ochiladi." });
  });

  bot.catch(async ({ error, ctx }) => {
    logger.error({ event: "telegram_update_failed", err: error, updateId: ctx.update.update_id }, "Telegram update failed");
    try {
      await ctx.reply("Kutilmagan xato yuz berdi. Iltimos, birozdan keyin qayta urinib ko‘ring.");
    } catch (replyError: unknown) {
      logger.error({ event: "telegram_error_reply_failed", err: replyError, updateId: ctx.update.update_id }, "Could not send error reply");
    }
  });

  return bot;
}
