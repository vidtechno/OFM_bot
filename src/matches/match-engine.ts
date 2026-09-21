export interface MatchTeamInput { clubId: string; strength: number; mentality: string; pressing: number; tempo: number; }
export interface MatchEvent { minute: number; type: "GOAL" | "YELLOW_CARD"; side: "HOME" | "AWAY"; }
export interface MatchStats { possessionHome: number; shotsHome: number; shotsAway: number; shotsOnTargetHome: number; shotsOnTargetAway: number; cornersHome: number; cornersAway: number; foulsHome: number; foulsAway: number; }
export interface MatchSimulation { homeGoals: number; awayGoals: number; stats: MatchStats; events: MatchEvent[]; }

function seedFrom(value: string): number { let seed = 2166136261; for (const char of value) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619); return seed >>> 0; }
function random(seed: number): () => number { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function poisson(lambda: number, rng: () => number): number { const limit = Math.exp(-lambda); let product = 1, count = 0; do { count += 1; product *= rng(); } while (product > limit && count < 10); return count - 1; }
function mentalityBoost(value: string): number { return ({ VERY_DEFENSIVE: -0.2, DEFENSIVE: -0.1, BALANCED: 0, ATTACKING: 0.12, VERY_ATTACKING: 0.22 } as Record<string, number>)[value] ?? 0; }

export function simulateMatch(fixtureId: string, home: MatchTeamInput, away: MatchTeamInput): MatchSimulation {
  const rng = random(seedFrom(fixtureId));
  const gap = Math.max(-20, Math.min(20, home.strength - away.strength));
  const homeLambda = Math.max(0.25, 1.38 + 0.22 + gap * 0.055 + mentalityBoost(home.mentality) + (home.tempo - 50) / 300);
  const awayLambda = Math.max(0.2, 1.25 - gap * 0.05 + mentalityBoost(away.mentality) + (away.tempo - 50) / 320);
  const homeGoals = Math.min(8, poisson(homeLambda, rng));
  const awayGoals = Math.min(8, poisson(awayLambda, rng));
  const possessionHome = Math.max(30, Math.min(70, Math.round(50 + gap * 0.7 + (home.pressing - away.pressing) * 0.08)));
  const shotsHome = Math.max(homeGoals, Math.round(8 + homeLambda * 3 + rng() * 5));
  const shotsAway = Math.max(awayGoals, Math.round(8 + awayLambda * 3 + rng() * 5));
  const stats: MatchStats = {
    possessionHome, shotsHome, shotsAway,
    shotsOnTargetHome: Math.min(shotsHome, Math.max(homeGoals, Math.round(shotsHome * (0.3 + rng() * 0.15)))),
    shotsOnTargetAway: Math.min(shotsAway, Math.max(awayGoals, Math.round(shotsAway * (0.3 + rng() * 0.15)))),
    cornersHome: Math.round(2 + rng() * 7), cornersAway: Math.round(2 + rng() * 7),
    foulsHome: Math.round(7 + rng() * 9), foulsAway: Math.round(7 + rng() * 9),
  };
  const events: MatchEvent[] = [];
  for (const side of ["HOME", "AWAY"] as const) {
    const goals = side === "HOME" ? homeGoals : awayGoals;
    for (let index = 0; index < goals; index += 1) events.push({ minute: 1 + Math.floor(rng() * 90), type: "GOAL", side });
    const yellows = Math.floor(rng() * 3);
    for (let index = 0; index < yellows; index += 1) events.push({ minute: 1 + Math.floor(rng() * 90), type: "YELLOW_CARD", side });
  }
  events.sort((a, b) => a.minute - b.minute);
  return { homeGoals, awayGoals, stats, events };
}
