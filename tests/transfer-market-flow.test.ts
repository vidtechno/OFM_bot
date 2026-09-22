import { describe, expect, it } from "vitest";
import { formatLeagueMarket, formatLeagueListing } from "../src/transfers/presentation.js";
import type { MarketPlayer } from "../src/transfers/transfer.repository.js";

describe("Transfer Market & League Market Presentation", () => {
  it("formatLeagueMarket in-league futbolchilar ro'yxatini to'g'ri chiqaradi", () => {
    const players: MarketPlayer[] = [
      {
        listingId: "list-1",
        name: "L. Modrić",
        age: 38,
        position: "CM",
        overall: 86,
        askingPrice: 15_000_000,
        availableUntil: new Date().toISOString(),
        sellerName: "Real Madrid",
        isOwnListing: true,
      },
      {
        listingId: "list-2",
        name: "Pedri",
        age: 21,
        position: "CM",
        overall: 88,
        askingPrice: 75_000_000,
        availableUntil: new Date().toISOString(),
        sellerName: "Barcelona",
        isOwnListing: false,
      },
    ];

    const formatted = formatLeagueMarket(players);
    expect(formatted).toContain("🛒 LIGA TRANSFER BOZORI");
    expect(formatted).toContain("1. L. Modrić (Real Madrid) — CM — ⭐86 — €15.0M 🏷 [Sizniki]");
    expect(formatted).toContain("2. Pedri (Barcelona) — CM — ⭐88 — €75.0M");
  });

  it("formatLeagueListing yagona futbolchi tafsilotlarini va sotuvchi holatini ko'rsatadi", () => {
    const player: MarketPlayer = {
      listingId: "list-1",
      name: "Vinícius Jr.",
      age: 23,
      position: "LW",
      overall: 90,
      askingPrice: 150_000_000,
      availableUntil: new Date().toISOString(),
      sellerName: "Real Madrid",
      isOwnListing: true,
    };

    const formatted = formatLeagueListing(player);
    expect(formatted).toContain("🛒 LIGA TRANSFERI");
    expect(formatted).toContain("⚽ Vinícius Jr.");
    expect(formatted).toContain("🏟 Sotuvchi klub: Real Madrid");
    expect(formatted).toContain("⭐ Mahorat: ⭐90");
    expect(formatted).toContain("💰 Narxi: €150.0M");
    expect(formatted).toContain("ℹ️ Bu sizning sotuvga qo‘ygan futbolchingiz.");
  });
});
