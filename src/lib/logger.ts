import pino from "pino";
import type { AppConfig } from "../config/env.js";

export function createLogger(config: Pick<AppConfig, "LOG_LEVEL" | "NODE_ENV">) {
  return pino({
    level: config.LOG_LEVEL,
    base: { service: "ofm-game-bot", environment: config.NODE_ENV },
    redact: {
      paths: ["token", "TELEGRAM_BOT_TOKEN", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"],
      censor: "[REDACTED]",
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
