import type { LineupEntry, Tactic } from "./tactics.repository.js";

const terms: Record<string, string> = {
  VERY_DEFENSIVE: "Juda himoyaviy",
  DEFENSIVE: "Himoyaviy",
  BALANCED: "Muvozanatli",
  ATTACKING: "Hujumkor",
  VERY_ATTACKING: "Juda hujumkor",
  SHORT: "Qisqa pas",
  MIXED: "Aralash",
  DIRECT: "To‘g‘ridan-to‘g‘ri",
  LEFT: "Chap qanot",
  CENTRE: "Markaz",
  RIGHT: "O‘ng qanot",
  BOTH_WINGS: "Ikki qanot",
  CAUTIOUS: "Ehtiyotkor",
  NORMAL: "Me’yorida",
  AGGRESSIVE: "Keskin",
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
    "🧠 TAKTIK REJA",
    "",
    `📐 Sxema: ${t.formationName}`,
    `⚖️ O‘yin uslubi: ${footballTerm(t.mentality)}`,
    `🔥 Pressing: ${t.pressing}/100`,
    `⚡ Sur’at: ${t.tempo}/100`,
    `🛡 Himoya chizig‘i: ${t.defensiveLine}/100`,
    `↔️ Maydon kengligi: ${t.width}/100`,
    `🎯 Pas uslubi: ${footballTerm(t.passingStyle)}`,
    `🚀 Hujum yo‘nalishi: ${footballTerm(t.attackFocus)}`,
    `🦵 To‘p uchun kurash: ${footballTerm(t.tackling)}`,
  ].join("\n");

export const formatLineup = (formation: string, players: LineupEntry[]) => [
  "👥 BOSHLANG‘ICH 11 TALIK",
  `📐 Sxema: ${formation}`,
  "",
  ...players.map((p) => `${p.slotKey} · ${p.shortName}  ⭐ ${p.overall}`),
  "",
  `Jamoaviy kuch: ${(players.reduce((sum, p) => sum + p.effectiveRating, 0) / Math.max(players.length, 1)).toFixed(1)}`,
].join("\n");

export function formatStartingXi(clubName: string, formation: string, players: LineupEntry[]): string {
  const avgStrength = (players.reduce((sum, p) => sum + p.effectiveRating, 0) / Math.max(players.length, 1)).toFixed(1);
  const lines: string[] = [
    `🔥 ${clubName.toUpperCase()} — ASOSIY XI`,
    `📐 Sxema: ${formation}`,
    `⭐ Jamoaviy kuch: ${avgStrength}`,
    "",
  ];

  const gkList = players.filter((p) => p.slotPosition === "GK");
  const defList = players.filter((p) => ["LB", "LWB", "CB", "RB", "RWB"].includes(p.slotPosition));
  const midList = players.filter((p) => ["LM", "CDM", "CM", "CAM", "RM"].includes(p.slotPosition));
  const attList = players.filter((p) => ["LW", "ST", "RW", "CF"].includes(p.slotPosition));

  const sections: Array<{ title: string; list: LineupEntry[] }> = [
    { title: "🧤 DARVOZABON", list: gkList },
    { title: "🛡 HIMOYACHILAR", list: defList },
    { title: "🎯 YARIM HIMOYACHILAR", list: midList },
    { title: "⚡ HUJUMCHILAR", list: attList },
  ];

  for (const sec of sections) {
    if (sec.list.length > 0) {
      lines.push(sec.title);
      for (const p of sec.list) {
        lines.push(`${p.slotKey}: ✅ ${p.shortName} — ⭐${p.overall}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}
