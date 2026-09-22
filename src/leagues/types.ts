export interface CompetitionSummary {
  id: string;
  code: string;
  name: string;
}

export interface LeagueSummary {
  id: string;
  name: string;
  availableClubs: number;
}

export interface AvailableClub {
  leagueClubId: string;
  clubName: string;
  clubCode: string;
}

export interface ManagedClub {
  leagueClubId: string;
  leagueId?: string;
  clubName: string;
  competitionName: string;
  leagueName: string;
  position: number;
  points: number;
  budget: number;
  status?: string;
  teamOvr?: number;
  cash?: number;
}

export interface ClaimResult {
  leagueClubId: string;
  clubName: string;
  leagueName: string;
}

export interface ExitLeagueResult {
  leagueClubId: string;
  clubName: string;
  leagueName: string;
  leagueStatus: string;
}
