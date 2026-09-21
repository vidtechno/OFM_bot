import type { SquadPlayer } from "./squad.repository.js";

const defenders = new Set(["LB", "LWB", "CB", "RB", "RWB"]);
const midfielders = new Set(["LM", "CDM", "CM", "CAM", "RM"]);

export function section(position: string): "GK" | "DEF" | "MID" | "ATT" {
  if (position === "GK") return "GK";
  if (defenders.has(position)) return "DEF";
  if (midfielders.has(position)) return "MID";
  return "ATT";
}

export function formatPlayerPosition(primary: string, secondary: string | null): string {
  return secondary && secondary.trim() ? `${primary}/${secondary}` : primary;
}

export function formatSquad(clubName: string, players: SquadPlayer[]): string {
  const groups = new Map<"GK" | "DEF" | "MID" | "ATT", SquadPlayer[]>([
    ["GK", []],
    ["DEF", []],
    ["MID", []],
    ["ATT", []],
  ]);

  for (const player of players) {
    const sec = section(player.primaryPosition);
    groups.get(sec)?.push(player);
  }

  // Sort within each section: overall descending, then shortName ascending
  for (const group of groups.values()) {
    group.sort((a, b) => b.overall - a.overall || a.shortName.localeCompare(b.shortName));
  }

  const sectionTitles: Record<"GK" | "DEF" | "MID" | "ATT", string> = {
    GK: "🧤 DARVOZABONLAR",
    DEF: "🛡 HIMOYACHILAR",
    MID: "🎯 YARIM HIMOYACHILAR",
    ATT: "⚡ HUJUMCHILAR",
  };

  const lines: string[] = [
    `👥 ${clubName.toUpperCase()} — JAMOA`,
    `📋 ${players.length} futbolchi`,
  ];

  for (const [secKey, title] of Object.entries(sectionTitles) as Array<["GK" | "DEF" | "MID" | "ATT", string]>) {
    const group = groups.get(secKey) ?? [];
    lines.push("", title);
    if (group.length === 0) {
      lines.push("—");
      continue;
    }
    group.forEach((p, idx) => {
      const pos = formatPlayerPosition(p.primaryPosition, p.secondaryPosition);
      lines.push(`${idx + 1}. ${p.shortName} — ${pos} — ⭐${p.overall}`);
    });
  }

  let text = lines.join("\n");
  // Safety guard against Telegram 4096 character limit
  if (text.length > 4000) {
    text = text.slice(0, 3990) + "\n… [qolgan o‘yinchilar qisqartirildi]";
  }

  return text;
}
