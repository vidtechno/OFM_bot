import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

const validEnvironment = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  TELEGRAM_BOT_TOKEN: "test-token",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
};

describe("loadConfig", () => {
  it("valid environmentni parse qiladi", () => {
    expect(loadConfig(validEnvironment)).toMatchObject(validEnvironment);
  });

  it("majburiy secret yo'q bo'lsa tushunarli xato beradi", () => {
    expect(() => loadConfig({ ...validEnvironment, TELEGRAM_BOT_TOKEN: "" })).toThrow("TELEGRAM_BOT_TOKEN");
  });
});
