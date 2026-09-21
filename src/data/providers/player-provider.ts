export interface ImportedPlayer {
  sourcePlayerId: string;
  clubName: string;
  name: string;
  shortName: string;
  age: number;
  nationality: string;
  positions: string[];
  marketValue: number;
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}

export interface PlayerDataProvider {
  readonly code: string;
  load(csv: string): ImportedPlayer[];
}
