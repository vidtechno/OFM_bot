import { createClient } from "@supabase/supabase-js";
import { isAuthorizedSchedulerRequest, processDueMatches } from "./match-scheduler.js";
import { MatchRepository } from "./match.repository.js";
import { formatMatchReport } from "./presentation.js";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve?: (handler: (req: Request) => Promise<Response>) => void;
} | undefined;

const logger = {
  info: (obj: Record<string, unknown>, message?: string) => console.log(JSON.stringify({ level: "info", message, ...obj })),
  warn: (obj: Record<string, unknown>, message?: string) => console.warn(JSON.stringify({ level: "warn", message, ...obj })),
  error: (obj: Record<string, unknown>, message?: string) => console.error(JSON.stringify({ level: "error", message, ...obj })),
};

function env(key: string): string | undefined {
  if (typeof Deno !== "undefined") return Deno.env.get(key);
  return typeof process !== "undefined" ? process.env[key] : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null
    ? JSON.stringify(error)
    : String(error);
}

async function sendTelegramMessage(token: string, chatId: number, text: string, clubId: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "👥 Tarkib", callback_data: `sq:${clubId}` },
            { text: "🧠 Taktika", callback_data: `tc:${clubId}` },
          ],
          [
            { text: "🏆 Liga jadvali", callback_data: `tb:${clubId}` },
            { text: "📋 Matchlar", callback_data: `mt:${clubId}` },
          ],
        ],
      },
    }),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed (${response.status}): ${await response.text()}`);
}

async function sendTelegramPayload(token: string, chatId: number, text: string, inlineKeyboard: any[][]): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: inlineKeyboard } }),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed (${response.status}): ${await response.text()}`);
}

const relation = <T>(value: T | T[]): T => Array.isArray(value) ? value[0] as T : value;

