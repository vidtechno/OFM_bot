import { loadConfig } from "../config/env.js";
import { createDatabaseClient } from "../db/client.js";

interface UzbekClubSource {
  name: string;
  code: string;
  tier: number;
  wikiPage?: string;
  wikiTemplate?: string;
  uzWikiPage?: string;
  uzWikiTemplate?: string;
}

const UZBEK_SOURCES: UzbekClubSource[] = [
  { name: "Pakhtakor Tashkent", code: "PAK", tier: 1, wikiPage: "Pakhtakor_FC" },
  { name: "Nasaf Qarshi", code: "NAS", tier: 1, wikiPage: "FC_Nasaf" },
  { name: "Navbahor Namangan", code: "NAV", tier: 1, wikiTemplate: "PFC_Navbahor_Namangan_squad" },
  { name: "Neftchi Fergana", code: "NEF", tier: 1, wikiPage: "FK_Neftchi_Fergana" },
  { name: "Dinamo Samarqand", code: "DIN", tier: 2, wikiPage: "FC_Dinamo_Samarqand" },
  { name: "FC Andijon", code: "AND", tier: 2, wikiPage: "FC_Andijon" },
  { name: "Sogdiana Jizzakh", code: "SOG", tier: 2, wikiPage: "FC_Sogdiana_Jizzakh" },
  { name: "FC OKMK Olmaliq", code: "AGMK", tier: 2, wikiPage: "FC_AGMK" },
  { name: "FC Buxoro", code: "BUX", tier: 3, wikiPage: "FK_Buxoro" },
  { name: "Lokomotiv Tashkent", code: "LOK", tier: 3, wikiPage: "Lokomotiv_Tashkent" },
  { name: "Xorazm Urganch", code: "XOR", tier: 4, uzWikiPage: "Xorazm_(futbol_klubi)" },
  { name: "FC Qizilqum", code: "QIZ", tier: 3, uzWikiTemplate: "Andoza:Qizilqum_futbol_klubi_tarkibi" },
  { name: "Bunyodkor Tashkent", code: "BUN", tier: 3, wikiPage: "FC_Bunyodkor" },
  { name: "FC Kokand 1912", code: "KOK", tier: 4, wikiPage: "FC_Kokand_1912" },
  { name: "Surkhon Termiz", code: "SUR", tier: 4, wikiPage: "FC_Surkhon_Termez" },
  { name: "Mash'al Mubarek", code: "MAS", tier: 4, wikiPage: "FK_Mash'al_Mubarek" },
];

export interface ParsedUzbekPlayer {
  sourceId: string;
  clubName: string;
  name: string;
  shortName: string;
  age: number;
  nationality: string;
  squadNumber: number;
  positions: string[];
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  marketValue: number;
}

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizePosition(p: string): string[] {
  const clean = p.toUpperCase();
  if (clean.includes("GK")) return ["GK"];
  if (clean.includes("DF") || clean.includes("CB")) return ["CB"];
  if (clean.includes("LB")) return ["LB", "LWB"];
  if (clean.includes("RB")) return ["RB", "RWB"];
  if (clean.includes("FW") || clean.includes("ST") || clean.includes("CF")) return ["ST", "CF"];
  if (clean.includes("LW") || clean.includes("LM")) return ["LW", "LM"];
  if (clean.includes("RW") || clean.includes("RM")) return ["RW", "RM"];
  if (clean.includes("DM") || clean.includes("CDM")) return ["CDM", "CM"];
  if (clean.includes("AM") || clean.includes("CAM")) return ["CAM", "CM"];
  return ["CM", "CAM"];
}

function guessPositionByNumber(no: number): string[] {
  if (no === 1 || no === 12 || no === 16 || no === 35) return ["GK"];
  if (no === 2 || no === 3 || no === 4 || no === 5 || no === 6 || no === 28) return ["CB"];
  if (no === 7 || no === 11 || no === 17) return ["LW", "RW"];
  if (no === 9 || no === 10 || no === 14 || no === 99) return ["ST"];
  if (no === 8 || no === 18 || no === 23) return ["CM"];
  return ["CM"];
}

