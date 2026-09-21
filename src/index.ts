import { loadConfig } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { checkDatabaseHealth, createDatabaseClient } from "./db/client.js";
import { UserRepository } from "./users/user.repository.js";
import { createBot } from "./bot/create-bot.js";
import { LeagueRepository } from "./leagues/league.repository.js";
import { SquadRepository } from "./squads/squad.repository.js";
import { TacticsRepository } from "./tactics/tactics.repository.js";
import { FixtureRepository } from "./fixtures/fixture.repository.js";
import { MatchRepository } from "./matches/match.repository.js";
import { simulateMatch } from "./matches/match-engine.js";
import { TransferRepository } from "./transfers/transfer.repository.js";
import { ProgressionRepository } from "./progression/progression.repository.js";
import { AdminRepository } from "./admin/admin.repository.js";
import { InlineKeyboard } from "grammy";
import { formatMatchReport } from "./matches/presentation.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const database = createDatabaseClient(config);

  await checkDatabaseHealth(database);
  logger.info({ event: "database_health_check" }, "Supabase connection is healthy");

  const squads = new SquadRepository(database);
  const leagues = new LeagueRepository(database);
  const matchRepository = new MatchRepository(database);
  const transferRepository = new TransferRepository(database);
  const bot = createBot({
    token: config.TELEGRAM_BOT_TOKEN,
    users: new UserRepository(database),
    leagues,
    squads,
    tactics: new TacticsRepository(database, squads),
    fixtures: new FixtureRepository(database),
    matches: matchRepository,
    transfers: transferRepository,
    progression: new ProgressionRepository(database),
    admin: new AdminRepository(database),
    adminTelegramIds: config.ADMIN_TELEGRAM_IDS,
    logger,
  });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ event: "shutdown", signal }, "Stopping process");
    clearInterval(matchTimer);
    clearInterval(transferTimer);
    clearInterval(globalLeagueTimer);
    if (config.BOT_MODE === "polling") {
      try {
        await bot.stop();
      } catch {
        // Ignore stop error if not actively polling
      }
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  let matchJobRunning = false;
  const processMatches = async (): Promise<void> => {
    if (matchJobRunning) return;
    matchJobRunning = true;
    try {
      const due = await matchRepository.due(40);
      for (const fixture of due) {
        const matchId=await matchRepository.complete(fixture.fixtureId, simulateMatch(fixture.fixtureId, fixture.home, fixture.away));
        const reports=await matchRepository.ownerReports(matchId);
        for(const report of reports){try{await bot.api.sendMessage(report.telegramId,formatMatchReport(report),{reply_markup:new InlineKeyboard().text("👥 Tarkib",`sq:${report.clubId}`).text("🧠 Taktika",`tc:${report.clubId}`).row().text("🏆 Liga jadvali",`tb:${report.clubId}`).text("📋 Matchlar",`mt:${report.clubId}`)});}catch(error:unknown){logger.warn({event:"match_report_send_failed",matchId,telegramId:report.telegramId,err:error},"Match report could not be sent");}}
      }
      if (due.length) logger.info({ event: "due_matches_processed", count: due.length }, "Due matches processed");
    } catch (error: unknown) {
      logger.error({ event: "due_match_job_failed", err: error }, "Due match job failed");
    } finally { matchJobRunning = false; }
  };
  const matchTimer = setInterval(() => void processMatches(), 60_000);
  matchTimer.unref();
  void processMatches();
  const maintainTransfers=async():Promise<void>=>{try{await transferRepository.maintain();}catch(error:unknown){logger.error({event:"transfer_maintenance_failed",err:error},"Transfer maintenance failed");}};
  const transferTimer=setInterval(()=>void maintainTransfers(),15*60_000);transferTimer.unref();void maintainTransfers();
  let globalLeagueSchedulerReady=true;
  const maintainGlobalLeagues=async():Promise<void>=>{if(!globalLeagueSchedulerReady)return;try{const created=await leagues.releaseScheduledGlobalLeagues();if(created)logger.info({event:"global_leagues_released",count:created},"Scheduled global leagues released");}catch(error:unknown){if((error as {code?:string}).code==="PGRST202"){globalLeagueSchedulerReady=false;logger.warn({event:"global_league_scheduler_waiting_for_migration"},"Global league scheduler is waiting for its database migration");return;}logger.error({event:"global_league_release_failed",err:error},"Scheduled global league release failed");}};
  const globalLeagueTimer=setInterval(()=>void maintainGlobalLeagues(),60_000);globalLeagueTimer.unref();void maintainGlobalLeagues();

  if (config.BOT_MODE === "webhook") {
    logger.info(
      { event: "bot_start_webhook_mode", mode: "webhook" },
      "Running in WEBHOOK mode. Telegram updates are handled by Supabase Edge Function (telegram-webhook). Background workers active."
    );
    // Keep Node process alive for timers
    await new Promise(() => {});
  } else {
    logger.info({ event: "bot_start", mode: "polling" }, "Starting OFM Game bot with long polling (development)");
    await bot.start({
      onStart: (botInfo) => logger.info({ event: "bot_started", username: botInfo.username }, "Bot started with long polling"),
    });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
