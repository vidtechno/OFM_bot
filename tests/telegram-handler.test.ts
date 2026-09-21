import { describe, expect, it, vi } from "vitest";
import { handleTelegramWebhook, verifySecretToken } from "../src/webhook/telegram-handler.js";
import type { Bot, Context } from "grammy";
import type { SupabaseClient } from "@supabase/supabase-js";

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe("verifySecretToken", () => {
  it("secretToken belgilanmagan bo'lsa har doim true qaytaradi", () => {
    const req = new Request("https://example.com", { method: "POST" });
    expect(verifySecretToken(req)).toBe(true);
    expect(verifySecretToken(req, undefined)).toBe(true);
  });

  it("headerdagi token kutilgan token bilan to'g'ri kelsa true qaytaradi", () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "my-secret-123" },
    });
    expect(verifySecretToken(req, "my-secret-123")).toBe(true);
  });

  it("headerdagi token mos kelmasa false qaytaradi", () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "wrong-secret" },
    });
    expect(verifySecretToken(req, "my-secret-123")).toBe(false);
  });
});

describe("ensureBotInitialized", () => {
  it("bir necha parallel chaqiriqlarda bot.init() ni faqat bir marta bajaradi", async () => {
    let inited = false;
    let initCalls = 0;
    const mockBot = {
      isInited: () => inited,
      init: vi.fn().mockImplementation(async () => {
        initCalls++;
        await new Promise((r) => setTimeout(r, 10));
        inited = true;
      }),
    } as unknown as Bot<Context>;

    const { ensureBotInitialized } = await import("../src/webhook/telegram-handler.js");

    // 5 ta parallel chaqiriq
    await Promise.all([
      ensureBotInitialized(mockBot),
      ensureBotInitialized(mockBot),
      ensureBotInitialized(mockBot),
      ensureBotInitialized(mockBot),
      ensureBotInitialized(mockBot),
    ]);

    expect(initCalls).toBe(1);
    expect(mockBot.init).toHaveBeenCalledTimes(1);
    expect(inited).toBe(true);

    // Keyingi chaqiriqda yana chaqirilmasligi kerak
    await ensureBotInitialized(mockBot);
    expect(initCalls).toBe(1);
  });
});

