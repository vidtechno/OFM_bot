import type { User as TelegramUser } from "grammy/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RegisteredUser {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  language_code: string | null;
  is_blocked: boolean;
}

export class UserRepository {
  constructor(private readonly database: SupabaseClient) {}

  async upsertFromTelegram(user: TelegramUser): Promise<RegisteredUser> {
    const record = {
      telegram_id: user.id,
      username: user.username ?? null,
      first_name: user.first_name,
      last_name: user.last_name ?? null,
      language_code: user.language_code ?? null,
      last_seen_at: new Date().toISOString(),
    };

    const { data, error } = await this.database
      .from("users")
      .upsert(record, { onConflict: "telegram_id" })
      .select("id, telegram_id, username, first_name, last_name, language_code, is_blocked")
      .single();

    if (error) throw new Error(`Telegram userni saqlashda xato: ${error.message}`);
    return data as RegisteredUser;
  }
}
