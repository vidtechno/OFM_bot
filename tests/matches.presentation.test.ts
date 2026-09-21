import { describe, expect, it } from "vitest";
import { formatResults, formatTable } from "../src/matches/presentation.js";

describe("match presentation",()=>{
  it("natijalarni ko‘rsatadi",()=>expect(formatResults([{id:"1",round:2,playedAt:"x",homeClub:"Real Madrid",awayClub:"Barcelona",homeGoals:3,awayGoals:1}])).toContain("Real Madrid 3:1 Barcelona"));
  it("jadvalni tushunarli ko‘rsatadi",()=>expect(formatTable([{position:1,club:"Real Madrid",played:1,wins:1,draws:0,losses:0,goalDifference:2,points:3}])).toContain("Real Madrid"));
});
