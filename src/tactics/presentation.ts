import type { LineupEntry, SetPieceAssignments, Tactic } from "./tactics.repository.js";
import { escapeHtml } from "../lib/html.js";

const terms: Record<string, string> = {
  VERY_DEFENSIVE: "Juda himoyaviy",
  DEFENSIVE: "Himoyaviy",
  BALANCED: "Balansli",
  ATTACKING: "Hujumkor",
  VERY_ATTACKING: "Juda hujumkor",
  SHORT: "Short",
  MIXED: "Mixed",
  DIRECT: "Direct",
  LEFT: "Left Wing",
  CENTRE: "Centre",
  RIGHT: "Right Wing",
  BOTH_WINGS: "Both Wings",
  CAUTIOUS: "Cautious",
  NORMAL: "Normal",
  AGGRESSIVE: "Aggressive",
};

export const footballTerm = (value: string) => terms[value] ?? value;

export const positionName = (value: string) =>
  ({
    GK: "Darvozabon",
    LB: "Chap himoyachi",
    LWB: "Chap qanot himoyachi",
    CB: "Markaziy himoyachi",
    RB: "O‘ng himoyachi",
    RWB: "O‘ng qanot himoyachi",
    LM: "Chap yarim himoyachi",
    CDM: "Tayanch yarim himoyachi",
    CM: "Markaziy yarim himoyachi",
    CAM: "Hujumkor yarim himoyachi",
    RM: "O‘ng yarim himoyachi",
    LW: "Chap qanot hujumchi",
    ST: "Markaziy hujumchi",
    RW: "O‘ng qanot hujumchi",
  })[value] ?? value;

export const formatTactics = (t: Tactic) =>
  [
    "🧠 <b>TAKTIKA</b>",
    "",
    `🧩 Formation: <b>${escapeHtml(t.formationName)}</b>`,
    `🎯 Mentalitet: <b>${escapeHtml(footballTerm(t.mentality))}</b>`,
    `⚡ Pressing: <b>${t.pressing}</b>`,
    `⏱ Temp: <b>${t.tempo}</b>`,
    `📏 Himoya chizig‘i: <b>${t.defensiveLine}</b>`,
    `↔️ Kenglik: <b>${t.width}</b>`,
    `🎯 Pas turi: <b>${escapeHtml(footballTerm(t.passingStyle))}</b>`,
    `⚔️ Hujum yo‘nalishi: <b>${escapeHtml(footballTerm(t.attackFocus))}</b>`,
    `🛡 Kurashuvchanlik: <b>${escapeHtml(footballTerm(t.tackling))}</b>`,
  ].join("\n");

export const formatLineup = (formation: string, players: LineupEntry[], setPieces?: SetPieceAssignments) => {
  const avgStrength = (players.reduce((sum, p) => sum + p.effectiveRating, 0) / Math.max(players.length, 1)).toFixed(1);
  const lines: string[] = [
    "🔥 <b>ASOSIY XI</b>",
    `<i>Formation: ${escapeHtml(formation)}</i>`,
    "",
  ];
  for (const p of players) {
    const slotLabel = p.slotPosition || p.slotKey;
    lines.push(slotLabel, `${escapeHtml(p.shortName)} — ⭐<b>${p.overall}</b>`, "");
  }
  lines.push(`⭐ Jamoa kuchi: <b>${avgStrength}</b>`);

  if (setPieces) {
    lines.push(
      "",
      "🎯 <b>STANDARTLAR VA KAPITAN</b>",
      `👑 Kapitan: <b>${escapeHtml(setPieces.captain?.name ?? "Tanlanmagan")}</b>`,
      `⚽ Penalti: <b>${escapeHtml(setPieces.penaltyTaker?.name ?? "Tanlanmagan")}</b>`,
      `🎯 Jarima zarbasi: <b>${escapeHtml(setPieces.freeKickTaker?.name ?? "Tanlanmagan")}</b>`,
      `🚩 Burchak: <b>${escapeHtml(setPieces.cornerTaker?.name ?? "Tanlanmagan")}</b>`
    );
  }

  return lines.join("\n").trim();
};

export function formatStartingXi(
  clubName: string,
  formation: string,
  players: LineupEntry[],
  setPieces?: SetPieceAssignments
): string {
  const avgStrength = (players.reduce((sum, p) => sum + p.effectiveRating, 0) / Math.max(players.length, 1)).toFixed(1);
  const lines: string[] = [
    `🔥 <b>${escapeHtml(clubName.toUpperCase())} — ASOSIY XI</b>`,
    `<i>Formation: ${escapeHtml(formation)}</i>`,
    "",
  ];

  for (const p of players) {
    const slotLabel = p.slotPosition || p.slotKey;
    lines.push(
      slotLabel,
      `${escapeHtml(p.shortName)} — ⭐<b>${p.overall}</b>`,
      ""
    );
  }

  lines.push(`⭐ Jamoa kuchi: <b>${avgStrength}</b>`);

  if (setPieces) {
    lines.push(
      "",
      "🎯 <b>STANDARTLAR VA KAPITAN</b>",
      `👑 Kapitan: <b>${escapeHtml(setPieces.captain?.name ?? "Tanlanmagan")}</b>`,
      `⚽ Penalti: <b>${escapeHtml(setPieces.penaltyTaker?.name ?? "Tanlanmagan")}</b>`,
      `🎯 Jarima zarbasi: <b>${escapeHtml(setPieces.freeKickTaker?.name ?? "Tanlanmagan")}</b>`,
      `🚩 Burchak: <b>${escapeHtml(setPieces.cornerTaker?.name ?? "Tanlanmagan")}</b>`
    );
  }

  return lines.join("\n").trim();
}
