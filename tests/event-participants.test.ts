import { describe, expect, it } from "vitest";
import { assignGoalParticipants, type EventPlayer } from "../src/matches/event-participants.js";

const players: EventPlayer[] = [
  { id: "st", clubPlayerId: "cp-st", position: "ST", overall: 82 },
  { id: "rw", clubPlayerId: "cp-rw", position: "RW", overall: 80 },
  { id: "lw", clubPlayerId: "cp-lw", position: "LW", overall: 79 },
  { id: "cam", clubPlayerId: "cp-cam", position: "CAM", overall: 81 },
  { id: "cm", clubPlayerId: "cp-cm", position: "CM", overall: 77 },
  { id: "cdm", clubPlayerId: "cp-cdm", position: "CDM", overall: 76 },
  { id: "lb", clubPlayerId: "cp-lb", position: "LB", overall: 75 },
  { id: "cb1", clubPlayerId: "cp-cb1", position: "CB", overall: 78 },
  { id: "cb2", clubPlayerId: "cp-cb2", position: "CB", overall: 77 },
  { id: "rb", clubPlayerId: "cp-rb", position: "RB", overall: 75 },
  { id: "gk", clubPlayerId: "cp-gk", position: "GK", overall: 79 },
];

describe("goal participant assignment", () => {
  it("bir xil seed uchun bir xil natija beradi va assistlarni taqsimlaydi", () => {
    const events = Array.from({ length: 6 }, (_, index) => ({
      id: `goal-${index}`,
      minute: 10 + index * 10,
      isPenalty: false,
    }));
    const first = assignGoalParticipants("match:club", players, events);
    const second = assignGoalParticipants("match:club", players, events);

    expect(second).toEqual(first);
    const assistants = first.map(row => row.assistant?.id).filter(Boolean);
    expect(new Set(assistants).size).toBeGreaterThan(1);
    expect(Math.max(...players.map(player => assistants.filter(id => id === player.id).length))).toBeLessThan(6);
  });

  it("penaltiga assist yozmaydi va belgilangan penalti tepuvchini tanlaydi", () => {
    const [assignment] = assignGoalParticipants(
      "penalty",
      players,
      [{ id: "goal", minute: 55, isPenalty: true }],
      "cp-cam"
    );
    expect(assignment?.scorer.id).toBe("cam");
    expect(assignment?.assistant).toBeNull();
  });
});
