import { describe, expect, it } from "vitest";
import { formatClubDashboard } from "../src/leagues/presentation.js";
import { formatFinances } from "../src/matches/presentation.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

describe("Finance Model & 100M Budget Test Suite", () => {
  const config = loadConfig();
  const db = createDatabaseClient(config);

  it("Elite clubs have transfer_budget = 100,000,000 and Uzbek clubs have transfer_budget = 7,000,000", async () => {
    const { data: clubs, error } = await db
      .from("league_clubs")
      .select("id, transfer_budget, reserved_transfer_budget, league_instances!inner(status, competitions!inner(code))");

    expect(error).toBeNull();
    expect(clubs).toBeDefined();

    for (const club of clubs || []) {
      const compCode = (club.league_instances as any)?.competitions?.code ?? "ELITE";
      const status = (club.league_instances as any)?.status;
      const isUzbek = compCode === "UZB";
      const initialBudget = isUzbek ? 7_000_000 : 100_000_000;
      expect(Number(club.transfer_budget)).toBeGreaterThanOrEqual(0);
      if (status === "OPEN") {
        expect(Number(club.transfer_budget)).toBe(initialBudget);
      } else {
        // In active leagues, budget can increase via player sales
        expect(Number(club.transfer_budget)).toBeLessThanOrEqual(initialBudget * 3);
      }
    }
  });


  it("formatClubDashboard does not display G'azna and displays Transfer budjeti", () => {
    const text = formatClubDashboard(
      {
        leagueClubId: "test-id",
        clubName: "Real Madrid",
        competitionName: "OFM Elite League",
        leagueName: "OFM Elite League #0001",
        position: 1,
        points: 3,
        budget: 100_000_000,
      },
      "@manager",
      "<b>vs Barcelona</b>\n<i>Bugun · 20:00</i>",
      87
    );

    expect(text).toContain("💰 Transfer budjeti: <b>€100M</b>");
    expect(text).not.toContain("G‘azna");
    expect(text).not.toContain("Gazna");
  });

  it("formatFinances correctly shows available budget and transaction history without G'azna", () => {
    const text = formatFinances({
      cashBalance: 100_000_000,
      transferBudget: 100_000_000,
      reservedTransferBudget: 25_000_000,
      transactions: [
        {
          kind: "TRANSFER_BUY",
          amount: -25_000_000,
          description: "K. Mbappe xaridi",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    expect(text).toContain("💰 Transfer budjeti: <b>€100M</b>");
    expect(text).toContain("🔒 Band qilingan: <b>€25M</b>");
    expect(text).toContain("💵 Mavjud budjet: <b>€75M</b>");
    expect(text).not.toContain("G‘azna");
    expect(text).toContain("K. Mbappe xaridi");
  });
});
