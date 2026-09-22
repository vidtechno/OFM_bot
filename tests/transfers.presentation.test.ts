import { describe, expect, it } from "vitest";
import { formatMarket, formatListing } from "../src/transfers/presentation.js";

const player = {
  listingId: "1",
  name: "Star Player",
  age: 24,
  position: "ST",
  overall: 87,
  askingPrice: 100_000_000,
  availableUntil: "x",
};

describe("transfer presentation", () => {
  it("market narxini chiqaradi", () => {
    expect(formatMarket([player])).toContain("€100M");
  });

  it("listing tafsilotini chiqaradi", () => {
    expect(formatListing(player)).toContain("⭐<b>87</b>");
  });
});
