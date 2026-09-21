import { describe, expect, it } from "vitest";
import { resolveWebhookUrl } from "../src/scripts/manage-webhook.js";

describe("resolveWebhookUrl", () => {
  it("SUPABASE_URL orqali to'g'ri Edge Function webhook URL generatsiya qiladi", () => {
    const url = resolveWebhookUrl("https://xyzcompany.supabase.co");
    expect(url).toBe("https://xyzcompany.supabase.co/functions/v1/telegram-webhook");
  });

  it("trailing slash bo'lganda ham to'g'ri ishlaydi", () => {
    const url = resolveWebhookUrl("https://xyzcompany.supabase.co///");
    expect(url).toBe("https://xyzcompany.supabase.co/functions/v1/telegram-webhook");
  });

  it("agar explicit TELEGRAM_WEBHOOK_URL berilgan bo'lsa uni ustun qo'yadi", () => {
    const customUrl = "https://custom-domain.com/webhook";
    const url = resolveWebhookUrl("https://xyzcompany.supabase.co", customUrl);
    expect(url).toBe(customUrl);
  });
});
