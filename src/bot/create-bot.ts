import { Bot, InlineKeyboard, type Context } from "grammy";
import type { UserRepository, RegisteredUser } from "../users/user.repository.js";
import type { Logger } from "../lib/logger.js";
import type { RequestProfiler } from "../lib/profiler.js";
import type { LeagueRepository } from "../leagues/league.repository.js";
import type { AvailableClub, ManagedClub } from "../leagues/types.js";
import { claimErrorMessage, formatClubDashboard } from "../leagues/presentation.js";
import type { SquadRepository } from "../squads/squad.repository.js";
import { formatSquad } from "../squads/presentation.js";
import type { TacticsRepository, Tactic } from "../tactics/tactics.repository.js";
import { formatLineup, formatTactics, positionName } from "../tactics/presentation.js";
import type { SquadPlayer } from "../squads/squad.repository.js";
import type { FixtureRepository } from "../fixtures/fixture.repository.js";
import { formatFixtureLine, formatUpcomingFixtures } from "../fixtures/presentation.js";
import type { MatchRepository } from "../matches/match.repository.js";
import { formatFinances, formatLeaders, formatResults, formatTable } from "../matches/presentation.js";
import type { TransferRepository } from "../transfers/transfer.repository.js";
import { formatListing, formatMarket, transferMoney } from "../transfers/presentation.js";
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
    try { await context.editMessageText(text, { reply_markup: keyboard }); }
    catch (error: unknown) {
      if (!(error instanceof Error) || !error.message.includes("message is not modified")) throw error;
    }
  } else {
    await context.reply(text, { reply_markup: keyboard });
  }
}

function clubListKeyboard(clubs: AvailableClub[], leagueId: string, page: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const club of clubs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
    keyboard.text(club.clubName, `cf:${club.leagueClubId}`).row();
  }
  if (page > 0) keyboard.text("← Oldingi", `lg:${leagueId}:${page - 1}`);
  if ((page + 1) * PAGE_SIZE < clubs.length) keyboard.text("Keyingi →", `lg:${leagueId}:${page + 1}`);
  if (page > 0 || (page + 1) * PAGE_SIZE < clubs.length) keyboard.row();
  return keyboard.text("← Competitionlar", "join");
}

