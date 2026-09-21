import type { Bot, Context } from "grammy";
import type { Update } from "grammy/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RequestProfiler } from "../lib/profiler.js";

export interface WebhookLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  debug?(obj: Record<string, unknown>, msg?: string): void;
}

export interface WebhookDependencies {
  bot: Bot<Context>;
  database: SupabaseClient;
  secretToken?: string | undefined;
  logger: WebhookLogger;
}

export function verifySecretToken(req: Request, expectedSecret?: string): boolean {
  if (!expectedSecret) return true;
  const headerToken = req.headers.get("x-telegram-bot-api-secret-token");
  return headerToken === expectedSecret;
}

export async function claimTelegramUpdate(database: SupabaseClient, updateId: number): Promise<boolean> {
  try {
    const { error } = await database
      .from("telegram_processed_updates")
      .insert({
        update_id: updateId,
        status: "processing",
        received_at: new Date().toISOString(),
      });

    if (error) {
      // Postgres error code 23505 is unique_violation
      if (error.code === "23505") {
        return false;
      }
      // If table doesn't exist yet (PGRST204 or 42P01), fail-open with console warning
      if (error.code === "42P01" || error.code === "PGRST204") {
        return true;
      }
      return true;
    }

    return true;
  } catch {
    // If network or unexpected DB issue occurs during claim, fail-open to not block users
    return true;
  }
}

export async function markTelegramUpdateComplete(database: SupabaseClient, updateId: number): Promise<void> {
  try {
    await database
      .from("telegram_processed_updates")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
      })
      .eq("update_id", updateId);
  } catch {
    // Best-effort update
  }
}

export async function markTelegramUpdateFailed(
  database: SupabaseClient,
  updateId: number,
  errorMessage: string
): Promise<void> {
  try {
    await database
      .from("telegram_processed_updates")
      .update({
        status: "failed",
        error_message: errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq("update_id", updateId);
  } catch {
    // Best-effort update
  }
}

const botInitPromises = new WeakMap<Bot<Context>, Promise<void>>();

export async function ensureBotInitialized(bot: Bot<Context>): Promise<void> {
  if (typeof bot.isInited === "function" && bot.isInited()) {
    return;
  }
  if (typeof bot.init !== "function") {
    return;
  }

  let promise = botInitPromises.get(bot);
  if (!promise) {
    promise = bot.init().then(() => undefined).catch((err) => {
      botInitPromises.delete(bot);
      throw err;
    });
    botInitPromises.set(bot, promise);
  }
  await promise;
}

// Declare Deno and EdgeRuntime globals for Supabase Functions
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
} | undefined;

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

export function getSbRegion(req?: Request): string {
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
      // ignore
    }
  }
  return "unknown";
}

export function categorizeDurations(stages: Record<string, number>): {
  databaseRpcDurationMs: number;
  telegramApiDurationMs: number;
} {
  let databaseRpcDurationMs = 0;
  let telegramApiDurationMs = 0;

  for (const [stage, duration] of Object.entries(stages)) {
    if (stage.startsWith("telegram_api")) {
      telegramApiDurationMs += duration;
    } else if (
      stage.startsWith("idempotency") ||
      stage.includes("rpc") ||
      stage.includes("user_") ||
      stage.includes("manager_") ||
      stage.includes("league_") ||
      stage.includes("db") ||
      stage.includes("query") ||
      stage.includes("fixture") ||
      stage.includes("squad") ||
      stage.includes("tactics")
    ) {
      databaseRpcDurationMs += duration;
    }
  }

  return {
    databaseRpcDurationMs: Number(databaseRpcDurationMs.toFixed(2)),
    telegramApiDurationMs: Number(telegramApiDurationMs.toFixed(2)),
  };
}

export async function handleTelegramWebhook(req: Request, deps: WebhookDependencies): Promise<Response> {
  const profiler = new RequestProfiler();
  (deps.bot as any).__currentProfiler = profiler;

  // 1. Health check for GET
  if (req.method === "GET") {
    return Response.json(
      {
        status: "ok",
        service: "telegram-webhook",
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  }

  // 2. CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { Allow: "GET, POST, OPTIONS" },
    });
  }

  // 3. Only POST is allowed for Telegram updates
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // 4. Secret token verification
  if (deps.secretToken && !verifySecretToken(req, deps.secretToken)) {
    deps.logger.warn({ event: "telegram_webhook_unauthorized" }, "Invalid Telegram secret token header");
    return Response.json({ error: "Unauthorized: invalid secret token" }, { status: 401 });
  }

  // 5. Parse Telegram Update
  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch (parseError: unknown) {
    deps.logger.error({ event: "telegram_update_json_parse_failed", err: parseError }, "Failed to parse update JSON");
    return Response.json({ error: "Bad request: invalid JSON payload" }, { status: 400 });
  }

  if (!update || typeof update.update_id !== "number") {
    return Response.json({ error: "Bad request: missing update_id" }, { status: 400 });
  }

  // 6. Idempotency Check
  const isNewUpdate = await profiler.time("idempotency_claim", () => claimTelegramUpdate(deps.database, update.update_id));
  if (!isNewUpdate) {
    deps.logger.warn(
      { event: "duplicate_telegram_update_skipped", updateId: update.update_id },
      "Skipping duplicate Telegram update"
    );
    return Response.json({ ok: true, skipped: true, reason: "duplicate_update" }, { status: 200 });
  }

  // 7. Process Update with Bot
  try {
    await profiler.time("bot_init", () => ensureBotInitialized(deps.bot));
    await deps.bot.handleUpdate(update);

    // Non-blocking completion: do not wait for DB write before returning response to Telegram
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
        stages: metrics.stages,
      },
      `[${sbRegion}] Telegram update ${update.update_id} processed in ${metrics.totalDurationMs}ms (DB/RPC: ${databaseRpcDurationMs}ms, Telegram API: ${telegramApiDurationMs}ms)`
    );

    return Response.json({ ok: true }, { status: 200 });
  } catch (error: unknown) {
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
        err: error,
      },
      `[${sbRegion}] Telegram update processing failed: ${message}`
    );

    // Return 200 to acknowledge Telegram, avoiding retry storms for application-level issues
    return Response.json({ ok: false, error: message }, { status: 200 });
  }
}
