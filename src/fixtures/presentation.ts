import type { ClubFixture } from "./fixture.repository.js";

const dateTime = new Intl.DateTimeFormat("uz-UZ", {
  timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function formatFixtureLine(fixture: ClubFixture): string {
  const venue = fixture.isHome ? "UY" : "SAFAR";
  return `${fixture.round}-tur · ${dateTime.format(new Date(fixture.scheduledAt))}\n${fixture.homeClub} — ${fixture.awayClub} · ${venue}`;
}

export function formatUpcomingFixtures(fixtures: ClubFixture[]): string {
  if (fixtures.length === 0) return "MATCHLAR\n\nRejalashtirilgan o‘yin topilmadi.";
  return ["KEYINGI MATCHLAR", "", ...fixtures.flatMap((fixture, index) => [formatFixtureLine(fixture), ...(index < fixtures.length - 1 ? [""] : [])])].join("\n");
}
