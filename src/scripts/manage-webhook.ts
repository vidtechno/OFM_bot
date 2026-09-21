import { loadConfig } from "../config/env.js";

export function resolveWebhookUrl(supabaseUrl: string, explicitUrl?: string): string {
  if (explicitUrl && explicitUrl.trim().length > 0) {
    return explicitUrl.trim();
  }
  const cleanUrl = supabaseUrl.replace(/\/+$/, "");
  return `${cleanUrl}/functions/v1/telegram-webhook`;
}

export interface WebhookInfoResult {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  last_synchronization_error_date?: number;
  max_connections?: number;
  allowed_updates?: string[];
}

export async function setWebhook(options: {
  botToken: string;
  webhookUrl: string;
  secretToken?: string | undefined;
  dropPendingUpdates?: boolean | undefined;
}): Promise<{ ok: boolean; description?: string }> {
  const endpoint = `https://api.telegram.org/bot${options.botToken}/setWebhook`;
  const body: Record<string, unknown> = {
    url: options.webhookUrl,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: options.dropPendingUpdates ?? false,
  };
  if (options.secretToken && options.secretToken.trim().length > 0) {
    body.secret_token = options.secretToken.trim();
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return (await response.json()) as { ok: boolean; description?: string };
}

export async function getWebhookInfo(botToken: string): Promise<{ ok: boolean; result?: WebhookInfoResult; description?: string }> {
  const endpoint = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;
  const response = await fetch(endpoint);
  return (await response.json()) as { ok: boolean; result?: WebhookInfoResult; description?: string };
}

export async function deleteWebhook(
  botToken: string,
  dropPendingUpdates = false
): Promise<{ ok: boolean; description?: string }> {
  const endpoint = `https://api.telegram.org/bot${botToken}/deleteWebhook`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drop_pending_updates: dropPendingUpdates }),
  });
  return (await response.json()) as { ok: boolean; description?: string };
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command || !["set", "info", "delete"].includes(command)) {
    process.stderr.write("Foydalanish: tsx src/scripts/manage-webhook.ts <set|info|delete> [--drop-pending]\n");
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  const webhookUrl = resolveWebhookUrl(config.SUPABASE_URL, config.TELEGRAM_WEBHOOK_URL);
  const dropPending = process.argv.includes("--drop-pending");

  if (command === "set") {
    process.stdout.write(`🔗 Telegram Webhook o'rnatilmoqda...\n`);
    process.stdout.write(`   URL: ${webhookUrl}\n`);
    if (config.TELEGRAM_WEBHOOK_SECRET) {
      process.stdout.write(`   Secret Token: [O'rnatilgan (${config.TELEGRAM_WEBHOOK_SECRET.length} belgi)]\n`);
    } else {
      process.stdout.write(`   Secret Token: [Mavjud emas]\n`);
    }

    const res = await setWebhook({
      botToken: config.TELEGRAM_BOT_TOKEN,
      webhookUrl,
      secretToken: config.TELEGRAM_WEBHOOK_SECRET,
      dropPendingUpdates: dropPending,
    });

    if (res.ok) {
      process.stdout.write(`\n✅ Webhook muvaffaqiyatli o'rnatildi!\n`);
      process.stdout.write(`Telegram endi barcha yangilanishlarni Supabase Edge Functionga yo'naltiradi.\n`);
    } else {
      process.stderr.write(`\n❌ Webhook o'rnatishda xatolik: ${res.description ?? "Noma'lum xato"}\n`);
      process.exitCode = 1;
    }
  } else if (command === "info") {
    process.stdout.write(`🔍 Telegram Webhook ma'lumotlari tekshirilmoqda...\n\n`);
    const res = await getWebhookInfo(config.TELEGRAM_BOT_TOKEN);

    if (res.ok && res.result) {
      const info = res.result;
      const status = info.url ? "FAOL (Active)" : "O'CHIRILGAN (Inactive / Polling)";
      const errorDate = info.last_error_date ? new Date(info.last_error_date * 1000).toLocaleString() : "Yo'q";

      process.stdout.write(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      process.stdout.write(`📡 Webhook Holati:         ${status}\n`);
      process.stdout.write(`🌐 Webhook URL:            ${info.url || "(o'rnatilmagan)"}\n`);
      process.stdout.write(`⏳ Kutilayotgan xabarlar:  ${info.pending_update_count}\n`);
      process.stdout.write(`⚠️ Oxirgi xatolik vaqti:   ${errorDate}\n`);
      if (info.last_error_message) {
        process.stdout.write(`❌ Oxirgi xatolik matni:   ${info.last_error_message}\n`);
      }
      process.stdout.write(`🔌 Max ulanishlar:         ${info.max_connections ?? "Standart"}\n`);
      process.stdout.write(`📋 Ruxsat berilgan turlar: ${(info.allowed_updates ?? []).join(", ") || "Barchasi"}\n`);
      process.stdout.write(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    } else {
      process.stderr.write(`❌ Webhook ma'lumotlarini olishda xato: ${res.description ?? "Noma'lum xato"}\n`);
      process.exitCode = 1;
    }
  } else if (command === "delete") {
    process.stdout.write(`🗑️ Telegram Webhook o'chirilmoqda...\n`);
    const res = await deleteWebhook(config.TELEGRAM_BOT_TOKEN, dropPending);

    if (res.ok) {
      process.stdout.write(`✅ Webhook muvaffaqiyatli o'chirildi!\n`);
      process.stdout.write(`Endi botni lokal 'npm run dev' orqali polling rejimida ishlatishingiz mumkin.\n`);
    } else {
      process.stderr.write(`❌ Webhookni o'chirishda xatolik: ${res.description ?? "Noma'lum xato"}\n`);
      process.exitCode = 1;
    }
  }
}

// Only execute main if run as script directly
if (process.argv[1]?.endsWith("manage-webhook.ts")) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Xatolik: ${msg}\n`);
    process.exitCode = 1;
  });
}
