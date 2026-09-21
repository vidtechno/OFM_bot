import{describe,expect,it}from"vitest";import{formatProfile,formatLeaderboard}from"../src/progression/presentation.js";
const p={name:"Diyorbek",username:"diyorbek",rating:1500,matches:0,wins:0,draws:0,losses:0,titles:0,seasons:0,spend:0,income:0,biggest:0};
describe("progression presentation",()=>{it("profilni chiqaradi",()=>expect(formatProfile(p)).toContain("Reyting 1500"));it("reytingni chiqaradi",()=>expect(formatLeaderboard([p])).toContain("@diyorbek · 1500"));});