describe("handleTelegramWebhook", () => {
  it("GET so'roviga 200 OK health check qaytaradi", async () => {
    const req = new Request("https://example.com/functions/v1/telegram-webhook", { method: "GET" });
    const res = await handleTelegramWebhook(req, {
      bot: {} as unknown as Bot<Context>,
      database: {} as unknown as SupabaseClient,
      logger: createMockLogger(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "ok",
      service: "telegram-webhook",
    });
    expect(body.timestamp).toBeDefined();
  });

  it("OPTIONS so'roviga 204 No Content qaytaradi", async () => {
    const req = new Request("https://example.com", { method: "OPTIONS" });
    const res = await handleTelegramWebhook(req, {
      bot: {} as unknown as Bot<Context>,
      database: {} as unknown as SupabaseClient,
      logger: createMockLogger(),
    });
    expect(res.status).toBe(204);
  });

  it("POST bo'lmagan boshqa methodlarga (masalan, PUT) 405 qaytaradi", async () => {
    const req = new Request("https://example.com", { method: "PUT" });
    const res = await handleTelegramWebhook(req, {
      bot: {} as unknown as Bot<Context>,
      database: {} as unknown as SupabaseClient,
      logger: createMockLogger(),
    });
    expect(res.status).toBe(405);
  });

  it("noto'g'ri secret token bilan 401 qaytaradi", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-bot-api-secret-token": "invalid",
      },
      body: JSON.stringify({ update_id: 100 }),
    });

    const res = await handleTelegramWebhook(req, {
      bot: {} as unknown as Bot<Context>,
      database: {} as unknown as SupabaseClient,
      secretToken: "expected-token",
      logger: createMockLogger(),
    });

    expect(res.status).toBe(401);
  });

  it("noto'g'ri yoki update_id bo'lmagan JSON bilan 400 qaytaradi", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });

    const res = await handleTelegramWebhook(req, {
      bot: {} as unknown as Bot<Context>,
      database: {} as unknown as SupabaseClient,
      logger: createMockLogger(),
    });

    expect(res.status).toBe(400);
  });

  it("takroriy update kelganda (idempotency) bot chaqirilmasdan darhol 200 qaytaradi", async () => {
    const mockBot = { handleUpdate: vi.fn() } as unknown as Bot<Context>;
    const mockDb = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          error: { code: "23505", message: "duplicate key value violates unique constraint" },
        }),
      }),
    } as unknown as SupabaseClient;

    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ update_id: 99999 }),
    });

    const res = await handleTelegramWebhook(req, {
      bot: mockBot,
      database: mockDb,
      logger: createMockLogger(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, skipped: true, reason: "duplicate_update" });
    expect(mockBot.handleUpdate).not.toHaveBeenCalled();
  });

  it("yangi update muvaffaqiyatli qabul qilinib bot.handleUpdate chaqiriladi", async () => {
    const mockBot = { handleUpdate: vi.fn().mockResolvedValue(undefined) } as unknown as Bot<Context>;
    const mockUpdateFn = vi.fn().mockResolvedValue({ error: null });
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "telegram_processed_updates") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnValue({
              eq: mockUpdateFn,
            }),
          };
        }
        return {};
      }),
    } as unknown as SupabaseClient;

    const updatePayload = {
      update_id: 12345,
      message: { message_id: 1, text: "/start", chat: { id: 100 } },
    };

    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatePayload),
    });

    const res = await handleTelegramWebhook(req, {
      bot: mockBot,
      database: mockDb,
      logger: createMockLogger(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockBot.handleUpdate).toHaveBeenCalledWith(updatePayload);
  });

  it("bot initialize qilinmagan bo'lsa avval bot.init chaqiriladi", async () => {
    const mockBot = {
      isInited: vi.fn().mockReturnValue(false),
      init: vi.fn().mockResolvedValue(undefined),
      handleUpdate: vi.fn().mockResolvedValue(undefined),
    } as unknown as Bot<Context>;

    const mockDb = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    } as unknown as SupabaseClient;

    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ update_id: 11111 }),
    });

    const res = await handleTelegramWebhook(req, {
      bot: mockBot,
      database: mockDb,
      logger: createMockLogger(),
    });

    expect(res.status).toBe(200);
    expect(mockBot.init).toHaveBeenCalledTimes(1);
    expect(mockBot.handleUpdate).toHaveBeenCalledTimes(1);
  });

  it("bot.init xatolik bersa xatolik ushlanadi, status failed bo'ladi va log yoziladi", async () => {
    const mockBot = {
      isInited: vi.fn().mockReturnValue(false),
      init: vi.fn().mockRejectedValue(new Error("Telegram API unreachable")),
      handleUpdate: vi.fn(),
    } as unknown as Bot<Context>;

    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const mockDb = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({ eq: updateEqMock }),
      }),
    } as unknown as SupabaseClient;

    const logger = createMockLogger();
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ update_id: 22222 }),
    });

    const res = await handleTelegramWebhook(req, {
      bot: mockBot,
      database: mockDb,
      logger,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Telegram API unreachable");
    expect(updateEqMock).toHaveBeenCalledWith("update_id", 22222);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("getSbRegion", () => {
  it("forceFunctionRegion query parametri bo'lsa uni aniqlaydi", async () => {
    const { getSbRegion } = await import("../src/webhook/telegram-handler.js");
    const req = new Request("https://example.supabase.co/functions/v1/telegram-webhook?forceFunctionRegion=ap-southeast-2");
    expect(getSbRegion(req)).toBe("ap-southeast-2");
  });

  it("x-sb-edge-region header bo'lsa uni aniqlaydi", async () => {
    const { getSbRegion } = await import("../src/webhook/telegram-handler.js");
    const req = new Request("https://example.supabase.co/functions/v1/telegram-webhook", {
      headers: { "x-sb-edge-region": "eu-central-1" },
    });
    expect(getSbRegion(req)).toBe("eu-central-1");
  });
});

describe("categorizeDurations", () => {
  it("bosqichlarni DB/RPC va Telegram API turlariga to'g'ri ajratadi", async () => {
    const { categorizeDurations } = await import("../src/webhook/telegram-handler.js");
    const stages = {
      idempotency_claim: 25.5,
      user_start_state_rpc: 45.2,
      "telegram_api:sendMessage": 120.3,
      bot_init: 0.1,
    };
    const result = categorizeDurations(stages);
    expect(result.databaseRpcDurationMs).toBe(70.7);
    expect(result.telegramApiDurationMs).toBe(120.3);
  });
});


