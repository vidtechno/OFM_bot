import{describe,expect,it}from"vitest";import{formatAdminStats}from"../src/admin/presentation.js";
describe("admin presentation",()=>it("statistikani chiqaradi",()=>expect(formatAdminStats({users:2,activeUsers:1,blockedUsers:1,humanClubs:1,aiClubs:39,matches:0,offers:1,activeListings:79})).toContain("Users: 2")));
