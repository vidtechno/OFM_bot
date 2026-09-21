import { describe, expect, it } from "vitest";
import { createMainKeyboard, MAIN_MENU } from "../src/bot/keyboards.js";

describe("main keyboard", () => {
  it("2x2 navigation yaratadi", () => {
    const keyboard = JSON.parse(JSON.stringify(createMainKeyboard())) as {
      keyboard: Array<Array<{ text: string }>>;
      resize_keyboard: boolean;
      is_persistent: boolean;
    };
    expect(keyboard.keyboard).toEqual([
      [{ text: MAIN_MENU.club }, { text: MAIN_MENU.leagues }],
      [{ text: MAIN_MENU.profile }],
    ]);
    expect(keyboard.resize_keyboard).toBe(true);
    expect(keyboard.is_persistent).toBe(true);
  });
});
