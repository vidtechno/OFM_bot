import { describe, expect, it } from "vitest";
import { MAIN_MENU, createMainKeyboard } from "../src/bot/keyboards.js";

describe("Bot Flow Stability & Callback Length Audits", () => {
  const sampleClubId = "11111111-2222-3333-4444-555555555555";
  const samplePlayerId = "66666666-7777-8888-9999-000000000000";
  const slotKeys = ["GK", "LB", "LCB", "CB", "RCB", "RB", "LWB", "RWB", "LM", "CDM", "CM", "CAM", "RM", "LW", "ST", "RW", "CF"];

  it("barcha callback query stringlari 64 bayt limitidan oshmaydi", () => {
    for (const slot of slotKeys) {
      const xslotCallback = `xslot:${slot}:${sampleClubId}`;
      const xpickCallback = `xpick:${slot}:${samplePlayerId}`;
      expect(new TextEncoder().encode(xslotCallback).length).toBeLessThanOrEqual(64);
      expect(new TextEncoder().encode(xpickCallback).length).toBeLessThanOrEqual(64);
    }

    const callbacks = [
      `xsl:${sampleClubId}`,
      `xa:${sampleClubId}`,
      `xi:${sampleClubId}`,
      `fm:${sampleClubId}`,
      `tc:${sampleClubId}`,
      `sq:${sampleClubId}`,
      `db:${sampleClubId}`,
      `tr:${sampleClubId}`,
    ];

    for (const cb of callbacks) {
      expect(new TextEncoder().encode(cb).length).toBeLessThanOrEqual(64);
    }
  });

  it("bosh menyu klaviaturasi 2x2 gridda transfer tugmasini o'z ichiga oladi", () => {
    const keyboard = createMainKeyboard(false);
    expect(keyboard.keyboard.length).toBe(2);
    expect(keyboard.keyboard[0]?.[0]?.text).toBe(MAIN_MENU.club);
    expect(keyboard.keyboard[0]?.[1]?.text).toBe(MAIN_MENU.leagues);
    expect(keyboard.keyboard[1]?.[0]?.text).toBe(MAIN_MENU.transfer);
    expect(keyboard.keyboard[1]?.[1]?.text).toBe(MAIN_MENU.profile);
  });
});
