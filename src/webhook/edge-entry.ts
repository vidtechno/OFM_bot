import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBot } from "../bot/create-bot.js";
import { UserRepository } from "../users/user.repository.js";
import { LeagueRepository } from "../leagues/league.repository.js";
import { SquadRepository } from "../squads/squad.repository.js";
import { TacticsRepository } from "../tactics/tactics.repository.js";
import { FixtureRepository } from "../fixtures/fixture.repository.js";
import { MatchRepository } from "../matches/match.repository.js";
import { TransferRepository } from "../transfers/transfer.repository.js";
import { ProgressionRepository } from "../progression/progression.repository.js";
import { AdminRepository } from "../admin/admin.repository.js";
import { LegendRepository } from "../legends/legend.repository.js";
import { handleTelegramWebhook, type WebhookLogger } from "./telegram-handler.js";
import type { Bot, Context } from "grammy";

// Declare Deno global for type safety when compiling outside Deno
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve?: (handler: (req: Request) => Promise<Response>) => void;
} | undefined;

function getEnv(key: string): string | undefined {
  if (typeof Deno !== "undefined" && typeof Deno.env?.get === "function") {
    return Deno.env.get(key);
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }
  return undefined;
}

const edgeLogger: WebhookLogger = {
  info(obj: any, msg?: string) {
    console.log(JSON.stringify({ level: "info", message: msg, ...obj }));
  },
  warn(obj: any, msg?: string) {
    console.warn(JSON.stringify({ level: "warn", message: msg, ...obj }));
  },
  error(obj: any, msg?: string) {
    console.error(JSON.stringify({ level: "error", message: msg, ...obj }));
  },
};

let cachedBot: Bot | null = null;
let cachedDb: SupabaseClient | null = null;

function initializeContext() {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!token) throw new Error("TELEGRAM_BOT_TOKEN environment variable kiritilmagan");
  if (!supabaseUrl) throw new Error("SUPABASE_URL environment variable kiritilmagan");
  if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable kiritilmagan");

  if (!cachedDb) {
    cachedDb = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  if (!cachedBot) {
    const squads = new SquadRepository(cachedDb);
    const leagues = new LeagueRepository(cachedDb);
    const matches = new MatchRepository(cachedDb);
    const transfers = new TransferRepository(cachedDb);
    const legends = new LegendRepository(cachedDb);

    const rawAdminIds = getEnv("ADMIN_TELEGRAM_IDS") ?? "6117815120";
    const adminTelegramIds = rawAdminIds
      .split(",")
      .map((id) => Number(id.trim()))
      .filter(Number.isSafeInteger);

    cachedBot = createBot({
      token,
      users: new UserRepository(cachedDb),
      leagues,
      squads,
      tactics: new TacticsRepository(cachedDb, squads),
      fixtures: new FixtureRepository(cachedDb),
      matches,
      transfers,
      legends,
      progression: new ProgressionRepository(cachedDb),
      admin: new AdminRepository(cachedDb),
      adminTelegramIds,
      logger: edgeLogger as any,
    });
  }

  return {
    bot: cachedBot,
    database: cachedDb,
    secretToken: getEnv("TELEGRAM_WEBHOOK_SECRET"),
  };
}

export async function handleRequest(req: Request): Promise<Response> {
  try {
    const { bot, database, secretToken } = initializeContext();
    return await handleTelegramWebhook(req, {
      bot,
      database,
      secretToken,
      logger: edgeLogger,
    });
  } catch (initError: unknown) {
    const message = initError instanceof Error ? initError.message : String(initError);
    edgeLogger.error({ event: "edge_function_init_failed", error: message }, "Failed to initialize Edge Function");
    return Response.json(
      { error: "Internal Server Error: " + message },
      { status: 500 }
    );
  }
}

// Serve with Deno.serve if available
if (typeof Deno !== "undefined" && typeof Deno.serve === "function") {
  Deno.serve(handleRequest);
}

// Standard export for serverless runtimes
export default {
  fetch: handleRequest,
};
