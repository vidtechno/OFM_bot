export interface MatchTeamInput {
  clubId: string;
  strength: number;
  mentality: string;
  pressing: number;
  tempo: number;
  defensiveLine?: number | undefined;
  width?: number | undefined;
  passingStyle?: string | undefined;
  attackFocus?: string | undefined;
  tackling?: string | undefined;
}

export interface MatchEvent {
  minute: number;
  type: "GOAL" | "YELLOW_CARD" | "RED_CARD";
  side: "HOME" | "AWAY";
  isPenalty?: boolean;
}

export interface MatchStats {
  possessionHome: number;
  shotsHome: number;
  shotsAway: number;
  shotsOnTargetHome: number;
  shotsOnTargetAway: number;
  cornersHome: number;
  cornersAway: number;
  foulsHome: number;
  foulsAway: number;
}

export interface MatchSimulation {
  homeGoals: number;
  awayGoals: number;
  stats: MatchStats;
  events: MatchEvent[];
}

function seedFrom(value: string): number {
  let seed = 2166136261;
  for (const char of value) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}

function random(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, rng: () => number): number {
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= rng();
  } while (product > limit && count < 10);
  return count - 1;
}

function mentalityBoost(value: string): number {
  return (
    ({
      VERY_DEFENSIVE: -0.22,
      DEFENSIVE: -0.11,
      BALANCED: 0,
      ATTACKING: 0.12,
      VERY_ATTACKING: 0.22,
    } as Record<string, number>)[value] ?? 0
  );
}