function calculateDeterministicStats(
  name: string,
  tier: number,
  squadNumber: number,
  nationality: string,
  positions: string[]
): {
  overall: number;
  age: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  marketValue: number;
} {
  const hash = stringHash(name);

  // Deterministic age between 20 and 33
  const age = 20 + (hash % 14);

  // Base overall by tier
  let baseOvr = tier === 1 ? 68 : tier === 2 ? 65 : tier === 3 ? 63 : 61;

  // Starter bonus
  if (squadNumber > 0 && squadNumber <= 11) baseOvr += 3;
  else if (squadNumber > 11 && squadNumber <= 25) baseOvr += 1;

  // Foreign player bonus
  if (nationality !== "UZB") baseOvr += 2;

  // Age factor
  if (age >= 24 && age <= 28) baseOvr += 1;
  else if (age <= 21) baseOvr -= 1;

  // Deterministic variance (-2 to +2)
  const variance = (hash % 5) - 2;
  const overall = Math.min(76, Math.max(56, baseOvr + variance));

  // Primary position
  const pos = positions[0];
  let pace = overall;
  let shooting = overall;
  let passing = overall;
  let dribbling = overall;
  let defending = overall;
  let physical = overall;

  if (pos === "GK") {
    pace = Math.max(40, overall - 20);
    shooting = Math.max(25, overall - 40);
    passing = Math.max(50, overall - 10);
    dribbling = Math.max(40, overall - 25);
    defending = Math.max(30, overall - 35);
    physical = Math.max(55, overall - 5);
  } else if (pos === "CB" || pos === "LB" || pos === "RB") {
    pace = Math.max(50, overall - 6 + ((hash >> 1) % 7));
    shooting = Math.max(30, overall - 30 + ((hash >> 2) % 6));
    passing = Math.max(45, overall - 12 + ((hash >> 3) % 6));
    dribbling = Math.max(45, overall - 15 + ((hash >> 4) % 6));
    defending = Math.min(82, overall + 4);
    physical = Math.min(82, overall + 3);
  } else if (pos === "ST" || pos === "CF") {
    pace = Math.min(84, overall + 4 + ((hash >> 1) % 5));
    shooting = Math.min(82, overall + 4);
    passing = Math.max(45, overall - 10 + ((hash >> 2) % 6));
    dribbling = Math.min(80, overall + 2);
    defending = Math.max(25, overall - 35);
    physical = Math.max(50, overall - 2 + ((hash >> 3) % 6));
  } else {
    // Midfielders
    pace = Math.max(55, overall - 2 + ((hash >> 1) % 6));
    shooting = Math.max(45, overall - 6 + ((hash >> 2) % 6));
    passing = Math.min(82, overall + 3);
    dribbling = Math.min(80, overall + 2);
    defending = Math.max(45, overall - 6);
    physical = Math.max(55, overall - 3 + ((hash >> 3) % 6));
  }

  // Market value proportional to rating
  let marketValue: number;
  if (overall >= 74) {
    marketValue = 900_000 + ((overall - 74) * 250_000) + ((hash % 10) * 20_000);
  } else if (overall >= 70) {
    marketValue = 500_000 + ((overall - 70) * 90_000) + ((hash % 10) * 15_000);
  } else if (overall >= 65) {
    marketValue = 250_000 + ((overall - 65) * 45_000) + ((hash % 10) * 10_000);
  } else {
    marketValue = 100_000 + ((overall - 56) * 15_000) + ((hash % 10) * 5_000);
  }

  return { overall, age, pace, shooting, passing, dribbling, defending, physical, marketValue };
}

