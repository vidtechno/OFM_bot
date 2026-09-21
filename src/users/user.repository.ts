import type { User as TelegramUser } from "grammy/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManagedClub } from "../leagues/types.js";

export interface RegisteredUser {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  language_code: string | null;
  is_blocked: boolean;
}

export interface UserStartState {
  user: RegisteredUser;
  managedClubs: ManagedClub[];
}

export class UserRepository {
  private readonly userCache = new Map<number, { user: RegisteredUser; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 15_000; // 15 seconds warm cache

  constructor(private readonly database: SupabaseClient) {}

  getCachedUser(telegramId: number): RegisteredUser | undefined {
    const entry = this.userCache.get(telegramId);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.userCache.delete(telegramId);
      return undefined;
    }
    return entry.user;
  }

  setCachedUser(user: RegisteredUser): void {
    this.userCache.set(user.telegram_id, {
      user,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }

  async upsertFromTelegram(user: TelegramUser, forceRefresh = false): Promise<RegisteredUser> {
    if (!forceRefresh) {
      const cached = this.getCachedUser(user.id);
      if (cached) return cached;
    }

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
    const registered = data as RegisteredUser;
    this.setCachedUser(registered);
    return registered;
  }

  async getStartState(user: TelegramUser): Promise<UserStartState> {
    try {
      const { data, error } = await this.database.rpc("get_user_start_state", {
        p_telegram_id: user.id,
        p_username: user.username ?? null,
        p_first_name: user.first_name,
        p_last_name: user.last_name ?? null,
        p_language_code: user.language_code ?? null,
      });

      if (!error && data?.user) {
        const registered = data.user as RegisteredUser;
        this.setCachedUser(registered);
        return {
          user: registered,
          managedClubs: (data.managedClubs ?? []) as ManagedClub[],
        };
      }
    } catch {
      // Fallback if RPC is not deployed or transient error
    }

    // Fallback: standard upsert
    const registered = await this.upsertFromTelegram(user);
    return {
      user: registered,
      managedClubs: [],
    };
  }
}