export function simulateMatch(
  fixtureId: string,
  home: MatchTeamInput,
  away: MatchTeamInput
): MatchSimulation {
  const rng = random(seedFrom(fixtureId));
  const gap = Math.max(-20, Math.min(20, home.strength - away.strength));

  // Base tactical parameters
  const homeLine = home.defensiveLine ?? 50;
  const awayLine = away.defensiveLine ?? 50;
  const homePassing = home.passingStyle ?? "MIXED";
  const awayPassing = away.passingStyle ?? "MIXED";
  const homeFocus = home.attackFocus ?? "MIXED";
  const awayFocus = away.attackFocus ?? "MIXED";
  const homeTackling = home.tackling ?? "NORMAL";
  const awayTackling = away.tackling ?? "NORMAL";

  // 1. Tactical Matchup Counters
  let homeTacticalMod = 0;
  let awayTacticalMod = 0;
  let possessionMod = 0;

  // Counter 1: High line vs Direct / Fast counter
  if (homeLine > 65) {
    possessionMod += 3;
    if (away.tempo > 65 || awayPassing === "DIRECT") {
      awayTacticalMod += 0.16; // Exposed space behind high line
    }
  }
  if (awayLine > 65) {
    possessionMod -= 3;
    if (home.tempo > 65 || homePassing === "DIRECT") {
      homeTacticalMod += 0.16;
    }
  }

  // Counter 2: High pressing vs Short passing (composure build-up)
  if (home.pressing > 65) {
    if (awayPassing === "SHORT") {
      awayTacticalMod += 0.12; // Played through press
    } else {
      possessionMod += 2;
      awayTacticalMod -= 0.08; // Disrupted build-up
    }
  }
  if (away.pressing > 65) {
    if (homePassing === "SHORT") {
      homeTacticalMod += 0.12;
    } else {
      possessionMod -= 2;
      homeTacticalMod -= 0.08;
    }
  }

  // Counter 3: Narrow width vs Wing attacks
  const isWingAttack = (focus: string) => ["LEFT", "RIGHT", "BOTH_WINGS"].includes(focus);
  if ((home.width ?? 50) < 40 && isWingAttack(awayFocus)) {
    awayTacticalMod += 0.14; // Wide flanks exposed
  }
  if ((away.width ?? 50) < 40 && isWingAttack(homeFocus)) {
    homeTacticalMod += 0.14;
  }

  // Counter 4: Tackling intensity
  let homeFoulsBase = 8;
  let awayFoulsBase = 8;
  let homeYellowsBase = 1;
  let awayYellowsBase = 1;
  let homeRedChance = 0.01;
  let awayRedChance = 0.01;

  if (homeTackling === "AGGRESSIVE") {
    homeFoulsBase += 4;
    homeYellowsBase += 1;
    homeRedChance = 0.04;
    awayTacticalMod += 0.08; // Concedes dangerous set-pieces / penalties
    homeTacticalMod += 0.04; // Aggressive ball recoveries
  } else if (homeTackling === "CAUTIOUS") {
    homeFoulsBase = Math.max(4, homeFoulsBase - 3);
    homeYellowsBase = 0;
    homeRedChance = 0.002;
    homeTacticalMod -= 0.04; // Less aggressive challenges
  }

  if (awayTackling === "AGGRESSIVE") {
    awayFoulsBase += 4;
    awayYellowsBase += 1;
    awayRedChance = 0.04;
    homeTacticalMod += 0.08;
    awayTacticalMod += 0.04;
  } else if (awayTackling === "CAUTIOUS") {
    awayFoulsBase = Math.max(4, awayFoulsBase - 3);
    awayYellowsBase = 0;
    awayRedChance = 0.002;
    awayTacticalMod -= 0.04;
  }

  // Calculate Lambdas (Poisson means)
  const homeLambda = Math.max(
    0.25,
    1.35 + 0.20 + gap * 0.055 + mentalityBoost(home.mentality) + (home.tempo - 50) / 300 + homeTacticalMod
  );
  const awayLambda = Math.max(
    0.20,
    1.22 - gap * 0.05 + mentalityBoost(away.mentality) + (away.tempo - 50) / 320 + awayTacticalMod
  );

  const homeGoals = Math.min(8, poisson(homeLambda, rng));
  const awayGoals = Math.min(8, poisson(awayLambda, rng));

  const possessionHome = Math.max(
    28,
    Math.min(72, Math.round(50 + gap * 0.7 + (home.pressing - away.pressing) * 0.08 + possessionMod))
  );

  const shotsHome = Math.max(homeGoals, Math.round(7 + homeLambda * 3 + rng() * 5));
  const shotsAway = Math.max(awayGoals, Math.round(7 + awayLambda * 3 + rng() * 5));

  const stats: MatchStats = {
    possessionHome,
    shotsHome,
    shotsAway,
    shotsOnTargetHome: Math.min(shotsHome, Math.max(homeGoals, Math.round(shotsHome * (0.32 + rng() * 0.15)))),
    shotsOnTargetAway: Math.min(shotsAway, Math.max(awayGoals, Math.round(shotsAway * (0.32 + rng() * 0.15)))),
    cornersHome: Math.round(2 + rng() * 6),
    cornersAway: Math.round(2 + rng() * 6),
    foulsHome: Math.round(homeFoulsBase + rng() * 5),
    foulsAway: Math.round(awayFoulsBase + rng() * 5),
  };

  const events: MatchEvent[] = [];

  for (const side of ["HOME", "AWAY"] as const) {
    const goals = side === "HOME" ? homeGoals : awayGoals;
    const opponentTackling = side === "HOME" ? awayTackling : homeTackling;

    for (let index = 0; index < goals; index += 1) {
      const isPen = opponentTackling === "AGGRESSIVE" && rng() < 0.25;
      events.push({
        minute: 1 + Math.floor(rng() * 90),
        type: "GOAL",
        side,
        isPenalty: isPen,
      });
    }

    const yellows = Math.max(0, Math.floor(side === "HOME" ? homeYellowsBase + rng() * 2 : awayYellowsBase + rng() * 2));
    for (let index = 0; index < yellows; index += 1) {
      events.push({ minute: 1 + Math.floor(rng() * 90), type: "YELLOW_CARD", side });
    }

    const redChance = side === "HOME" ? homeRedChance : awayRedChance;
    if (rng() < redChance) {
      events.push({ minute: 20 + Math.floor(rng() * 70), type: "RED_CARD", side });
    }
  }

  events.sort((a, b) => a.minute - b.minute);

  return { homeGoals, awayGoals, stats, events };
}
