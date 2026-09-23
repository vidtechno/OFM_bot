import { describe, expect, it } from "vitest";
import { formatLaunchDashboard } from "../src/admin/presentation.js";
import { formatPeriodLeaderboard, formatSeasonDetail, formatSeasonHistory, formatTrophyCabinet } from "../src/progression/presentation.js";

describe("launch polish presentation", () => {
  it("renders compact trophy cabinet and history", () => {
    expect(formatTrophyCabinet({ seasons: 9, champions: 5, runnerUps: 1, thirdPlaces: 2, byCompetition: [{ competitionName: "Superliga", champions: 2 }] })).toContain("Superliga Champion ×2");
    const row = { id:"1",leagueInstanceId:"2",competitionCode:"UZB",competitionName:"O‘zbekiston Superligasi",instanceNumber:7,clubName:"FC Andijon",finalPosition:1,played:30,wins:21,draws:5,losses:4,goalsFor:64,goalsAgainst:28,goalDifference:36,points:68,seasonXpEarned:87,finishedAt:new Date().toISOString() };
    expect(formatSeasonHistory([row])).toContain("21-5-4");
    expect(formatSeasonDetail(row)).toContain("Mavsum XP: <b>+87</b>");
  });

  it("renders period leaderboard and own rank", () => {
    const text = formatPeriodLeaderboard("DAILY", [{ userId:"1",name:"Ali",username:null,xp:21,wins:7,matches:7,rank:1 }], 17, 6);
    expect(text).toContain("BUGUNGI TOP");
    expect(text).toContain("Siz: <b>#17</b> · +6 XP");
  });

  it("renders all launch metrics without secrets", () => {
    const text = formatLaunchDashboard({users:1248,todayUsers:183,activeManagers:412,claimedClubs:287,activeLeagues:19,completedMatches:3841,transfers:726,starsAttempts:43,starsPending:1,starsPaid:18,starsRefunded:2,starsFailed:22});
    expect(text).toContain("Jami users: <b>1,248</b>");
    expect(text).toContain("Paid: <b>18</b>");
    expect(text).not.toMatch(/token|secret|charge/i);
  });
});
