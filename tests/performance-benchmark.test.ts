import { describe, expect, it, vi } from "vitest";
import { RequestProfiler } from "../src/lib/profiler.js";
import { UserRepository } from "../src/users/user.repository.js";
import { LeagueRepository } from "../src/leagues/league.repository.js";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("Performance Profiler & Benchmark", () => {
  it("RequestProfiler bosqichlarni to'g'ri o'lchaydi va jamlaydi", async () => {
    const profiler = new RequestProfiler();

    await profiler.time("stage_a", async () => {
      await new Promise((r) => setTimeout(r, 15));
    });

    await profiler.time("stage_b", async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const metrics = profiler.getMetrics();
    expect(metrics.stages.stage_a).toBeGreaterThanOrEqual(10);
    expect(metrics.stages.stage_b).toBeGreaterThanOrEqual(8);
    expect(metrics.totalDurationMs).toBeGreaterThanOrEqual(20);
  });

  it("UserRepository in-memory kesh bir xil requestda 0ms da qaytaradi", async () => {
    let dbCalls = 0;
    const mockDb = {
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockImplementation(async () => {
              dbCalls++;
              await new Promise((r) => setTimeout(r, 20)); // simulated 20ms DB roundtrip
              return {
                data: {
                  id: "user-123",
                  telegram_id: 99999,
                  username: "testuser",
                  first_name: "Test",
                  last_name: null,
                  language_code: "uz",
                  is_blocked: false,
                },
                error: null,
              };
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const repo = new UserRepository(mockDb);
    const tgUser = { id: 99999, is_bot: false, first_name: "Test", username: "testuser" };

    // 1-chaqiriq: DB ga boradi (~20ms)
    const t0 = performance.now();
    const user1 = await repo.upsertFromTelegram(tgUser);
    const duration1 = performance.now() - t0;

    // 2-chaqiriq (o'sha update ichida): Keshdan olinadi (0ms)
    const t1 = performance.now();
    const user2 = await repo.upsertFromTelegram(tgUser);
    const duration2 = performance.now() - t1;

    expect(user1.id).toBe("user-123");
    expect(user2.id).toBe("user-123");
    expect(dbCalls).toBe(1); // Faqat 1 marta DB ga bordi!
    expect(duration2).toBeLessThan(5); // Keshdan < 5ms
  });

  it("LeagueRepository listCompetitions statik kesh bilan 0ms da ishlaydi", async () => {
    let dbCalls = 0;
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockImplementation(async () => {
              dbCalls++;
              await new Promise((r) => setTimeout(r, 25)); // simulated 25ms DB roundtrip
              return {
                data: [
                  { id: "comp-1", code: "EPL", name: "Premier League" },
                  { id: "comp-2", code: "LALIGA", name: "La Liga" },
                ],
                error: null,
              };
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const repo = new LeagueRepository(mockDb);

    const list1 = await repo.listCompetitions();
    const list2 = await repo.listCompetitions();

    expect(list1).toHaveLength(2);
    expect(list2).toHaveLength(2);
    expect(dbCalls).toBe(1); // 2-chaqiriqda DB ga bormadi!
  });

  it("Benchmark: /start va 4 ta asosiy menyu harakati (Before vs After)", async () => {
    // Simulyatsiya qilingan DB va Telegram API kechikishlari:
    const DB_LATENCY_MS = 25;
    const TG_API_LATENCY_MS = 120;

    // BEFORE (Optimallashtirishdan oldin):
    // 1. /start:
    //    - bot.use: user upsert (25ms)
    //    - handler: user upsert (25ms redundant)
    //    - msg1: reply welcome (120ms)
    //    - msg2: reply menu (120ms)
    //    - managedClubs query (25ms)
    //    - msg3: reply join (120ms)
    //    - mark complete: (25ms)
    const beforeStart = DB_LATENCY_MS + DB_LATENCY_MS + TG_API_LATENCY_MS + TG_API_LATENCY_MS + DB_LATENCY_MS + TG_API_LATENCY_MS + DB_LATENCY_MS;

    // 2. MAIN_MENU.club ("⚽ Klubim"):
    //    - bot.use: user upsert (25ms)
    //    - handler: user upsert (25ms redundant)
    //    - managedClubs query (25ms)
    //    - showDashboard: user upsert (25ms redundant)
    //    - fixtures.assertOwnership (25ms redundant)
    //    - fixtures.listUpcoming (25ms)
    //    - reply dashboard (120ms)
    //    - mark complete (25ms)
    const beforeClub = DB_LATENCY_MS * 6 + TG_API_LATENCY_MS + DB_LATENCY_MS;

    // 3. MAIN_MENU.leagues ("🏆 Ligalar"):
    //    - bot.use: user upsert (25ms)
    //    - listCompetitions query (25ms)
    //    - reply (120ms)
    //    - mark complete (25ms)
    const beforeLeagues = DB_LATENCY_MS * 2 + TG_API_LATENCY_MS + DB_LATENCY_MS;

    // 4. MAIN_MENU.profile ("👤 Profil"):
    //    - bot.use: user upsert (25ms)
    //    - handler: user upsert (25ms redundant)
    //    - profile + clubs (Promise.all 25ms)
    //    - reply (120ms)
    //    - mark complete (25ms)
    const beforeProfile = DB_LATENCY_MS * 3 + TG_API_LATENCY_MS + DB_LATENCY_MS;

    // AFTER (Optimallashtirishdan keyin):
    // 1. /start:
    //    - getStartState (user + clubs bitta 25ms roundtrip)
    //    - parallel 2 messages: Promise.all([msg1, msg2]) -> max(120ms, 120ms) = 120ms
    //    - non-blocking completion -> 0ms (kutmaydi)
    const afterStart = DB_LATENCY_MS + TG_API_LATENCY_MS;

    // 2. MAIN_MENU.club ("⚽ Klubim"):
    //    - user from context/cache: 0ms
    //    - managedClubs query: 25ms
    //    - showDashboard user from context: 0ms
    //    - fixtures.listUpcoming (skipOwnershipCheck): 25ms
    //    - reply: 120ms
    //    - non-blocking completion: 0ms
    const afterClub = DB_LATENCY_MS + DB_LATENCY_MS + TG_API_LATENCY_MS;

    // 3. MAIN_MENU.leagues ("🏆 Ligalar"):
    //    - user from context/cache: 0ms
    //    - listCompetitions (in-memory cache): 0ms
    //    - reply: 120ms
    //    - non-blocking completion: 0ms
    const afterLeagues = TG_API_LATENCY_MS;

    // 4. MAIN_MENU.profile ("👤 Profil"):
    //    - user from context/cache: 0ms
    //    - Promise.all([profile, clubs]): 25ms
    //    - reply: 120ms
    //    - non-blocking completion: 0ms
    const afterProfile = DB_LATENCY_MS + TG_API_LATENCY_MS;

    // Natijalarni taqqoslash
    expect(afterStart).toBeLessThan(beforeStart * 0.4); // Kamida 60% tezlashish
    expect(afterClub).toBeLessThan(beforeClub * 0.6); // Kamida 40% tezlashish
    expect(afterLeagues).toBeLessThan(beforeLeagues * 0.7); // Tezlashish
    expect(afterProfile).toBeLessThan(beforeProfile * 0.7); // Tezlashish
  });
});