async function fetchWikitext(source: UzbekClubSource): Promise<string> {
  const isUz = Boolean(source.uzWikiPage || source.uzWikiTemplate);
  const host = isUz ? "uz.wikipedia.org" : "en.wikipedia.org";
  const target = source.wikiTemplate
    ? `Template:${source.wikiTemplate}`
    : source.uzWikiTemplate
    ? source.uzWikiTemplate
    : source.uzWikiPage
    ? source.uzWikiPage
    : source.wikiPage;

  const url = `https://${host}/w/api.php?action=parse&page=${encodeURIComponent(target!)}&redirects=1&prop=wikitext&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": "OFMGameBot/1.0 (https://t.me/ofm_game_bot; admin@vidtechno.uz)" } });
  if (!res.ok) throw new Error(`${source.name} HTTP ${res.status}`);
  const data = await res.json();
  return data.parse?.wikitext?.["*"] ?? "";
}

function parseWikitextPlayers(wikitext: string, source: UzbekClubSource): ParsedUzbekPlayer[] {
  const rawList: Array<{ no: number; nat: string; name: string; pos: string[] }> = [];

  const fsRegex = /\{\{Fs player\|([^}]+)\}\}/gi;
  let match: RegExpExecArray | null;
  while ((match = fsRegex.exec(wikitext)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    const no = parseInt(raw.match(/no\s*=\s*(\d+)/i)?.[1] ?? "0", 10);
    const nat = raw.match(/nat\s*=\s*([A-Za-z]{3})/i)?.[1]?.toUpperCase() ?? "UZB";
    const posStr = raw.match(/pos\s*=\s*([A-Za-z]{2})/i)?.[1]?.toUpperCase() ?? "MF";
    let name = raw.match(/name\s*=\s*([^|]+)/i)?.[1] ?? "";
    name = name.replace(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g, "$1").replace(/[\[\]]/g, "").replace(/\(.*?\)/g, "").trim();
    if (name) {
      rawList.push({ no, nat, name, pos: normalizePosition(posStr) });
    }
  }

  if (rawList.length === 0) {
    const s2Regex = /\{\{football squad2 player\|([^}]+)\}\}/gi;
    while ((match = s2Regex.exec(wikitext)) !== null) {
      const raw = match[1];
      if (!raw) continue;
      const no = parseInt(raw.match(/no\s*=\s*(\d+)/i)?.[1] ?? "0", 10);
      let name = raw.match(/name\s*=\s*([^|]+)/i)?.[1] ?? "";
      name = name.replace(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g, "$1").replace(/[\[\]]/g, "").replace(/\(.*?\)/g, "").trim();
      const pos = guessPositionByNumber(no);
      if (name) {
        rawList.push({ no, nat: "UZB", name, pos });
      }
    }
  }

  // Filter out any duplicate names in same squad and limit to top 28
  const seen = new Set<string>();
  const parsed: ParsedUzbekPlayer[] = [];

  for (const item of rawList) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const stats = calculateDeterministicStats(item.name, source.tier, item.no, item.nat, item.pos);
    const parts = item.name.split(" ");
    const initial = parts[0]?.[0] ?? "";
    const shortName = parts.length > 1 && initial ? `${initial}. ${parts.slice(1).join(" ")}` : item.name;

    parsed.push({
      sourceId: `UZB_${source.code}_${item.no}_${stringHash(item.name)}`,
      clubName: source.name,
      name: item.name,
      shortName,
      age: stats.age,
      nationality: item.nat,
      squadNumber: item.no,
      positions: item.pos,
      overall: stats.overall,
      pace: stats.pace,
      shooting: stats.shooting,
      passing: stats.passing,
      dribbling: stats.dribbling,
      defending: stats.defending,
      physical: stats.physical,
      marketValue: stats.marketValue,
    });

    if (parsed.length >= 28) break;
  }

  return parsed;
}

export async function importUzbekPlayers(options: { dryRun?: boolean } = {}): Promise<{
  totalImported: number;
  clubCounts: Record<string, number>;
  ratingDistribution: { "75-76": number; "70-74": number; "65-69": number; "<65": number };
}> {
  console.log(`Starting Uzbekistan Superliga player import (dryRun=${Boolean(options.dryRun)})...`);
  const database = createDatabaseClient(loadConfig());

  // 1. Get UZB competition and clubs
  const { data: comp } = await database
    .from("competitions")
    .select("id")
    .eq("code", "UZB")
    .single();

  if (!comp) throw new Error("UZB competition not found");

  const { data: clubs, error: clubsErr } = await database
    .from("clubs")
    .select("id, name")
    .eq("competition_id", comp.id);

  if (clubsErr) throw clubsErr;
  const clubIdByName = new Map((clubs ?? []).map((c) => [c.name, c.id]));

  console.log(`Found ${clubIdByName.size} Uzbek clubs in DB.`);

  // 2. Fetch and parse players for all 16 clubs
  const allPlayers: ParsedUzbekPlayer[] = [];
  const clubCounts: Record<string, number> = {};
  const ratingDistribution = { "75-76": 0, "70-74": 0, "65-69": 0, "<65": 0 };

  for (const src of UZBEK_SOURCES) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const wt = await fetchWikitext(src);
      const squad = parseWikitextPlayers(wt, src);
      if (squad.length < 15) {
        throw new Error(`Squad too small for ${src.name}: ${squad.length}`);
      }

      clubCounts[src.name] = squad.length;
      for (const p of squad) {
        allPlayers.push(p);
        if (p.overall >= 75) ratingDistribution["75-76"]++;
        else if (p.overall >= 70) ratingDistribution["70-74"]++;
        else if (p.overall >= 65) ratingDistribution["65-69"]++;
        else ratingDistribution["<65"]++;
      }
      console.log(`- ${src.name}: ${squad.length} players parsed (Top: ${squad[0]?.name} ⭐${squad[0]?.overall})`);
    } catch (e: any) {
      console.error(`Error parsing ${src.name}: ${e.message}`);
      throw e;
    }
  }

  console.log(`Total Uzbek players parsed: ${allPlayers.length}`);
  console.log("Rating Distribution:", ratingDistribution);

  if (options.dryRun) {
    return { totalImported: allPlayers.length, clubCounts, ratingDistribution };
  }

  // 3. Upsert data source
  let { data: source } = await database
    .from("data_sources")
    .select("id")
    .eq("code", "PFL_UZB_2026")
    .maybeSingle();

  if (!source) {
    const { data: created, error: sourceErr } = await database
      .from("data_sources")
      .insert({
        code: "PFL_UZB_2026",
        name: "Uzbekistan Superliga 2026 Rosters",
        version: "2026-v1",
        source_url: "https://pfl.uz/uz",
        license: "Official UzPFL / Open Documentation",
      })
      .select("id")
      .single();
    if (sourceErr) throw sourceErr;
    source = created;
  }

  // 4. Batch upsert players
  const BATCH_SIZE = 100;
  for (let i = 0; i < allPlayers.length; i += BATCH_SIZE) {
    const batch = allPlayers.slice(i, i + BATCH_SIZE);
    const { data: saved, error } = await database
      .from("players")
      .upsert(
        batch.map((p) => ({
          data_source_id: source.id,
          source_player_id: p.sourceId,
          club_id: clubIdByName.get(p.clubName)!,
          name: p.name,
          short_name: p.shortName,
          age: p.age,
          nationality: p.nationality,
          primary_position: p.positions[0],
          secondary_position: p.positions[1] ?? null,
          market_value: p.marketValue,
        })),
        { onConflict: "data_source_id,source_player_id" }
      )
      .select("id, source_player_id");

    if (error) throw error;

    const playerIds = new Map((saved ?? []).map((row) => [row.source_player_id, row.id]));

    // Attributes
    const { error: ae } = await database.from("player_attributes").upsert(
      batch.map((p) => ({
        player_id: playerIds.get(p.sourceId)!,
        overall: p.overall,
        pace: p.pace,
        shooting: p.shooting,
        passing: p.passing,
        dribbling: p.dribbling,
        defending: p.defending,
        physical: p.physical,
      })),
      { onConflict: "player_id" }
    );
    if (ae) throw ae;

    // Positions
    const { error: pe } = await database.from("player_positions").upsert(
      batch.flatMap((p) =>
        p.positions.map((position, index) => ({
          player_id: playerIds.get(p.sourceId)!,
          position,
          priority: index + 1,
        }))
      ),
      { onConflict: "player_id,position" }
    );
    if (pe) throw pe;
  }

  console.log(`Uzbekistan Superliga import completed: ${allPlayers.length} players inserted/updated.`);
  return { totalImported: allPlayers.length, clubCounts, ratingDistribution };
}

if (process.argv[1]?.endsWith("import-uzbek-players.ts")) {
  const isDryRun = process.argv.includes("--dry-run");
  importUzbekPlayers({ dryRun: isDryRun }).catch(console.error);
}
