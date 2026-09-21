export interface FixturePair {
  round: number;
  homeClubId: string;
  awayClubId: string;
}

/** Circle-method double round robin. Input order makes the result deterministic. */
export function generateDoubleRoundRobin(clubIds: string[]): FixturePair[] {
  if (clubIds.length < 2 || clubIds.length % 2 !== 0) {
    throw new Error("Fixture generator juft va kamida 2 ta klub talab qiladi.");
  }
  if (new Set(clubIds).size !== clubIds.length) throw new Error("Klub IDlari takrorlanmasligi kerak.");

  const fixed = clubIds.at(-1)!;
  const rotating = clubIds.slice(0, -1);
  const firstHalf: FixturePair[] = [];
  const rounds = clubIds.length - 1;

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    for (let pairIndex = 0; pairIndex < clubIds.length / 2; pairIndex += 1) {
      const left = pairIndex === 0 ? fixed : rotating[(roundIndex + pairIndex) % rounds]!;
      const right = rotating[(roundIndex - pairIndex + rounds) % rounds]!;
      // Alternating the whole round prevents long home/away streaks (max two).
      const swap = roundIndex % 2 === 1;
      firstHalf.push({
        round: roundIndex + 1,
        homeClubId: swap ? right : left,
        awayClubId: swap ? left : right,
      });
    }
  }

  return firstHalf.concat(firstHalf.map((fixture) => ({
    round: fixture.round + rounds,
    homeClubId: fixture.awayClubId,
    awayClubId: fixture.homeClubId,
  })));
}
