export type LegendCategory = "GK" | "DEF" | "MID" | "ATT";

export type LegendTier = "GOAT" | "Icon" | "Elite Legend" | "Legend";

export interface LegendPlayer {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  category: LegendCategory;
  primaryPosition: string;
  secondaryPositions: string[];
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  tier: LegendTier;
  starsPrice: number;
  active: boolean;
  cardMetadata: Record<string, unknown>;
}

export type LegendAvailabilityStatus =
  | "AVAILABLE"
  | "OWNED_BY_CURRENT_CLUB"
  | "OWNED_BY_OTHER_CLUB"
  | "CLUB_LIMIT_REACHED"
  | "LEAGUE_NOT_ACTIVE";

export interface LegendListingItem {
  legend: LegendPlayer;
  status: LegendAvailabilityStatus;
  ownerClubName?: string | undefined;
  isOwnedByMe: boolean;
}

export interface ClubLegendSummary {
  clubName: string;
  leagueName: string;
  leagueInstanceId: string;
  leagueClubId: string;
  leagueStatus: "OPEN" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
  currentLegendCount: number;
  maxLegends: number;
  legends: Array<{
    legendId: string;
    clubPlayerId: string;
    name: string;
    displayName: string;
    primaryPosition: string;
    overall: number;
    tier: LegendTier;
  }>;
}

export interface LegendPurchaseIntent {
  purchaseId: string;
  starsAmount: number;
  legendName: string;
  legendPos: string;
  legendOvr: number;
  clubName: string;
  leagueInstanceId: string;
}

export interface LegendFulfillmentResult {
  clubPlayerId: string;
  legendName: string;
  legendPos: string;
  legendOvr: number;
  clubName: string;
  leagueInstanceId: string;
}
