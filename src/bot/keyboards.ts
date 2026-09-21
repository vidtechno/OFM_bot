import { Keyboard } from "grammy";

export const MAIN_MENU = {
  club: "⚽ Klubim",
  leagues: "🏆 Ligalar",
  transfer: "🌍 Transfer",
  profile: "👤 Profil",
  admin: "🛠 Admin panel",
} as const;

export function createMainKeyboard(isAdmin = false): Keyboard {
  const keyboard = new Keyboard()
    .text(MAIN_MENU.club)
    .text(MAIN_MENU.leagues)
    .row()
    .text(MAIN_MENU.transfer)
    .text(MAIN_MENU.profile);
  if (isAdmin) keyboard.row().text(MAIN_MENU.admin);
  return keyboard.resized().persistent();
}
