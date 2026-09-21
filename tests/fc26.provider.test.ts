import { describe, expect, it } from "vitest";
import { Fc26Provider } from "../src/data/providers/fc26.provider.js";

describe("Fc26Provider", () => {
  it("CSV rowni normalized playerga aylantiradi", () => {
    const csv = [
      "player_id,short_name,long_name,player_positions,overall,value_eur,age,nationality_name,club_name,pace,shooting,passing,dribbling,defending,physic",
      '1,Vini Jr.,Vinícius José,"LW, ST",89,150000000,25,Brazil,Real Madrid,95,84,81,91,35,70',
    ].join("\n");
    const [player] = new Fc26Provider().load(csv);
    expect(player).toMatchObject({ sourcePlayerId: "1", positions: ["LW", "ST"], overall: 89, physical: 70 });
  });

  it("invalid rowni import qilmaydi", () => {
    const csv = "player_id,short_name,long_name,player_positions,overall,value_eur,age,nationality_name,club_name,pace,shooting,passing,dribbling,defending,physic\n1,A,A,ST,200,0,20,X,X,50,50,50,50,50,50";
    expect(new Fc26Provider().load(csv)).toEqual([]);
  });

  it("goalkeeper uchun GK atributlarini mapping qiladi", () => {
    const csv = [
      "player_id,short_name,long_name,player_positions,overall,value_eur,age,nationality_name,club_name,pace,shooting,passing,dribbling,defending,physic,goalkeeping_diving,goalkeeping_handling,goalkeeping_kicking,goalkeeping_positioning,goalkeeping_reflexes,goalkeeping_speed",
      "2,T. Courtois,Thibaut Courtois,GK,89,40000000,33,Belgium,Real Madrid,,,,,,,90,88,76,88,91,52",
    ].join("\n");
    expect(new Fc26Provider().load(csv)[0]).toMatchObject({
      positions: ["GK"], pace: 52, shooting: 76, passing: 76,
      dribbling: 88, defending: 88, physical: 91,
    });
  });
});
