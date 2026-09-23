import { describe, expect, it } from "vitest";
import { isAuthorizedSchedulerRequest } from "../src/matches/match-scheduler.js";

describe("match scheduler authorization", () => {
  it("service role bearer token bilan so'rovni qabul qiladi", () => {
    const req = new Request("https://example.com/functions/v1/match-scheduler", {
      method: "POST",
      headers: { authorization: "Bearer service-role-secret" },
    });
    expect(isAuthorizedSchedulerRequest(req, "service-role-secret")).toBe(true);
  });

  it("token yo'q yoki noto'g'ri bo'lsa so'rovni rad etadi", () => {
    expect(isAuthorizedSchedulerRequest(new Request("https://example.com"), "secret")).toBe(false);
    expect(isAuthorizedSchedulerRequest(new Request("https://example.com", {
      headers: { authorization: "Bearer wrong" },
    }), "secret")).toBe(false);
  });
});
