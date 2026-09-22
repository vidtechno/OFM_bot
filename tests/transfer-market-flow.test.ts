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

    const formatted = formatLeagueMarket(players, "LaLiga #0001");
    expect(formatted).toContain("🛒 <b>TRANSFER BOZORI</b>");
    expect(formatted).toContain("<i>LaLiga #0001</i>");
    expect(formatted).toContain("1. <b>L. Modrić</b>");
    expect(formatted).toContain("CM · ⭐86 · €15M");
    expect(formatted).toContain("<i>Real Madrid</i> 🏷 <i>[Sizniki]</i>");
    expect(formatted).toContain("2. <b>Pedri</b>");
    expect(formatted).toContain("CM · ⭐88 · €75M");
    expect(formatted).toContain("<i>Barcelona</i>");
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
    expect(formatted).toContain("🛒 <b>LIGA TRANSFERI</b>");
    expect(formatted).toContain("⚽ <b>Vinícius Jr.</b>");
    expect(formatted).toContain("🏟 Real Madrid");
    expect(formatted).toContain("⭐ OVR: <b>90</b>");
    expect(formatted).toContain("💰 Narxi: <b>€150M</b>");
    expect(formatted).toContain("ℹ️ <i>Bu sizning sotuvga qo‘ygan futbolchingiz.</i>");
  });
});
