import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN kiritilmagan"),
  SUPABASE_URL: z.url("SUPABASE_URL noto'g'ri URL"),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY kiritilmagan"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY kiritilmagan"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ADMIN_TELEGRAM_IDS: z.string().default("6117815120").transform((value)=>value.split(",").map((id)=>Number(id.trim())).filter(Number.isSafeInteger)),
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  TELEGRAM_WEBHOOK_URL: z.string().url("TELEGRAM_WEBHOOK_URL noto'g'ri URL").optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === "production" && data.BOT_MODE === "polling") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["BOT_MODE"],
      message: "Long polling productionda ruxsat etilmagan. Productionda BOT_MODE=webhook bo'lishi kerak.",
    });
  }
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Environment sozlamalari noto'g'ri:\n${details}`);
  }
  return result.data;
}
