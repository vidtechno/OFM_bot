import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml } from "../lib/html.js";

export interface LeagueNewsItem {
  id: string;
  leagueInstanceId: string;
  eventType: "MATCH_RESULT" | "MILESTONE" | "TABLE_MOVEMENT" | "STREAK" | "TRANSFER" | "CHAMPION" | string;
  headline: string;
  payload: Record<string, any>;
  dedupKey?: string | null;
  createdAt: string;
}

export class NewsService {
  constructor(private readonly database: SupabaseClient) {}

  async publishNews(
    leagueInstanceId: string,
    eventType: string,
    headline: string,
    payload: Record<string, any> = {},
    dedupKey?: string
  ): Promise<boolean> {
    const { data, error } = await this.database
      .from("league_news")
      .upsert(
        {
          league_instance_id: leagueInstanceId,
          event_type: eventType,
          headline,
          payload,
          dedup_key: dedupKey ?? null,
        },
        { onConflict: "dedup_key", ignoreDuplicates: true }
      )
      .select("id");

    if (error) {
      // Ignore conflict error
      return false;
    }
    return Boolean(data && data.length > 0);
  }

  async listNews(
    leagueInstanceId: string,
    page = 1,
    pageSize = 5
  ): Promise<{ items: LeagueNewsItem[]; page: number; totalPages: number; totalCount: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await this.database
      .from("league_news")
      .select("id, league_instance_id, event_type, headline, payload, dedup_key, created_at", {
        count: "exact",
      })
      .eq("league_instance_id", leagueInstanceId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const totalCount = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    const items: LeagueNewsItem[] = (data ?? []).map((row: any) => ({
      id: row.id,
      leagueInstanceId: row.league_instance_id,
      eventType: row.event_type,
      headline: row.headline,
      payload: row.payload ?? {},
      dedupKey: row.dedup_key,
      createdAt: row.created_at,
    }));

    return { items, page, totalPages, totalCount };
  }

  formatNewsFeed(
    items: LeagueNewsItem[],
    page: number,
    totalPages: number,
    leagueName: string
  ): string {
    const lines = [
      "📰 <b>LIGA YANGILIKLARI</b>",
      `<i>${escapeHtml(leagueName)}</i>`,
      "",
    ];

    if (!items.length) {
      lines.push("<i>Hozircha liga yangiliklari mavjud emas.</i>");
      return lines.join("\n");
    }

    for (const item of items) {
      lines.push(item.headline, "");
    }

    return lines.join("\n").trim();
  }
}
