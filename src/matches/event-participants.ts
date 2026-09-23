export interface EventPlayer {
  id: string;
  clubPlayerId: string;
  position: string;
  overall: number;
}

export interface GoalEventInput {
  id: string;
  minute: number;
  isPenalty: boolean;
}

export interface GoalParticipantAssignment {
  eventId: string;
  scorer: EventPlayer;
  assistant: EventPlayer | null;
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

function scorerWeight(position: string): number {
  if (["ST", "CF"].includes(position)) return 7;
  if (["LW", "RW"].includes(position)) return 5;
  if (position === "CAM") return 4;
  if (["CM", "LM", "RM"].includes(position)) return 2.5;
  if (["CDM", "LB", "RB", "LWB", "RWB"].includes(position)) return 1.2;
  if (position === "CB") return 0.7;
  return 0.08;
}

function assistWeight(position: string): number {
  if (["LW", "RW", "CAM"].includes(position)) return 6;
  if (["CM", "LM", "RM"].includes(position)) return 5;
  if (["ST", "CF", "LB", "RB", "LWB", "RWB"].includes(position)) return 2.5;
  if (["CDM", "CB"].includes(position)) return 1.2;
  return 0.05;
}

function weightedPick(
  players: EventPlayer[],
  weight: (player: EventPlayer) => number,
  rng: () => number
): EventPlayer {
  const weights = players.map(player => Math.max(0.001, weight(player)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = rng() * total;
  for (let index = 0; index < players.length; index += 1) {
    cursor -= weights[index]!;
    if (cursor <= 0) return players[index]!;
  }
  return players[players.length - 1]!;
}

export function assignGoalParticipants(
  seedKey: string,
  players: EventPlayer[],
  events: GoalEventInput[],
  penaltyTakerClubPlayerId?: string | null
): GoalParticipantAssignment[] {
  if (!players.length) return [];
  const rng = random(seedFrom(seedKey));
  const goalsByPlayer = new Map<string, number>();
  const assistsByPlayer = new Map<string, number>();
  const penaltyTaker = penaltyTakerClubPlayerId
    ? players.find(player => player.clubPlayerId === penaltyTakerClubPlayerId)
    : undefined;

  return events.map(event => {
    const scorer = event.isPenalty && penaltyTaker
      ? penaltyTaker
      : weightedPick(
          players,
          player => scorerWeight(player.position) * (0.65 + player.overall / 100) /
            (1 + (goalsByPlayer.get(player.id) ?? 0) * 0.55),
          rng
        );
    goalsByPlayer.set(scorer.id, (goalsByPlayer.get(scorer.id) ?? 0) + 1);

    let assistant: EventPlayer | null = null;
    // Penalties never have an assist. Around 18% of open-play goals are unassisted.
    if (!event.isPenalty && rng() >= 0.18) {
      const candidates = players.filter(player => player.id !== scorer.id);
      if (candidates.length) {
        assistant = weightedPick(
          candidates,
          player => assistWeight(player.position) * (0.65 + player.overall / 100) /
            (1 + (assistsByPlayer.get(player.id) ?? 0) * 1.8),
          rng
        );
        assistsByPlayer.set(assistant.id, (assistsByPlayer.get(assistant.id) ?? 0) + 1);
      }
    }

    return { eventId: event.id, scorer, assistant };
  });
}
