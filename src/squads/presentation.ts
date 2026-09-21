import type { SquadPlayer } from "./squad.repository.js";

const defenders = new Set(["LB", "LWB", "CB", "RB", "RWB"]);
const midfielders = new Set(["LM", "CDM", "CM", "CAM", "RM"]);

function section(position: string): "GK" | "DEF" | "MID" | "ATT" {
  if (position === "GK") return "GK";
  if (defenders.has(position)) return "DEF";
  if (midfielders.has(position)) return "MID";
  return "ATT";
}

export function formatSquad(clubName: string, players: SquadPlayer[]): string {
  const groups = new Map<string, SquadPlayer[]>([["GK", []], ["DEF", []], ["MID", []], ["ATT", []]]);
  for (const player of players) groups.get(section(player.primaryPosition))!.push(player);

  const lines = [`👥 ${clubName.toUpperCase()} — JAMOA`, "", `📋 ${players.length} nafar futbolchi`, ""];
  for (const [label, group] of groups) {
    lines.push({GK:"🧤 DARVOZABONLAR",DEF:"🛡 HIMOYACHILAR",MID:"🎯 YARIM HIMOYACHILAR",ATT:"⚡ HUJUMCHILAR"}[label]??label);
    if (group.length === 0) lines.push("—");
    for (let index=0;index<group.length;index+=2) lines.push(group.slice(index,index+2).map(player=>{const secondary=player.secondaryPosition?`/${player.secondaryPosition}`:"";return `${player.shortName} (${player.primaryPosition}${secondary} · ⭐${player.overall})`;}).join("  •  "));
    lines.push("");
  }
  return lines.join("\n").trim();
}
