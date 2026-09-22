import { describe, it, expect, vi } from "vitest";
import { formatTransferHub, formatClubPlayers, formatPlayerProfile, formatTransferHistory } from "../src/transfers/presentation.js";
import { TransferRepository } from "../src/transfers/transfer.repository.js";

describe("Transfer System & Presentation", () => {
  it("Transfer Hub budjet va g'aznani to'g'ri ko'rsatadi", () => {
    const hub = formatTransferHub("Real Madrid", 50_000_000, 25_000_000);
    expect(hub).toContain("REAL MADRID — TRANSFER");
    expect(hub).toContain("€50M");
    expect(hub).toContain("💰 Budjet: <b>€50M</b>");
  });

  it("Raqib klub tarkibi formatlanadi", () => {
    const players = [
      {
        clubPlayerId: "cp-1",
        name: "Erling Haaland",
        clubName: "Manchester City",
        position: "ST",
        overall: 91,
        marketValue: 180_000_000,
      },
    ];
    const text = formatClubPlayers("Manchester City", players);
    expect(text).toContain("MANCHESTER CITY — FUTBOLCHILAR");
    expect(text).toContain("1. <b>Erling Haaland</b>");
    expect(text).toContain("ST · ⭐91 · €180M");
  });

  it("Futbolchi profili va transfer taklifi ekrani formatlanadi", () => {
    const player = {
      clubPlayerId: "cp-1",
      name: "K. De Bruyne",
      clubName: "Manchester City",
      position: "CM",
      overall: 90,
      marketValue: 60_000_000,
      age: 33,
      nationality: "Belgiya",
    };
    const profile = formatPlayerProfile(player);
    expect(profile).toContain("K. DE BRUYNE");
    expect(profile).toContain("Manchester City");
    expect(profile).toContain("⭐ OVR: <b>90</b>");
    expect(profile).toContain("🎂 Yosh: <b>33</b>");
    expect(profile).toContain("€60M");
  });

  it("Barcha Telegram callback_data satrlari 64 baytdan oshmaydi (Stateless invariant)", () => {
    const clubId = "12345678-1234-1234-1234-123456789abc";
    const clubPlayerId = "abcdef12-3456-7890-abcd-ef1234567890";
    const listingId = "fedcba98-7654-3210-fedc-ba9876543210";
    const offerId = "11223344-5566-7788-99aa-bbccddeeff00";

    const callbacks = [
      `tr:${clubId}`,
      `tf:${clubId}:0`,
      `tk:${clubId}:0`,
      `tp:${clubPlayerId}`,
      `of:${clubPlayerId}:120`,
      `of:${clubPlayerId}:130`,
      `of:${clubPlayerId}:140`,
      `of:${clubPlayerId}:150`,
      `oc:${clubPlayerId}`,
      `ts:${clubId}`,
      `tl:${clubPlayerId}`,
      `io:${clubId}`,
      `iv:${offerId}`,
      `ia:${offerId}`,
      `ir:${offerId}`,
      `ic:${offerId}`,
      `ac:${offerId}`,
      `th:${clubId}`,
      `gm:${clubId}:0:ALL`,
      `gb:${listingId}`,
      `gc:${listingId}`,
    ];

    for (const cb of callbacks) {
      const byteLen = new TextEncoder().encode(cb).length;
      expect(byteLen).toBeLessThanOrEqual(64);
    }
  });

  it("TransfersRepository.leagueClubs faqat bir xil liga instancedagi klublarni qaytaradi", async () => {
    const mockDb: any = {
      from: vi.fn((table: string) => {
        if (table === "league_clubs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { league_instance_id: "league-instance-la-liga" },
                    error: null,
                  }),
                }),
                neq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      { id: "club-barca", clubs: [{ name: "FC Barcelona" }] },
                      { id: "club-atletico", clubs: [{ name: "Atletico Madrid" }] },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn() };
      }),
    };

    const repo = new TransferRepository(mockDb);
    const clubs = await repo.leagueClubs("user-1", "club-madrid");
    expect(clubs.length).toBe(2);
    expect(clubs[0]?.clubName).toBe("FC Barcelona");
    expect(clubs[1]?.clubName).toBe("Atletico Madrid");
  });
});