async function processReminders(database: any, telegramToken: string | undefined): Promise<{ sent:number; failed:number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 45 * 60_000);
  const { data: candidates, error: candidateError } = await database.from("fixtures")
    .select("id,league_instance_id,home_club_id,away_club_id,scheduled_at")
    .eq("status","SCHEDULED").gt("scheduled_at",now.toISOString()).lte("scheduled_at",cutoff.toISOString()).limit(100);
  if (candidateError) throw candidateError;
  if (candidates?.length) {
    const leagueIds = [...new Set(candidates.map((f:any)=>f.league_instance_id))];
    const clubIds = [...new Set(candidates.flatMap((f:any)=>[f.home_club_id,f.away_club_id]))];
    const [{ data: leagues }, { data: clubs }] = await Promise.all([
      database.from("league_instances").select("id,status").in("id",leagueIds),
      database.from("league_clubs").select("id,manager_user_id,manager_type,users(telegram_id)").in("id",clubIds),
    ]);
    const active = new Set((leagues??[]).filter((l:any)=>l.status==="ACTIVE").map((l:any)=>l.id));
    const clubMap = new Map((clubs??[]).map((c:any)=>[c.id,c]));
    const rows:any[]=[];
    for(const fixture of candidates){
      if(!active.has(fixture.league_instance_id))continue;
      for(const clubId of [fixture.home_club_id,fixture.away_club_id]){
        const club:any=clubMap.get(clubId);const u=club?.users?relation<any>(club.users):null;
        if(club?.manager_type==="HUMAN"&&club.manager_user_id&&u?.telegram_id)rows.push({user_id:club.manager_user_id,fixture_id:fixture.id,reminder_type:"45_MIN",telegram_id:u.telegram_id,league_club_id:club.id});
      }
    }
    if(rows.length){const{error}=await database.from("match_reminders").upsert(rows,{onConflict:"user_id,fixture_id,reminder_type",ignoreDuplicates:true});if(error)throw error;}
  }

  const { data: pending, error: pendingError } = await database.from("match_reminders").select("id,user_id,fixture_id,telegram_id,league_club_id,attempts").is("sent_at",null).order("created_at").limit(50);
  if(pendingError)throw pendingError;
  if(!pending?.length)return{sent:0,failed:0};
  if(!telegramToken)throw new Error("TELEGRAM_BOT_TOKEN is not configured for reminders");
  const fixtureIds=[...new Set(pending.map((r:any)=>r.fixture_id))];
  const { data: fixtures }=await database.from("fixtures").select("id,status,scheduled_at,league_instance_id,home_club_id,away_club_id").in("id",fixtureIds);
  const fMap=new Map((fixtures??[]).map((f:any)=>[f.id,f]));
  const allClubIds=[...new Set((fixtures??[]).flatMap((f:any)=>[f.home_club_id,f.away_club_id]))];
  const leagueIds=[...new Set((fixtures??[]).map((f:any)=>f.league_instance_id))];
  const [{data:clubs},{data:leagues}]=await Promise.all([
    database.from("league_clubs").select("id,manager_user_id,manager_type,clubs(name)").in("id",allClubIds),
    database.from("league_instances").select("id,status").in("id",leagueIds),
  ]);
  const clubMap=new Map((clubs??[]).map((c:any)=>[c.id,c]));const active=new Set((leagues??[]).filter((l:any)=>l.status==="ACTIVE").map((l:any)=>l.id));
  let sent=0,failed=0;
  for(const row of pending){
    try{
      const f:any=fMap.get(row.fixture_id);const managed:any=clubMap.get(row.league_club_id);
      if(!f||f.status!=="SCHEDULED"||!active.has(f.league_instance_id)||new Date(f.scheduled_at)<=now||managed?.manager_type!=="HUMAN"||managed?.manager_user_id!==row.user_id){
        await database.from("match_reminders").delete().eq("id",row.id);continue;
      }
      // If a fixture was moved later after the reminder was queued, keep it pending
      // and send only when it enters the <=45 minute window again.
      if(new Date(f.scheduled_at).getTime()-now.getTime()>45*60_000)continue;
      const home:any=clubMap.get(f.home_club_id),away:any=clubMap.get(f.away_club_id);
      const homeName=relation<any>(home.clubs).name,awayName=relation<any>(away.clubs).name;
      const time=new Intl.DateTimeFormat("uz-UZ",{timeZone:"Asia/Tashkent",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(f.scheduled_at));
      await sendTelegramPayload(telegramToken,Number(row.telegram_id),`⏰ <b>45 daqiqadan keyin o‘yin!</b>\n\n${homeName} vs ${awayName}\n🕐 ${time}\n\n<i>Tarkib va taktikani tekshirib qo‘ying.</i>`,[[{text:"🔥 Asosiy XI",callback_data:`xi:${row.league_club_id}`},{text:"🧠 Taktika",callback_data:`tc:${row.league_club_id}`}],[{text:"⚔️ Match preview",callback_data:`mpv:${row.league_club_id}`}]]);
      await database.from("match_reminders").update({sent_at:new Date().toISOString(),attempts:Number(row.attempts)+1,last_error:null}).eq("id",row.id);
      await database.rpc("log_analytics_event",{p_user_id:row.user_id,p_event_name:"match_reminder_sent",p_dedup_key:row.fixture_id+":"+row.user_id,p_metadata:{fixture_id:row.fixture_id}});
      sent++;
    }catch(error){failed++;await database.from("match_reminders").update({attempts:Number(row.attempts)+1,last_error:errorMessage(error).slice(0,1000)}).eq("id",row.id);}
  }
  return{sent,failed};
}

async function processSeasonSummaries(database:any,telegramToken:string|undefined):Promise<{sent:number;failed:number}>{
  const{data:deliveries,error}=await database.from("season_summary_deliveries").select("id,season_history_id,telegram_id,attempts").is("sent_at",null).order("created_at").limit(30);if(error)throw error;
  if(!deliveries?.length)return{sent:0,failed:0};if(!telegramToken)throw new Error("TELEGRAM_BOT_TOKEN is not configured for season summaries");
  const ids=deliveries.map((d:any)=>d.season_history_id);const{data:histories,error:hError}=await database.from("manager_season_history").select("id,user_id,competition_name,instance_number,club_name,final_position,played,wins,draws,losses,goals_for,goals_against,points,season_xp_earned,champion").in("id",ids);if(hError)throw hError;
  const map=new Map((histories??[]).map((h:any)=>[h.id,h]));let sent=0,failed=0;
  for(const d of deliveries){try{const h:any=map.get(d.season_history_id);if(!h)continue;const medal=h.final_position===1?"🥇":h.final_position===2?"🥈":h.final_position===3?"🥉":"🏅";const trophy=h.final_position===1?`\n\n🏅 <b>Yangi sovrin:</b>\n${h.competition_name} Champion #${String(h.instance_number).padStart(4,"0")}`:"";
    await sendTelegramPayload(telegramToken,Number(d.telegram_id),`🏆 <b>MAVSUM YAKUNI</b>\n\n🏟 <b>${h.club_name}</b>\n${h.competition_name} #${String(h.instance_number).padStart(4,"0")}\n\n${medal} Yakuniy o‘rin: <b>${h.final_position}</b>\n🎮 O‘yinlar: ${h.played}\n✅ G‘alaba: ${h.wins}\n🤝 Durang: ${h.draws}\n❌ Mag‘lubiyat: ${h.losses}\n⚽ Gollar: ${h.goals_for}–${h.goals_against}\n⭐ Mavsum XP: +${h.season_xp_earned}${trophy}\n\n📚 <i>Natija manager karerangizga saqlandi.</i>`,[[{text:"🏆 Sovrinlarim",callback_data:"pf:t"},{text:"📚 Mavsumlarim",callback_data:"pf:s:0"}],[{text:"🔄 Yangi liga boshlash",callback_data:"join"}]]);
    await database.from("season_summary_deliveries").update({sent_at:new Date().toISOString(),attempts:Number(d.attempts)+1,last_error:null}).eq("id",d.id);await database.rpc("log_analytics_event",{p_user_id:h.user_id,p_event_name:"season_summary_sent",p_dedup_key:h.id,p_metadata:{season_history_id:h.id}});sent++;
  }catch(err){failed++;await database.from("season_summary_deliveries").update({attempts:Number(d.attempts)+1,last_error:errorMessage(err).slice(0,1000)}).eq("id",d.id);}}
  return{sent,failed};
}

