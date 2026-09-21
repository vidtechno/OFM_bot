import { describe,expect,it } from "vitest";
import { readFile } from "node:fs/promises";
import { Fc27OfficialProvider } from "../src/data/providers/fc27-official.provider.js";

describe("Fc27OfficialProvider",()=>{
  it("official EA Next data ichidan current playerni parse qiladi",async()=>{
    const html=await readFile("/private/tmp/ea-team243.html","utf8");
    const players=new Fc27OfficialProvider().players(html);
    expect(players.some(player=>player.name.includes("Mbappé")&&player.overall===91)).toBe(true);
    expect(players.some(player=>player.name.includes("Ceballos"))).toBe(false);
  });
});
