import { z } from "zod";
import type { ImportedPlayer } from "./player-provider.js";

const statSchema = z.object({ value: z.number().int().min(1).max(99) });
const itemSchema = z.object({
  id: z.number().int(), overallRating: z.number().int().min(1).max(99),
  firstName: z.string().nullable(), lastName: z.string().nullable(), commonName: z.string().nullable(),
  birthdate: z.string(), leagueName: z.string(),
  nationality: z.object({ label: z.string() }), team: z.object({ id: z.number(), label: z.string() }),
  position: z.object({ shortLabel: z.string() }),
  alternatePositions: z.array(z.object({ shortLabel: z.string() })).nullable().transform((value) => value ?? []),
  stats: z.record(z.string(), statSchema),
});

interface NextData {
  props: { pageProps: {
    ratingDetails: { items: unknown[]; totalItems: number };
    ratingsFilters?: { teamGroups: Array<{ id: string; label: string; teams: Array<{ id: number; label: string }> }> };
  } };
}

export class Fc27OfficialProvider {
  readonly code = "EA_FC27_OFFICIAL";

  parsePage(html: string): NextData {
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (!match?.[1]) throw new Error("EA ratings __NEXT_DATA__ topilmadi");
    return JSON.parse(match[1]) as NextData;
  }

  competitionTeams(html: string): Array<{ competitionCode: string; id: number; label: string }> {
    const groups = this.parsePage(html).props.pageProps.ratingsFilters?.teamGroups ?? [];
    return groups.flatMap((group) => {
      const competitionCode = group.label === "Premier League" ? "PL" : group.label === "LALIGA EA SPORTS" ? "LALIGA" : null;
      return competitionCode ? group.teams.map((team) => ({ competitionCode, ...team })) : [];
    });
  }

  players(html: string): ImportedPlayer[] {
    return this.parsePage(html).props.pageProps.ratingDetails.items.map((raw) => itemSchema.parse(raw)).map((item) => {
      const positions = [item.position.shortLabel, ...item.alternatePositions.map((position) => position.shortLabel)];
      const isGoalkeeper = positions[0] === "GK";
      const stat = (key: string, fallback: number): number => item.stats[key]?.value ?? fallback;
      const birthdate = new Date(item.birthdate);
      const now = new Date("2026-09-01T00:00:00Z");
      let age = now.getUTCFullYear() - birthdate.getUTCFullYear();
      if (now.getUTCMonth() < birthdate.getUTCMonth() || (now.getUTCMonth() === birthdate.getUTCMonth() && now.getUTCDate() < birthdate.getUTCDate())) age--;
      const displayName = item.commonName || [item.firstName, item.lastName].filter(Boolean).join(" ");
      const marketValue = Math.round((item.overallRating ** 3 * Math.max(0.35, (34 - age) / 16) * 130) / 100_000) * 100_000;
      return {
        sourcePlayerId: String(item.id), clubName: item.team.label, name: displayName,
        shortName: item.commonName || `${item.firstName?.[0] ? `${item.firstName[0]}. ` : ""}${item.lastName ?? ""}`.trim(),
        age, nationality: item.nationality.label, positions: [...new Set(positions)], marketValue,
        overall: item.overallRating,
        pace: isGoalkeeper ? stat("gkDiving", item.overallRating) : stat("pac", item.overallRating),
        shooting: isGoalkeeper ? stat("gkKicking", item.overallRating) : stat("sho", item.overallRating),
        passing: isGoalkeeper ? stat("gkKicking", item.overallRating) : stat("pas", item.overallRating),
        dribbling: isGoalkeeper ? stat("gkHandling", item.overallRating) : stat("dri", item.overallRating),
        defending: isGoalkeeper ? stat("gkPositioning", item.overallRating) : stat("def", item.overallRating),
        physical: isGoalkeeper ? stat("gkReflexes", item.overallRating) : stat("phy", item.overallRating),
      };
    });
  }
}