export async function handleMatchScheduler(req: Request): Promise<Response> {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  const url = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return Response.json({ error: "Scheduler is not configured" }, { status: 500 });
  const schedulerSecret = env("MATCH_SCHEDULER_SECRET") ?? serviceRoleKey;
  if (!isAuthorizedSchedulerRequest(req, schedulerSecret)) {
    logger.warn({ event: "match_scheduler_unauthorized" }, "Rejected unauthorized scheduler request");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const database = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const result = await processDueMatches(database, logger);
    const telegramToken = env("TELEGRAM_BOT_TOKEN");
    let reportsSent = 0;
    let reportsFailed = 0;

    const { data: deliveries, error: deliveryError } = await database
      .from("match_report_deliveries")
      .select("id,match_id,telegram_id,attempts")
      .is("sent_at", null)
      .order("created_at")
      .limit(50);
    if (deliveryError) throw deliveryError;

    if (deliveries?.length && !telegramToken) {
      throw new Error("TELEGRAM_BOT_TOKEN is not configured for pending match reports");
    }

    if (telegramToken && deliveries?.length) {
      const repository = new MatchRepository(database);
      for (const delivery of deliveries) {
        try {
          const reports = await repository.ownerReports(delivery.match_id);
          const report = reports.find(item => item.telegramId === Number(delivery.telegram_id));
          if (!report) throw new Error("Match owner report could not be built for queued recipient");
          await sendTelegramMessage(telegramToken, report.telegramId, formatMatchReport(report), report.clubId);
          const { error: sentError } = await database
            .from("match_report_deliveries")
            .update({ sent_at: new Date().toISOString(), attempts: Number(delivery.attempts) + 1, last_error: null })
            .eq("id", delivery.id);
          if (sentError) throw sentError;
          reportsSent += 1;
        } catch (error: unknown) {
          reportsFailed += 1;
          const message = errorMessage(error);
          await database
            .from("match_report_deliveries")
            .update({ attempts: Number(delivery.attempts) + 1, last_error: message.slice(0, 1000) })
            .eq("id", delivery.id);
          logger.warn(
            { event: "match_report_send_failed", matchId: delivery.match_id, telegramId: delivery.telegram_id, err: error },
            "Match report could not be sent; it will be retried"
          );
        }
      }
    }

    const reminders=await processReminders(database,telegramToken);
    const seasonSummaries=await processSeasonSummaries(database,telegramToken);
    const { matchIds: _matchIds, ...summary } = result;
    return Response.json({ ok: true, ...summary, reportsSent, reportsFailed, remindersSent:reminders.sent, remindersFailed:reminders.failed, seasonSummariesSent:seasonSummaries.sent, seasonSummariesFailed:seasonSummaries.failed });
  } catch (error: unknown) {
    const message = errorMessage(error);
    logger.error({ event: "match_scheduler_failed", err: error }, "Match scheduler run failed");
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

if (typeof Deno !== "undefined" && typeof Deno.serve === "function") Deno.serve(handleMatchScheduler);

export default { fetch: handleMatchScheduler };
