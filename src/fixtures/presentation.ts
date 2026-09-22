import type { ClubFixture } from "./fixture.repository.js";
import { escapeHtml, formatFixtureDate } from "../lib/html.js";

export function formatFixtureLine(fixture: ClubFixture): string {
  const opponent = fixture.isHome ? fixture.awayClub : fixture.homeClub;
  const prefix = fixture.isHome ? "vs" : "@";
  const dateStr = formatFixtureDate(fixture.scheduledAt);
  return `<b>${prefix} ${escapeHtml(opponent)}</b>\n<i>${dateStr}</i>`;
}

export function formatUpcomingFixtures(fixtures: ClubFixture[]): string {
  if (fixtures.length === 0) {
    return "📅 <b>O‘YINLAR</b>\n\n<i>Rejalashtirilgan o‘yin topilmadi.</i>";
  }

  const lines: string[] = ["📅 <b>KEYINGI O‘YINLAR</b>", ""];
  fixtures.forEach((f, idx) => {
    const opponent = f.isHome ? f.awayClub : f.homeClub;
    const prefix = f.isHome ? "vs" : "@";
    const dateStr = formatFixtureDate(f.scheduledAt);
    lines.push(
      `<b>${f.round}-tur</b> · ${prefix} <b>${escapeHtml(opponent)}</b>`,
      `<i>${dateStr}</i>`
    );
    if (idx < fixtures.length - 1) {
      lines.push("");
    }
  });

  return lines.join("\n");
}