function dashboardKeyboard(leagueClubId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("👥 Tarkib", `sq:${leagueClubId}`).text("🧠 Taktika", `tc:${leagueClubId}`).row()
    .text("🔄 Transferlar", `tr:${leagueClubId}`).text("💰 Moliya", `fn:${leagueClubId}`).row()
    .text("⚽ Uchrashuvlar", `mt:${leagueClubId}`).text("🏆 Liga jadvali", `tb:${leagueClubId}`).row()
    .text("🥅 To‘purarlar", `sc:${leagueClubId}`).text("🎯 Assistentlar", `asst:${leagueClubId}`);
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

  type LineupDraft={clubId:string;formationCode:string;formationName:string;slots:Array<{key:string;position:string}>;players:SquadPlayer[];picks:Array<{slotKey:string;clubPlayerId:string}>};
  const lineupDrafts=new Map<number,LineupDraft>();
  const transferClubSelection=new Map<number,string>();
  const privateLeagueJoinPending=new Set<number>();
  type TransferInput={mode:"SELL"|"OFFER";clubId:string;clubPlayerId:string;playerName:string;minimum:number}|{mode:"COUNTER";clubId:string;offerId:string;playerName:string;minimum:number};
  const transferInputs=new Map<number,TransferInput>();
  type TransferBrowse={clubId:string;players:Map<string,{clubPlayerId:string;name:string;clubName:string;position:string;overall:number;marketValue:number}>};
  const saleBrowses=new Map<number,TransferBrowse>();
  const targetBrowses=new Map<number,TransferBrowse>();
  const targetClubBrowses=new Map<number,{clubId:string;clubs:Map<string,string>}>();
  const incomingOfferClubs=new Map<number,string>();
  const sendUpdate=async(telegramId:number|null,text:string,keyboard:InlineKeyboard):Promise<void>=>{if(!telegramId)return;try{await bot.api.sendMessage(telegramId,text,{reply_markup:keyboard});}catch(error){logger.warn({event:"transfer_notification_failed",err:error},"Transfer notification failed");}};

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

  const showCompetitions = async (context: Context): Promise<void> => {
    const profiler: RequestProfiler | undefined = (context as any).profiler;
    const competitions = profiler
      ? await profiler.time("league_club_query", () => leagues.listCompetitions())
      : await leagues.listCompetitions();
    const keyboard = new InlineKeyboard();
    for (const competition of competitions) keyboard.text(competition.name, `cmp:${competition.id}`).row();
    keyboard.text("🔒 Private liga yaratish", "pv").text("🔑 Kod bilan qo‘shilish", "pj");
    await editOrReply(context, "🌍 GLOBAL LIGALAR\n\nChempionatni tanlang. Global ligalar bot tomonidan belgilangan vaqtlarda ochiladi.\n\nPrivate ligada esa faqat taklif kodi bilan do‘stlaringiz qo‘shila oladi:", keyboard);
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

    logger.info({ event: "user_registered", userId: user.id, telegramId: user.telegram_id }, "User registered or updated");

    const welcomeLines = [
      `⚽ Xush kelibsiz, ${telegramUser.first_name}!`,
      "",
      "OFM Game’da sevimli klubingizni boshqaring: tarkib tuzing, taktika tanlang, transfer qiling va chempionlik uchun kurashing! 🏆",
    ];
    if (managedClubs.length === 0) {
      welcomeLines.push("", "💡 Boshlash uchun ligaga qo‘shiling 👇");
    }

    const inlineMarkup = new InlineKeyboard()
      .text("⚽ Klubim", "home:club")
      .text("🏆 Ligaga qo‘shilish", "join")
      .row()
      .text("👤 Profilim", "pf:0");

    const mainKeyboard = createMainKeyboard(isAdmin(telegramUser.id));

    // Send both messages concurrently to eliminate sequential waiting
    await Promise.all([
      context.reply(welcomeLines.join("\n"), { reply_markup: inlineMarkup }),
      context.reply("Asosiy menyu doimo quyida 👇", { reply_markup: mainKeyboard }),
    ]);
  });

  bot.hears(MAIN_MENU.club, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const profiler: RequestProfiler | undefined = (context as any).profiler;
    const clubs = profiler
      ? await profiler.time("league_club_query", () => leagues.listManagedClubs(user.id))
      : await leagues.listManagedClubs(user.id);
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
    const profiler: RequestProfiler | undefined = (context as any).profiler;
    const clubs = profiler
      ? await profiler.time("league_club_query", () => leagues.listManagedClubs(user.id))
      : await leagues.listManagedClubs(user.id);
    if (!clubs.length) return showCompetitions(context);
    return showDashboard(context, clubs[0]!);
  });

  bot.hears(MAIN_MENU.leagues, showCompetitions);

  bot.hears(MAIN_MENU.profile, async (context) => {
    if (!context.from) return;
    const user = await getContextUser(context);
    const profiler: RequestProfiler | undefined = (context as any).profiler;
    const [profile, clubs] = profiler
      ? await Promise.all([
          profiler.time("manager_profile", () => progression.profile(user.id)),
          profiler.time("league_club_query", () => leagues.listManagedClubs(user.id)),
        ])
      : await Promise.all([progression.profile(user.id), leagues.listManagedClubs(user.id)]);
    await context.reply(formatProfile(profile, clubs), { reply_markup: new InlineKeyboard().text("🏅 Global reyting", "lb:0") });
  });

  bot.callbackQuery("lb:0", async (context) => {
    await context.answerCallbackQuery();
    const profiler: RequestProfiler | undefined = (context as any).profiler;
    const leaders = profiler
      ? await profiler.time("manager_profile", () => progression.leaderboard())
      : await progression.leaderboard();
    await editOrReply(context, formatLeaderboard(leaders), new InlineKeyboard().text("← Profil", "pf:0"));
  });

  bot.callbackQuery("pf:0", async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await getContextUser(context);
    const profiler: RequestProfiler | undefined = (context as any).profiler;
    const profile = profiler
      ? await profiler.time("manager_profile", () => progression.profile(user.id))
      : await progression.profile(user.id);
    await editOrReply(context, formatProfile(profile), new InlineKeyboard().text("Global reyting", "lb:0"));
  });

  const adminHome = async (context: Context) => {
    await editOrReply(context, formatAdminStats(await admin.stats()), new InlineKeyboard().text("Users", "ad:u").text("Sponsors", "ad:s").row().text("Audit log", "ad:a").text("Refresh", "ad:h"));
  };
  bot.hears(MAIN_MENU.admin, async (context) => {
    if (!context.from || !isAdmin(context.from.id)) return;
    await adminHome(context);
  });
  bot.callbackQuery(/^ad:([usah])$/,async context=>{if(!context.from||!isAdmin(context.from.id))return context.answerCallbackQuery({text:"Ruxsat yo‘q"});await context.answerCallbackQuery();const section=context.match[1];if(section==='h')return adminHome(context);if(section==='u'){const rows=await admin.users();const kb=new InlineKeyboard();for(const u of rows){if(u.telegramId===context.from.id)continue;kb.text(`${u.blocked?'✅ Unblock':'⛔ Block'} ${u.username?`@${u.username}`:u.name}`,`${u.blocked?'au':'ab'}:${u.id}`).row();}kb.text("← Admin","ad:h");return editOrReply(context,formatAdminUsers(rows),kb);}if(section==='s'){const rows=await admin.sponsors();const kb=new InlineKeyboard();for(const s of rows)kb.text(`${s.active?'⏸':'▶️'} ${s.name}`,`as:${s.id}:${s.active?'0':'1'}`).row();kb.text("← Admin","ad:h");return editOrReply(context,formatAdminSponsors(rows),kb);}const rows=await admin.audit();return editOrReply(context,["AUDIT LOG","",...(rows.length?rows.map((r:any)=>`${r.action} · ${r.target_type}\n${new Date(r.created_at).toLocaleString('uz-UZ')}`):["Hozircha audit yozuvlari yo‘q."])].join('\n'),new InlineKeyboard().text("← Admin","ad:h"));});
  bot.callbackQuery(/^(ab|au):([0-9a-f-]{36})$/,async context=>{if(!context.from||!isAdmin(context.from.id))return;await context.answerCallbackQuery();const actor=await users.upsertFromTelegram(context.from);await admin.setBlocked(actor.id,context.match[2]!,context.match[1]==='ab');await context.reply("User holati yangilandi.");});
  bot.callbackQuery(/^as:([0-9a-f-]{36}):([01])$/,async context=>{if(!context.from||!isAdmin(context.from.id))return;await context.answerCallbackQuery();const actor=await users.upsertFromTelegram(context.from);await admin.setSponsor(actor.id,context.match[1]!,context.match[2]==='1');await context.reply("Sponsor holati yangilandi.");});

  const showMarket=async(context:Context,clubId:string,page:number,group="ALL"):Promise<void>=>{if(!context.from)return;transferClubSelection.set(context.from.id,clubId);const user=await users.upsertFromTelegram(context.from),items=await transfers.market(user.id,clubId,page,8,group);const keyboard=new InlineKeyboard();for(const item of items)keyboard.text(`⚽ ${item.name} · ⭐${item.overall} · ${transferMoney(item.askingPrice)}`,`gb:${item.listingId}`).row();keyboard.text("🌟 Barchasi",`gm:${clubId}:0:ALL`).text("🥅 Darvozabon",`gm:${clubId}:0:GK`).row().text("🛡 Himoyachi",`gm:${clubId}:0:DEF`).text("🧠 Yarimhimoya",`gm:${clubId}:0:MID`).row().text("⚡ Hujumchi",`gm:${clubId}:0:ATT`);if(page>0)keyboard.row().text("← Oldingi",`gm:${clubId}:${page-1}:${group}`);if(items.length===8)keyboard.text("Keyingi →",`gm:${clubId}:${page+1}:${group}`);keyboard.row().text("← Transfer markazi",`tr:${clubId}`);await editOrReply(context,`🌍 BOZOR · ${group==="ALL"?"ENG KUCHLILAR":group==="GK"?"DARVOZABONLAR":group==="DEF"?"HIMOYACHILAR":group==="MID"?"YARIMHIMOYACHILAR":"HUJUMCHILAR"}\n\n${formatMarket(items).split("\n\n")[1]??"Hozir faol listing yo‘q."}`,keyboard);};
  bot.callbackQuery(/^tr:([0-9a-f-]{36})$/,async context=>{if(!context.from)return;await context.answerCallbackQuery();const user=await users.upsertFromTelegram(context.from),clubId=context.match[1]!;if(!(await leagues.listManagedClubs(user.id)).some(club=>club.leagueClubId===clubId))return;await editOrReply(context,"🔄 TRANSFER MARKAZI\n\nBu bo‘lim faqat tanlangan klubingiz uchun ishlaydi. Xarid, sotuv va takliflar shu klub budjetiga bog‘langan.",new InlineKeyboard().text("🌍 Bozor",`gm:${clubId}:0`).text("🔎 Ligadan izlash",`tf:${clubId}:0`).row().text("📤 Sotuvga qo‘yish",`ts:${clubId}`).text("📩 Kelgan takliflar",`io:${clubId}`).row().text("← Klub",`db:${clubId}`));});
  bot.callbackQuery(/^ts:([0-9a-f-]{36})$/,async context=>{if(!context.from)return;await context.answerCallbackQuery();const user=await users.upsertFromTelegram(context.from),clubId=context.match[1]!,players=await transfers.saleCandidates(user.id,clubId),kb=new InlineKeyboard(),browse:TransferBrowse={clubId,players:new Map()};for(const [index,player]of players.slice(0,20).entries()){browse.players.set(String(index),player);kb.text(`${player.name} · ${player.position} · ⭐${player.overall}`,`tl:${index}`).row();}saleBrowses.set(context.from.id,browse);kb.text("← Transfer markazi",`tr:${clubId}`);await editOrReply(context,players.length?"📤 FUTBOLCHINI SOTUVGA QO‘YISH\n\nNarxini belgilash uchun futbolchini tanlang:":"Sotuvga qo‘yish mumkin bo‘lgan futbolchi yo‘q.",kb);});
  bot.callbackQuery(/^tl:(\d+)$/,async context=>{if(!context.from)return;const browse=saleBrowses.get(context.from.id),player=browse?.players.get(context.match[1]!);if(!browse||!player)return context.answerCallbackQuery({text:"Ro‘yxat eskirgan, qayta oching"});transferInputs.set(context.from.id,{mode:"SELL",clubId:browse.clubId,clubPlayerId:player.clubPlayerId,playerName:player.name,minimum:Math.max(100000,Math.round(player.marketValue*.5))});await context.answerCallbackQuery();await editOrReply(context,`💰 ${player.name} uchun sotuv narxini yuboring.\n\nMinimal narx: ${transferMoney(Math.max(100000,Math.round(player.marketValue*.5)))}\nMisol: 45M yoki 45000000`,new InlineKeyboard().text("← Bekor qilish",`ts:${browse.clubId}`));});
  bot.callbackQuery(/^tf:([0-9a-f-]{36}):(\d+)$/,async context=>{if(!context.from)return;await context.answerCallbackQuery();const user=await users.upsertFromTelegram(context.from),clubId=context.match[1]!,page=Number(context.match[2]),clubs=await transfers.leagueClubs(user.id,clubId),kb=new InlineKeyboard(),browse={clubId,clubs:new Map<string,string>()};for(const[index,club]of clubs.slice(page*10,(page+1)*10).entries()){browse.clubs.set(String(index),club.leagueClubId);kb.text(`🏟 ${club.clubName}`,`tk:${index}:0`).row();}targetClubBrowses.set(context.from.id,browse);if(page)kb.text("← Oldingi",`tf:${clubId}:${page-1}`);if((page+1)*10<clubs.length)kb.text("Keyingi →",`tf:${clubId}:${page+1}`);kb.row().text("← Transfer markazi",`tr:${clubId}`);await editOrReply(context,clubs.length?"🔎 LIGADAN IZLASH\n\nAvval raqib klubni tanlang, keyin uning barcha futbolchilaridan biriga taklif yuboring:":"Bu ligada raqib klublar topilmadi.",kb);});
  bot.callbackQuery(/^tk:(\d+):(\d+)$/,async context=>{if(!context.from)return;const clubs=targetClubBrowses.get(context.from.id),targetClubId=clubs?.clubs.get(context.match[1]!);if(!clubs||!targetClubId)return context.answerCallbackQuery({text:"Klublar ro‘yxati eskirgan, qayta oching"});await context.answerCallbackQuery();const user=await users.upsertFromTelegram(context.from),page=Number(context.match[2]),players=await transfers.clubTargets(user.id,clubs.clubId,targetClubId,page),kb=new InlineKeyboard(),browse:TransferBrowse={clubId:clubs.clubId,players:new Map()};for(const[index,player]of players.entries()){browse.players.set(String(index),player);kb.text(`${player.name} · ${player.position} · ⭐${player.overall}`,`to:${index}`).row();}targetBrowses.set(context.from.id,browse);if(page)kb.text("← Oldingi",`tk:${context.match[1]}:${page-1}`);if(players.length===25)kb.text("Keyingi →",`tk:${context.match[1]}:${page+1}`);kb.row().text("← Klublar",`tf:${clubs.clubId}:0`).text("← Transfer markazi",`tr:${clubs.clubId}`);await editOrReply(context,players.length?`🏟 ${players[0]!.clubName.toUpperCase()} FUTBOLCHILARI\n\nTaklif yuborish uchun futbolchini tanlang:`:"Bu klubda transferga taklif yuborish mumkin bo‘lgan futbolchi yo‘q.",kb);});
  bot.callbackQuery(/^to:(\d+)$/,async context=>{if(!context.from)return;const browse=targetBrowses.get(context.from.id),target=browse?.players.get(context.match[1]!);if(!browse||!target)return context.answerCallbackQuery({text:"Ro‘yxat eskirgan, qayta oching"});transferInputs.set(context.from.id,{mode:"OFFER",clubId:browse.clubId,clubPlayerId:target.clubPlayerId,playerName:target.name,minimum:Math.max(100000,Math.round(target.marketValue*.5))});await context.answerCallbackQuery();await editOrReply(context,`🤝 ${target.name} uchun taklif miqdorini yuboring.\n\nBozor qiymati: ${transferMoney(target.marketValue)}\nMinimal taklif: ${transferMoney(Math.max(100000,Math.round(target.marketValue*.5)))}\nMisol: 55M yoki 55000000`,new InlineKeyboard().text("← Futbolchilar",`tf:${browse.clubId}:0`));});
  bot.callbackQuery(/^io:([0-9a-f-]{36})$/,async context=>{if(!context.from)return;await context.answerCallbackQuery();const user=await users.upsertFromTelegram(context.from),clubId=context.match[1]!,offers=await transfers.incomingOffers(user.id,clubId),kb=new InlineKeyboard();incomingOfferClubs.set(context.from.id,clubId);for(const offer of offers)kb.text(`${offer.playerName} · ${offer.buyerClub} · ${transferMoney(offer.amount)}`,`iv:${offer.offerId}`).row();kb.text("← Transfer markazi",`tr:${clubId}`);await editOrReply(context,offers.length?"📩 KELGAN TAKLIFLAR\n\nTaklifni ochib qabul qiling yoki rad eting:":"📩 Hozircha sizning klubingizga kelgan faol taklif yo‘q.",kb);});
  bot.callbackQuery(/^iv:([0-9a-f-]{36})$/,async context=>{if(!context.from)return;const clubId=incomingOfferClubs.get(context.from.id);if(!clubId)return context.answerCallbackQuery({text:"Transfer markazini qayta oching"});const user=await users.upsertFromTelegram(context.from),offer=(await transfers.incomingOffers(user.id,clubId)).find(item=>item.offerId===context.match[1]);if(!offer)return context.answerCallbackQuery({text:"Taklif endi faol emas"});await context.answerCallbackQuery();await editOrReply(context,`📩 TAKLIF\n\n⚽ ${offer.playerName} · ${offer.position} · ⭐${offer.overall}\n🏟 Xaridor: ${offer.buyerClub}\n💰 Taklif: ${transferMoney(offer.amount)}\n⏳ Amal qiladi: ${new Date(offer.expiresAt).toLocaleString("uz-UZ")}`,new InlineKeyboard().text("✅ Qabul qilish",`ia:${offer.offerId}`).text("❌ Rad etish",`ir:${offer.offerId}`).row().text("💬 Qarshi taklif",`ic:${offer.offerId}`).row().text("← Takliflar",`io:${clubId}`));});
  bot.callbackQuery(/^ic:([0-9a-f-]{36})$/,async context=>{if(!context.from)return;const user=await users.upsertFromTelegram(context.from),offer=await transfers.notification(context.match[1]!);if(!offer||offer.sellerTelegramId!==context.from.id)return context.answerCallbackQuery({text:"Taklif endi faol emas"});transferInputs.set(context.from.id,{mode:"COUNTER",clubId:"",offerId:offer.offerId,playerName:offer.playerName,minimum:offer.amount+100000});await context.answerCallbackQuery();await editOrReply(context,`💬 ${offer.playerName} uchun qarshi taklif summasini yuboring.\n\nAsl taklif: ${transferMoney(offer.amount)}\nMinimal: ${transferMoney(offer.amount+100000)}`,new InlineKeyboard().text("← Taklif",`iv:${offer.offerId}`));});
  bot.callbackQuery(/^ac:([0-9a-f-]{36})$/,async context=>{if(!context.from)return;const user=await users.upsertFromTelegram(context.from),offer=await transfers.notification(context.match[1]!);if(!offer||offer.buyerTelegramId!==context.from.id)return context.answerCallbackQuery({text:"Taklif endi faol emas"});await context.answerCallbackQuery({text:"Transfer yakunlanmoqda…"});try{await transfers.acceptCounterOffer(user.id,offer.offerId);await sendUpdate(offer.sellerTelegramId,`✅ ${offer.playerName} bo‘yicha qarshi taklif qabul qilindi. Transfer yakunlandi.`,new InlineKeyboard());await editOrReply(context,`✅ ${offer.playerName} transferi yakunlandi.`,new InlineKeyboard());}catch{await context.reply("Qarshi taklif endi faol emas yoki budjet yetarli emas.");}});
  bot.callbackQuery(/^(ia|ir):([0-9a-f-]{36})$/,async context=>{if(!context.from)return;const user=await users.upsertFromTelegram(context.from),offer=await transfers.notification(context.match[2]!);if(!offer||offer.sellerTelegramId!==context.from.id)return context.answerCallbackQuery({text:"Taklif endi faol emas"});await context.answerCallbackQuery({text:"Taklif qayta ishlanmoqda…"});try{const accepted=context.match[1]==="ia",result=await transfers.respondToOffer(user.id,offer.offerId,accepted?"ACCEPT":"REJECT");await sendUpdate(offer.buyerTelegramId,accepted?`✅ ${offer.playerName} uchun ${transferMoney(offer.amount)} taklifingiz qabul qilindi. Transfer yakunlandi.`:`❌ ${offer.playerName} uchun taklifingiz rad etildi.`,new InlineKeyboard());await editOrReply(context,result==="ACCEPTED"?"✅ Transfer qabul qilindi. Futbolchi xaridor klubiga o‘tdi.":"❌ Taklif rad etildi.",new InlineKeyboard().text("← Transfer markazi",`tr:${offer.sellerClubId}`));}catch(error){logger.warn({event:"incoming_offer_response_failed",err:error},"Incoming offer response failed");await context.reply("Taklifni qayta ishlab bo‘lmadi. U muddatidan o‘tgan bo‘lishi mumkin.");}});
  bot.callbackQuery(/^gm:([0-9a-f-]{36}):(\d+)(?::(ALL|GK|DEF|MID|ATT))?$/,async context=>{await context.answerCallbackQuery();await showMarket(context,context.match[1]!,Number(context.match[2]),context.match[3]??"ALL");});
  bot.callbackQuery(/^gb:([0-9a-f-]{36})$/,async context=>{if(!context.from)return;await context.answerCallbackQuery();const clubId=transferClubSelection.get(context.from.id);if(!clubId)return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");const user=await users.upsertFromTelegram(context.from),item=await transfers.listing(user.id,clubId,context.match[1]!);if(!item)return editOrReply(context,"Bu futbolchi sizning ligangiz bozorida faol emas.",new InlineKeyboard().text("← Bozor",`gm:${clubId}:0`));await editOrReply(context,formatListing(item),new InlineKeyboard().text("Xaridni tasdiqlash",`gc:${item.listingId}`).row().text("← Bozor",`gm:${clubId}:0`));});
  bot.callbackQuery(/^gc:([0-9a-f-]{36})$/,async context=>{if(!context.from)return;await context.answerCallbackQuery({text:"Transfer tekshirilmoqda…"});const user=await users.upsertFromTelegram(context.from),clubId=transferClubSelection.get(context.from.id);if(!clubId)return context.reply("Transfer markaziga qaytib, klubni qayta tanlang.");try{const result=await transfers.buy(user.id,clubId,context.match[1]!);const msg=result.status==="ACCEPTED"?"✅ TRANSFER YAKUNLANDI\n\nFutbolchi klubingizga qo‘shildi.":result.status==="COUNTERED"?`🤝 AI qarshi taklifi: ${transferMoney(result.counterAmount!)}`:"❌ Taklif rad etildi.";await editOrReply(context,msg,new InlineKeyboard().text("← Bozor",`gm:${clubId}:0`).text("🏟 Klub",`db:${clubId}`));}catch(error){logger.warn({event:"transfer_failed",err:error},"Transfer failed");await context.reply("Transfer amalga oshmadi: budjet, tarkib limiti yoki listing holatini tekshiring.");}});
  bot.on("message:text",async(context,next)=>{if(!context.from)return next();const pending=transferInputs.get(context.from.id);if(!pending)return next();const raw=context.message.text.trim().replace(/\s/g,"").replace(",",".");const isMillions=raw.toLowerCase().endsWith("m"),amount=Number(isMillions?raw.slice(0,-1):raw)*(isMillions?1_000_000:1);if(!Number.isFinite(amount)||amount<pending.minimum){await context.reply(`Miqdor noto‘g‘ri. Kamida ${transferMoney(pending.minimum)} yuboring.`);return;}const user=await users.upsertFromTelegram(context.from);try{if(pending.mode==="SELL"){await transfers.listForSale(user.id,pending.clubId,pending.clubPlayerId,Math.round(amount));await context.reply(`✅ ${pending.playerName} ${transferMoney(Math.round(amount))} narxda transfer bozoriga qo‘yildi.`,{reply_markup:new InlineKeyboard().text("← Transfer markazi",`tr:${pending.clubId}`)});}else if(pending.mode==="COUNTER"){await transfers.counterOffer(user.id,pending.offerId,Math.round(amount));const offer=await transfers.notification(pending.offerId);await sendUpdate(offer?.buyerTelegramId??null,`💬 ${offer?.sellerClub??"Murabbiy"} ${pending.playerName} uchun qarshi taklif yubordi: ${transferMoney(Math.round(amount))}`,new InlineKeyboard().text("✅ Qarshi taklifni qabul qilish",`ac:${pending.offerId}`));await context.reply("✅ Qarshi taklif xaridor murabbiyiga yuborildi.");}else{const result=await transfers.offer(user.id,pending.clubId,pending.clubPlayerId,Math.round(amount));const offer=await transfers.notification(result.offerId);if(result.status==="PENDING")await sendUpdate(offer?.sellerTelegramId??null,`📩 YANGI TRANSFER TAKLIFI\n\n⚽ ${pending.playerName}\n🏟 Xaridor: ${offer?.buyerClub??"Klub"}\n💰 Taklif: ${transferMoney(Math.round(amount))}`,new InlineKeyboard().text("✅ Qabul qilish",`ia:${result.offerId}`).text("❌ Rad etish",`ir:${result.offerId}`).row().text("💬 Qarshi taklif",`ic:${result.offerId}`));const text=result.status==="ACCEPTED"?`✅ ${pending.playerName} transferi yakunlandi!`:result.status==="COUNTERED"?`🤝 Qarshi taklif: ${transferMoney(result.counterAmount!)}`:result.status==="PENDING"?"⏳ Taklif klub murabbiyiga yuborildi.":"❌ Taklif rad etildi.";await context.reply(text,{reply_markup:new InlineKeyboard().text("← Transfer markazi",`tr:${pending.clubId}`)});}transferInputs.delete(context.from.id);}catch(error){logger.warn({event:"transfer_input_failed",err:error},"Transfer input failed");await context.reply("Transfer amalga oshmadi: budjet, tarkib limiti yoki futbolchi holatini tekshiring.");}});
  bot.on("message:text",async(context,next)=>{if(!context.from)return next();if(!privateLeagueJoinPending.delete(context.from.id))return next();const code=context.message.text.trim().toUpperCase();if(!/^[A-Z0-9]{8}$/.test(code)){await context.reply("Kod 8 ta harf yoki raqamdan iborat bo‘lishi kerak. Qaytadan “Kod bilan qo‘shilish” ni bosing.");return;}const privateLeague=await leagues.privateLeagueByCode(code);if(!privateLeague){await context.reply("Bunday private liga kodi topilmadi.");return;}const clubs=await leagues.listPrivateAvailableClubs(privateLeague.leagueId);await context.reply(`🔒 PRIVATE LIGA · ${code}\n\nKlub tanlang:`,{reply_markup:privateClubKeyboard(clubs,code,0)});});

  bot.callbackQuery("join", async (context) => {
    await context.answerCallbackQuery();
    await showCompetitions(context);
  });

  bot.callbackQuery("pv",async context=>{if(!context.from)return;await context.answerCallbackQuery();const competitions=await leagues.listCompetitions(),kb=new InlineKeyboard();for(const competition of competitions)kb.text(`🔒 ${competition.name}`,`pc:${competition.id}`).row();kb.text("← Ligalar","join");await editOrReply(context,"🔒 PRIVATE LIGA YARATISH\n\nChempionatni tanlang. Keyin sizga do‘stlaringizga yuboriladigan 8 belgili taklif kodi beriladi:",kb);});
  bot.callbackQuery(/^pc:([0-9a-f-]{36})$/,async context=>{if(!context.from)return;await context.answerCallbackQuery({text:"Private liga yaratilmoqda…"});const user=await users.upsertFromTelegram(context.from);try{const league=await leagues.createPrivateLeague(user.id,context.match[1]!);await editOrReply(context,`✅ PRIVATE LIGA TAYYOR\n\n🔑 Taklif kodi: ${league.inviteCode}\n\nKodni do‘stlaringizga yuboring. Ular “Kod bilan qo‘shilish” bo‘limida yozadi. Endi o‘zingiz klub tanlang:`,privateClubKeyboard(await leagues.listPrivateAvailableClubs(league.leagueId),league.inviteCode,0));}catch(error){logger.warn({event:"private_league_create_failed",err:error},"Private league create failed");await context.reply("Private liga yaratilmadi. Keyinroq qayta urinib ko‘ring.");}});
  bot.callbackQuery("pj",async context=>{if(!context.from)return;privateLeagueJoinPending.add(context.from.id);await context.answerCallbackQuery();await editOrReply(context,"🔑 PRIVATE LIGAGA QO‘SHILISH\n\nDo‘stingiz yuborgan 8 belgili taklif kodini bitta xabar qilib yozing:",new InlineKeyboard().text("← Ligalar","join"));});
  const privateClubKeyboard=(clubs:AvailableClub[],code:string,page:number):InlineKeyboard=>{const kb=new InlineKeyboard();for(const club of clubs.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE))kb.text(`⚽ ${club.clubName}`,`pcf:${club.leagueClubId}:${code}`).row();if(page>0)kb.text("← Oldingi",`ppi:${code}:${page-1}`);if((page+1)*PAGE_SIZE<clubs.length)kb.text("Keyingi →",`ppi:${code}:${page+1}`);if(page>0||(page+1)*PAGE_SIZE<clubs.length)kb.row();return kb.text("← Ligalar","join");};
  bot.callbackQuery(/^ppi:([A-Z0-9]{8}):(\d+)$/,async context=>{await context.answerCallbackQuery();const privateLeague=await leagues.privateLeagueByCode(context.match[1]!);if(!privateLeague)return;await editOrReply(context,"⚽ PRIVATE LIGADA KLUB TANLANG:",privateClubKeyboard(await leagues.listPrivateAvailableClubs(privateLeague.leagueId),privateLeague.inviteCode,Number(context.match[2])));});
  bot.callbackQuery(/^pcf:([0-9a-f-]{36}):([A-Z0-9]{8})$/,async context=>{await context.answerCallbackQuery();const clubId=context.match[1]!,code=context.match[2]!;await editOrReply(context,"⚽ Shu klubni private ligada boshqarishni tasdiqlaysizmi?",new InlineKeyboard().text("✅ Tasdiqlash",`pcl:${clubId}:${code}`).row().text("← Orqaga",`ppi:${code}:0`));});
  bot.callbackQuery(/^pcl:([0-9a-f-]{36}):([A-Z0-9]{8})$/,async context=>{if(!context.from)return;await context.answerCallbackQuery({text:"Klub biriktirilmoqda…"});const user=await users.upsertFromTelegram(context.from);try{const result=await leagues.claimPrivateClub(user.id,context.match[2]!,context.match[1]!);const club=(await leagues.listManagedClubs(user.id)).find(item=>item.leagueClubId===result.leagueClubId);if(club)await showDashboard(context,club);}catch(error){logger.warn({event:"private_club_claim_failed",err:error},"Private club claim failed");await context.reply("Klub band bo‘lib qolgan yoki taklif kodi yaroqsiz.");}});

  bot.callbackQuery(/^cmp:([0-9a-f-]{36})$/, async (context) => {
    await context.answerCallbackQuery();
    const competitionId = context.match[1]!;
    const leagueList = await leagues.listJoinableLeagues(competitionId);
    if (leagueList.length === 0) {
      await editOrReply(context, "Hozir bo‘sh public liga yo‘q. Keyinroq qayta urinib ko‘ring.", new InlineKeyboard().text("← Orqaga", "join"));
      return;
    }
    const keyboard = new InlineKeyboard();
    for (const league of leagueList) keyboard.text(`${league.name} · ${league.availableClubs} klub`, `lg:${league.id}:0`).row();
    keyboard.text("← Orqaga", "join");
    await editOrReply(context, "🏟 OCHIQ LIGALAR\n\nKlub olish uchun ligani tanlang:", keyboard);
  });

  bot.callbackQuery(/^lg:([0-9a-f-]{36}):(\d+)$/, async (context) => {
    await context.answerCallbackQuery();
    const leagueId = context.match[1]!;
    const requestedPage = Number(context.match[2]);
    const clubs = await leagues.listAvailableClubs(leagueId);
    if (clubs.length === 0) {
      await editOrReply(context, "Bu ligadagi barcha klublar band bo‘ldi.", new InlineKeyboard().text("← Competitionlar", "join"));
      return;
    }
    const lastPage = Math.max(0, Math.ceil(clubs.length / PAGE_SIZE) - 1);
    const page = Math.min(requestedPage, lastPage);
    await editOrReply(context, `Klub tanlang (${clubs.length} ta mavjud):`, clubListKeyboard(clubs, leagueId, page));
  });

  bot.callbackQuery(/^cf:([0-9a-f-]{36})$/, async (context) => {
    await context.answerCallbackQuery();
    const leagueClubId = context.match[1]!;
    const club = await leagues.getAvailableClub(leagueClubId);
    if (!club) {
      await editOrReply(context, "Bu klub endi mavjud emas. Ro‘yxatdan boshqa klub tanlang.", new InlineKeyboard().text("← Competitionlar", "join"));
      return;
    }
    const keyboard = new InlineKeyboard().text("Tasdiqlash", `cl:${club.leagueClubId}`).row().text("← Orqaga", "join");
    await editOrReply(context, `${club.clubName} klubini boshqarishni tasdiqlaysizmi?\n\nKlubning mavjud holati saqlanadi.`, keyboard);
  });

  bot.callbackQuery(/^cl:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery({ text: "Klub tekshirilmoqda…" });
    const user = await users.upsertFromTelegram(context.from);
    try {
      const result = await leagues.claimClub(user.id, context.match[1]!);
      logger.info({ event: "club_claimed", userId: user.id, leagueClubId: result.leagueClubId }, "Club claimed");
      const club = (await leagues.listManagedClubs(user.id)).find((item) => item.leagueClubId === result.leagueClubId);
      if (!club) throw new Error("CLAIMED_CLUB_NOT_FOUND");
      await showDashboard(context, club);
    } catch (error: unknown) {
      logger.warn({ event: "club_claim_failed", err: error, userId: user.id }, "Club claim failed");
      await editOrReply(context, claimErrorMessage(error), new InlineKeyboard().text("← Boshqa klub", "join"));
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
    const leagueClubId = context.match[1]!;
    const club = (await leagues.listManagedClubs(user.id)).find((item) => item.leagueClubId === leagueClubId);
    if (!club) {
      await context.reply("Bu klub sizga tegishli emas.");
      return;
    }
    const players = await squads.listOwnedClubSquad(user.id, leagueClubId);
    await editOrReply(
      context,
      formatSquad(club.clubName, players),
      new InlineKeyboard().text("Starting XI", `xi:${leagueClubId}`).text("← Klub", `db:${leagueClubId}`),
    );
  });

  bot.callbackQuery(/^mt:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return;
    await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from);
    const leagueClubId = context.match[1]!;
    const upcoming = await fixtures.listUpcoming(user.id, leagueClubId);
    await editOrReply(context, formatUpcomingFixtures(upcoming), new InlineKeyboard().text("Natijalar", `rs:${leagueClubId}`).text("Liga jadvali", `tb:${leagueClubId}`).row().text("← Klub", `db:${leagueClubId}`));
  });

  bot.callbackQuery(/^rs:([0-9a-f-]{36})$/,async(context)=>{if(!context.from)return;await context.answerCallbackQuery();const user=await users.upsertFromTelegram(context.from);const club=context.match[1]!;await editOrReply(context,formatResults(await matches.history(user.id,club)),new InlineKeyboard().text("Keyingi matchlar",`mt:${club}`).text("← Klub",`db:${club}`));});
  bot.callbackQuery(/^tb:([0-9a-f-]{36})$/,async(context)=>{if(!context.from)return;await context.answerCallbackQuery();const user=await users.upsertFromTelegram(context.from);const club=context.match[1]!;await editOrReply(context,formatTable(await matches.table(user.id,club)),new InlineKeyboard().text("← Klub",`db:${club}`));});
  bot.callbackQuery(/^sc:([0-9a-f-]{36})$/,async(context)=>{if(!context.from)return;await context.answerCallbackQuery();const user=await users.upsertFromTelegram(context.from),club=context.match[1]!;await editOrReply(context,formatLeaders("🥅 LIGA TO‘PURARLARI",await matches.leaders(user.id,club,"goals"),"gol"),new InlineKeyboard().text("🎯 Assistentlar",`asst:${club}`).row().text("← Klub",`db:${club}`));});
  bot.callbackQuery(/^asst:([0-9a-f-]{36})$/,async(context)=>{if(!context.from)return;await context.answerCallbackQuery();const user=await users.upsertFromTelegram(context.from),club=context.match[1]!;await editOrReply(context,formatLeaders("🎯 LIGA ASSISTENTLARI",await matches.leaders(user.id,club,"assists"),"assist"),new InlineKeyboard().text("🥅 To‘purarlar",`sc:${club}`).row().text("← Klub",`db:${club}`));});
  bot.callbackQuery(/^fn:([0-9a-f-]{36})$/,async(context)=>{if(!context.from)return;await context.answerCallbackQuery();const user=await users.upsertFromTelegram(context.from);const club=context.match[1]!;await editOrReply(context,formatFinances(await matches.finances(user.id,club)),new InlineKeyboard().text("Homiylar",`sp:${club}`).row().text("← Klub",`db:${club}`));});
  bot.callbackQuery(/^sp:([0-9a-f-]{36})$/,async context=>{await context.answerCallbackQuery();const club=context.match[1]!,rows=await progression.sponsors();const keyboard=new InlineKeyboard();for(const s of rows)keyboard.text(`${s.name} · ${transferMoney(s.payment)}`,`sa:${s.id}`).row();keyboard.text("← Moliya",`fn:${club}`);await editOrReply(context,formatSponsors(rows),keyboard);});
  bot.callbackQuery(/^sa:([0-9a-f-]{36})$/,async context=>{if(!context.from)return;await context.answerCallbackQuery();const user=await users.upsertFromTelegram(context.from),club=(await leagues.listManagedClubs(user.id))[0]?.leagueClubId,sponsor=context.match[1]!;if(!club)return;await progression.acceptSponsor(user.id,club,sponsor);const selected=(await progression.sponsors()).find(s=>s.id===sponsor);if(selected?.channelId){let eligible=false;try{const member=await context.api.getChatMember(selected.channelId,context.from.id);eligible=!['left','kicked'].includes(member.status);}catch(error){logger.warn({event:'sponsor_membership_check_failed',err:error},'Membership check failed');}await progression.setEligibility(user.id,club,eligible);await context.reply(eligible?"Homiy faol. Kanal a’zoligi tasdiqlandi.":"Homiy tanlandi, ammo kanal a’zoligi tasdiqlanmadi.");}else await context.reply("Homiy shartnomasi faol qilindi.");});

  const tacticKeyboard = (clubId: string, tactic: Tactic): InlineKeyboard => new InlineKeyboard()
    .text("📐 Sxema", `fm:${clubId}`).text("⚖️ O‘yin uslubi", `cy:${clubId}:mentality`).row()
    .text(`🔥 Pressing ${tactic.pressing} −`, `nu:${clubId}:pressing:-`).text(`🔥 ${tactic.pressing} +`, `nu:${clubId}:pressing:+`).row()
    .text(`⚡ Sur’at ${tactic.tempo} −`, `nu:${clubId}:tempo:-`).text(`⚡ ${tactic.tempo} +`, `nu:${clubId}:tempo:+`).row()
    .text(`🛡 Himoya ${tactic.defensiveLine} −`, `nu:${clubId}:defensiveLine:-`).text(`🛡 ${tactic.defensiveLine} +`, `nu:${clubId}:defensiveLine:+`).row()
    .text(`↔️ Kenglik ${tactic.width} −`, `nu:${clubId}:width:-`).text(`↔️ ${tactic.width} +`, `nu:${clubId}:width:+`).row()
    .text("🎯 Pas uslubi", `cy:${clubId}:passingStyle`).row()
    .text("🚀 Hujum yo‘nalishi", `cy:${clubId}:attackFocus`).row()
    .text("🦵 To‘p uchun kurash", `cy:${clubId}:tackling`).row()
    .text("👥 Boshlang‘ich 11", `xi:${clubId}`).text("← Klub", `db:${clubId}`);

  const showTactics = async (context: Context, userId: string, clubId: string): Promise<void> => {
    const tactic = await tactics.get(userId, clubId);
    await editOrReply(context, formatTactics(tactic), tacticKeyboard(clubId, tactic));
  };

  bot.callbackQuery(/^tc:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return; await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from); await showTactics(context, user.id, context.match[1]!);
  });
  bot.callbackQuery(/^fm:([0-9a-f-]{36})$/, async (context) => {
    if (!context.from) return; await context.answerCallbackQuery();
    const user = await users.upsertFromTelegram(context.from); await tactics.get(user.id, context.match[1]!);
    const keyboard = new InlineKeyboard(); for (const formation of await tactics.listFormations()) keyboard.text(`📐 ${formation.name}`, `fs:${context.match[1]}:${formation.code}`).row();
    keyboard.text("← Taktika", `tc:${context.match[1]}`); await editOrReply(context, "📐 SXEMANI TANLANG\n\nMasalan, 4-3-3: 4 himoyachi, 3 yarim himoyachi va 3 hujumchi.", keyboard);
  });
  bot.callbackQuery(/^fs:([0-9a-f-]{36}):(\d+)$/, async (context) => {
    if (!context.from) return; await context.answerCallbackQuery({text:"Boshlang‘ich tarkib moslanmoqda…"});
    const user=await users.upsertFromTelegram(context.from);await tactics.autoSave(user.id,context.match[1]!,context.match[2]!);await showTactics(context,user.id,context.match[1]!);
  });
  bot.callbackQuery(/^xi:([0-9a-f-]{36})$/, async (context) => {
    if(!context.from)return;await context.answerCallbackQuery();const user=await users.upsertFromTelegram(context.from);const lineup=await tactics.lineup(user.id,context.match[1]!);
    await editOrReply(context,formatLineup(lineup.formation,lineup.players),new InlineKeyboard().text("✏️ 11 talikni tanlash",`xe:${context.match[1]}`).row().text("🤖 Avtomatik tanlash",`xa:${context.match[1]}`).row().text("← Taktika",`tc:${context.match[1]}`).text("← Klub",`db:${context.match[1]}`));
  });
  const showLineupDraft=async(context:Context,draft:LineupDraft):Promise<void>=>{const slot=draft.slots[draft.picks.length],selected=draft.picks.map((pick,index)=>{const player=draft.players.find(p=>p.clubPlayerId===pick.clubPlayerId)!;return `${index+1}. ${draft.slots[index]!.key} — ${player.shortName}`;});const text=["✏️ BOSHLANG‘ICH 11 TALIK",`📐 Sxema: ${draft.formationName}`,`✅ Tanlandi: ${draft.picks.length}/11`,"",...selected,"",slot?`Navbat: ${slot.key} — ${positionName(slot.position)}\nFutbolchini tanlang:`:"Tarkib tayyor. Endi saqlang 👇"].join("\n");const kb=new InlineKeyboard();if(slot){const used=new Set(draft.picks.map(p=>p.clubPlayerId));const candidates=draft.players.filter(p=>!used.has(p.clubPlayerId)).sort((a,b)=>Number(b.primaryPosition===slot.position)-Number(a.primaryPosition===slot.position)||b.overall-a.overall);for(const player of candidates)kb.text(`${player.primaryPosition===slot.position?'✅':'▫️'} ${player.shortName} · ${player.primaryPosition} · ⭐${player.overall}`,`xp:${player.clubPlayerId}`).row();}else kb.text("💾 Tarkibni saqlash","xs").row();if(draft.picks.length)kb.text("↩️ Oxirgi tanlovni bekor qilish","xb").row();kb.text("❌ Bekor qilish","xc");await editOrReply(context,text,kb);};
  bot.callbackQuery(/^xe:([0-9a-f-]{36})$/,async context=>{if(!context.from)return;await context.answerCallbackQuery();const user=await users.upsertFromTelegram(context.from),clubId=context.match[1]!,tactic=await tactics.get(user.id,clubId),formation=(await tactics.listFormations()).find(f=>f.code===tactic.formationCode);if(!formation)return;const draft:LineupDraft={clubId,formationCode:formation.code,formationName:formation.name,slots:formation.slots,players:await squads.listOwnedClubSquad(user.id,clubId),picks:[]};lineupDrafts.set(context.from.id,draft);await showLineupDraft(context,draft);});
  bot.callbackQuery(/^xp:([0-9a-f-]{36})$/,async context=>{if(!context.from)return;const draft=lineupDrafts.get(context.from.id);if(!draft)return context.answerCallbackQuery({text:"Tanlash muddati tugadi. Qayta boshlang."});if(draft.picks.some(p=>p.clubPlayerId===context.match[1]))return context.answerCallbackQuery({text:"Bu futbolchi allaqachon tanlangan"});const slot=draft.slots[draft.picks.length];if(!slot)return;draft.picks.push({slotKey:slot.key,clubPlayerId:context.match[1]!});await context.answerCallbackQuery({text:`${draft.picks.length}/11 tanlandi`});await showLineupDraft(context,draft);});
  bot.callbackQuery("xb",async context=>{if(!context.from)return;const draft=lineupDrafts.get(context.from.id);if(!draft)return context.answerCallbackQuery();draft.picks.pop();await context.answerCallbackQuery();await showLineupDraft(context,draft);});
  bot.callbackQuery("xc",async context=>{if(!context.from)return;const draft=lineupDrafts.get(context.from.id);lineupDrafts.delete(context.from.id);await context.answerCallbackQuery({text:"Tanlash bekor qilindi"});if(draft){const user=await users.upsertFromTelegram(context.from);await showTactics(context,user.id,draft.clubId);}});
  bot.callbackQuery("xs",async context=>{if(!context.from)return;const draft=lineupDrafts.get(context.from.id);if(!draft||draft.picks.length!==11)return context.answerCallbackQuery({text:"Avval 11 futbolchini tanlang"});await context.answerCallbackQuery({text:"Tarkib saqlanmoqda…"});const user=await users.upsertFromTelegram(context.from);await tactics.saveManual(user.id,draft.clubId,draft.formationCode,draft.picks);lineupDrafts.delete(context.from.id);const lineup=await tactics.lineup(user.id,draft.clubId);await editOrReply(context,`${formatLineup(lineup.formation,lineup.players)}\n\n✅ Boshlang‘ich tarkib saqlandi!`,new InlineKeyboard().text("← Taktika",`tc:${draft.clubId}`).text("← Klub",`db:${draft.clubId}`));});
  bot.callbackQuery(/^xa:([0-9a-f-]{36})$/,async context=>{if(!context.from)return;await context.answerCallbackQuery({text:"Eng mos futbolchilar tanlanmoqda…"});const user=await users.upsertFromTelegram(context.from),clubId=context.match[1]!,tactic=await tactics.get(user.id,clubId);await tactics.autoSave(user.id,clubId,tactic.formationCode);const lineup=await tactics.lineup(user.id,clubId);await editOrReply(context,`${formatLineup(lineup.formation,lineup.players)}\n\n✅ Avtomatik tarkib saqlandi!`,new InlineKeyboard().text("✏️ Qo‘lda o‘zgartirish",`xe:${clubId}`).row().text("← Taktika",`tc:${clubId}`));});
  bot.callbackQuery(/^nu:([0-9a-f-]{36}):(pressing|tempo|defensiveLine|width):([+-])$/,async context=>{
    if(!context.from)return;const user=await users.upsertFromTelegram(context.from);const club=context.match[1]!,field=context.match[2] as "pressing"|"tempo"|"defensiveLine"|"width";const current=await tactics.get(user.id,club);const value=Math.max(0,Math.min(100,current[field]+(context.match[3]==="+"?10:-10)));const updated=await tactics.update(user.id,club,{[field]:value});await context.answerCallbackQuery({text:`✅ ${field==='tempo'?'Sur’at':field==='defensiveLine'?'Himoya chizig‘i':field==='width'?'Kenglik':'Pressing'}: ${updated[field]}`});await showTactics(context,user.id,club);
  });
  bot.callbackQuery(/^cy:([0-9a-f-]{36}):(mentality|passingStyle|attackFocus|tackling)$/,async context=>{
    if(!context.from)return;await context.answerCallbackQuery();const user=await users.upsertFromTelegram(context.from);const club=context.match[1]!,field=context.match[2] as "mentality"|"passingStyle"|"attackFocus"|"tackling";const current=await tactics.get(user.id,club);const options={mentality:["VERY_DEFENSIVE","DEFENSIVE","BALANCED","ATTACKING","VERY_ATTACKING"],passingStyle:["SHORT","MIXED","DIRECT"],attackFocus:["LEFT","CENTRE","RIGHT","BOTH_WINGS","MIXED"],tackling:["CAUTIOUS","NORMAL","AGGRESSIVE"]}[field];const next=options[(options.indexOf(current[field])+1)%options.length]!;await tactics.update(user.id,club,{[field]:next});await showTactics(context,user.id,club);
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
