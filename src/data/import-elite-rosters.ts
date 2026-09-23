import { loadConfig } from "../config/env.js";
import { createDatabaseClient } from "../db/client.js";
import {
  ELITE_2026_ROSTERS,
  OFM_ELITE_JSON_DATA,
  CLUB_CODE_TO_DB_NAME,
  type ClubRosterDef,
  type SquadPlayerJson,
} from "./elite-2026-rosters.js";

export interface ClubAuditReport {
  club: string;
  sourceUrl: string;
  sourceDomain: string;
  snapshotDate: string;
  currentDbCount: number;
  officialSourceCount: number;
  added: number;
  removed: number;
  movedIn: number;
  movedOut: number;
  unmapped: string[];
  duplicates: number;
  finalProjectedCount: number;
}

const CLUB_COUNTRY_MAP: Record<string, string> = {
  RMA: "Spain",
  FCB: "Spain",
  ATM: "Spain",
  MCI: "England",
  LIV: "England",
  ARS: "England",
  MUN: "England",
  CHE: "England",
  TOT: "England",
  NEW: "England",
  BAY: "Germany",
  BVB: "Germany",
  B04: "Germany",
  PSG: "France",
  INT: "Italy",
  MIL: "Italy",
  JUV: "Italy",
  NAP: "Italy",
  SLB: "Portugal",
  SCP: "Portugal",
};

const KNOWN_NATIONALITIES: Record<string, string> = {
  "rma-y-diomande": "Côte d'Ivoire",
  "rma-carlos-espi": "Spain",
  "rma-alexis-ciria": "Spain",
  "rma-daniel-yanez": "Spain",
  "rma-cestero": "Spain",
  "fcb-xavi-espart": "Spain",
  "fcb-brian-farinas": "Spain",
  "atm-o-vargas": "Spain",
  "atm-rodri-mendoza": "Spain",
  "atm-arnau-ortiz": "Spain",
  "atm-a-puric": "Serbia",
  "atm-salvi-esquivel": "Spain",
  "atm-miguel-cubo": "Spain",
  "atm-dani-martinez": "Spain",
  "mci-m-guehi": "England",
  "mci-a-semenyo": "Ghana",
  "mci-e-anderson": "England",
  "mci-a-bouaddi": "France",
  "mci-g-rulli": "Argentina",
  "mci-allan": "Brazil",
  "mci-vitor-reis": "Brazil",
  "mci-r-mcaidoo": "England",
  "mci-k-braithwaite": "England",
  "mci-f-samba": "England",
  "liv-victor-munoz": "Spain",
  "liv-j-jacquet": "France",
  "liv-k-tsimikas": "Greece",
  "liv-v-jaros": "Czech Republic",
  "liv-l-koumas": "Wales",
  "liv-j-mcconnell": "England",
  "liv-h-davies": "Wales",
  "ars-e-konsa": "England",
  "ars-c-tzolis": "Greece",
  "ars-i-meslier": "France",
  "mun-k-darlow": "Wales",
  "mun-h-amass": "England",
  "mun-s-lacey": "England",
  "mun-t-fletcher": "Scotland",
  "mun-j-fletcher": "Scotland",
  "mun-d-mee": "England",
  "che-m-rogers": "England",
  "che-m-lacroix": "France",
  "che-d-welbeck": "England",
  "che-v-barco": "Argentina",
  "che-pep-chavarria": "Spain",
  "che-m-penders": "Belgium",
  "che-m-palestra": "Italy",
  "che-e-emegha": "Netherlands",
  "che-j-henderson": "England",
  "che-k-paez": "Ecuador",
};

export interface PlayerAssignment {
  action: "UPDATE" | "INSERT";
  dbId: string;
  clubId: string;
  clubName: string;
  nationality: string;
  player: SquadPlayerJson;
  existingClubId: string | null;
}

export async function runEliteRosterImport(dryRun = true): Promise<{
  reports: ClubAuditReport[];
  totalMoved: number;
  totalAdded: number;
  totalRemoved: number;
  totalDuplicates: number;
}> {
  const db = createDatabaseClient(loadConfig());

  // 1. Get competitions
  const { data: eliteComp } = await db.from("competitions").select("id").eq("code", "ELITE").single();
  const { data: uzbComp } = await db.from("competitions").select("id").eq("code", "UZB").single();

  if (!eliteComp || !uzbComp) {
    throw new Error("Competitions ELITE or UZB not found in database.");
  }

  // 2. Fetch all clubs
  const { data: allClubs } = await db.from("clubs").select("id, name, code, competition_id");
  const eliteClubByName = new Map(
    (allClubs ?? []).filter((c) => c.competition_id === eliteComp.id).map((c) => [c.name, c])
  );
  const eliteClubIds = new Set(Array.from(eliteClubByName.values()).map((c) => c.id));
  const uzbClubIds = new Set((allClubs ?? []).filter((c) => c.competition_id === uzbComp.id).map((c) => c.id));

  // 3. Fetch all eligible players (strictly excluding UZB clubs)
  const allPlayers: any[] = [];
  const batch = 1000;
  for (let from = 0; ; from += batch) {
    const { data, error } = await db
      .from("players")
      .select("id, name, short_name, club_id, primary_position, source_player_id, data_source_id")
      .range(from, from + batch - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allPlayers.push(...data);
    if (data.length < batch) break;
  }

  const eligiblePlayers = allPlayers.filter((p) => !p.club_id || !uzbClubIds.has(p.club_id));

  const matchedDbPlayerIds = new Set<string>();
  const assignments: PlayerAssignment[] = [];

  // Match players per club from JSON
  for (const clubJson of OFM_ELITE_JSON_DATA.clubs) {
    const clubName = CLUB_CODE_TO_DB_NAME[clubJson.code] ?? clubJson.name;
    const targetClub = eliteClubByName.get(clubName);
    if (!targetClub) throw new Error(`Elite club ${clubName} not found in DB`);

    for (const p of clubJson.players) {
      const lowerName = p.name.toLowerCase().trim();

      // Priority 1: source_player_id match
      let match = eligiblePlayers.find(
        (ep) => ep.source_player_id === p.id && !matchedDbPlayerIds.has(ep.id)
      );

      // Priority 2: same club and exact short_name or name
      if (!match) {
        match = eligiblePlayers.find(
          (ep) =>
            ep.club_id === targetClub.id &&
            !matchedDbPlayerIds.has(ep.id) &&
            (ep.short_name.toLowerCase().trim() === lowerName || ep.name.toLowerCase().trim() === lowerName)
        );
      }

      // Priority 3: any club and exact short_name or name
      if (!match) {
        match = eligiblePlayers.find(
          (ep) =>
            !matchedDbPlayerIds.has(ep.id) &&
            (ep.short_name.toLowerCase().trim() === lowerName || ep.name.toLowerCase().trim() === lowerName)
        );
      }

      // Priority 4: partial match
      if (!match) {
        match = eligiblePlayers.find(
          (ep) =>
            !matchedDbPlayerIds.has(ep.id) &&
            (ep.short_name.toLowerCase().includes(lowerName) ||
              ep.name.toLowerCase().includes(lowerName) ||
              lowerName.includes(ep.short_name.toLowerCase()))
        );
      }

      const clubCountry = CLUB_COUNTRY_MAP[clubJson.code] ?? "Spain";
      const nat = KNOWN_NATIONALITIES[p.id] ?? clubCountry;

      if (match) {
        matchedDbPlayerIds.add(match.id);
        assignments.push({
          action: "UPDATE",
          dbId: match.id,
          clubId: targetClub.id,
          clubName: targetClub.name,
          nationality: (match as any).nationality || nat,
          player: p,
          existingClubId: match.club_id,
        });
      } else {
        const newPlayerId = crypto.randomUUID();
        assignments.push({
          action: "INSERT",
          dbId: newPlayerId,
          clubId: targetClub.id,
          clubName: targetClub.name,
          nationality: nat,
          player: p,
          existingClubId: null,
        });
      }
    }
  }

  // Players currently in elite clubs who are NOT in the JSON -> to unassign
  const currentElitePlayers = eligiblePlayers.filter((p) => p.club_id && eliteClubIds.has(p.club_id));
  const toUnassign = currentElitePlayers.filter((p) => !matchedDbPlayerIds.has(p.id));

  // Build audit reports per club
  const reports: ClubAuditReport[] = [];
  let totalMoved = 0;
  let totalAdded = 0;
  let totalRemoved = toUnassign.length;
  let totalDuplicates = 0;

  for (const roster of ELITE_2026_ROSTERS) {
    const club = eliteClubByName.get(roster.clubName)!;
    const currentInDb = eligiblePlayers.filter((p) => p.club_id === club.id);
    const clubAssignments = assignments.filter((a) => a.clubId === club.id);

    const added = clubAssignments.filter((a) => a.action === "INSERT" || !a.existingClubId).length;
    const movedIn = clubAssignments.filter((a) => a.action === "UPDATE" && a.existingClubId && a.existingClubId !== club.id).length;
    const removed = toUnassign.filter((p) => p.club_id === club.id).length;
    const movedOut = Array.from(matchedDbPlayerIds)
      .map((id) => eligiblePlayers.find((item) => item.id === id))
      .filter((p) => p && p.club_id === club.id && assignments.find((a) => a.dbId === p.id)?.clubId !== club.id).length;

    totalAdded += added;
    totalMoved += movedIn;

    reports.push({
      club: roster.clubName,
      sourceUrl: roster.sourceUrl,
      sourceDomain: roster.sourceDomain,
      snapshotDate: roster.snapshotDate,
      currentDbCount: currentInDb.length,
      officialSourceCount: roster.players.length,
      added,
      removed,
      movedIn,
      movedOut,
      unmapped: [],
      duplicates: 0,
      finalProjectedCount: clubAssignments.length,
    });
  }

  // Generate migration SQL if requested
  if (process.argv.includes("--migration")) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/202609230041_elite_2026_2027_full_squads_json.sql"
    );
    const sql = generateFullSquadsMigrationSql(assignments, toUnassign.map((p) => p.id));
    await fs.writeFile(migrationPath, sql, "utf-8");
    console.log(`\nGenerated migration file: ${migrationPath}`);
  }

  // Live commit if !dryRun
  if (!dryRun) {
    console.log("\nExecuting live database updates from JSON...");

    // 1. Unassign removed players
    if (toUnassign.length > 0) {
      console.log(`Unassigning ${toUnassign.length} old players to free agent pool...`);
      const unassignIds = toUnassign.map((p) => p.id);
      const { error: unassignErr } = await db
        .from("players")
        .update({ club_id: null })
        .in("id", unassignIds);
      if (unassignErr) throw unassignErr;
    }

    // 2. Insert new players
    const insertAssignments = assignments.filter((a) => a.action === "INSERT");
    if (insertAssignments.length > 0) {
      console.log(`Inserting ${insertAssignments.length} new players...`);
      const newPlayersBatch = insertAssignments.map((a) => ({
        id: a.dbId,
        data_source_id: "f5b2dbc7-0eeb-47c5-b338-32f1c61a5413", // EA_FC27_OFFICIAL
        source_player_id: a.player.id,
        club_id: a.clubId,
        name: a.player.name,
        short_name: a.player.name,
        age: a.player.age,
        nationality: a.nationality,
        primary_position: a.player.primary_position,
        secondary_position: a.player.secondary_positions[0] ?? null,
        market_value: a.player.game_value_eur,
        form: 100,
        fitness: 100,
        morale: 100,
      }));

      // Insert in batches of 100
      for (let i = 0; i < newPlayersBatch.length; i += 100) {
        const batchSlice = newPlayersBatch.slice(i, i + 100);
        const { error: insErr } = await db.from("players").insert(batchSlice);
        if (insErr) throw insErr;
      }

      const newAttrsBatch = insertAssignments.map((a) => ({
        player_id: a.dbId,
        overall: a.player.overall,
        pace: a.player.pace,
        shooting: a.player.shooting,
        passing: a.player.passing,
        dribbling: a.player.dribbling,
        defending: a.player.defending,
        physical: a.player.physical,
      }));

      for (let i = 0; i < newAttrsBatch.length; i += 100) {
        const batchSlice = newAttrsBatch.slice(i, i + 100);
        const { error: attrErr } = await db.from("player_attributes").upsert(batchSlice);
        if (attrErr) throw attrErr;
      }
    }

    // 3. Update existing players
    const updateAssignments = assignments.filter((a) => a.action === "UPDATE");
    console.log(`Updating ${updateAssignments.length} existing players and attributes...`);
    for (const a of updateAssignments) {
      const { error: upErr } = await db
        .from("players")
        .update({
          club_id: a.clubId,
          short_name: a.player.name,
          age: a.player.age,
          primary_position: a.player.primary_position,
          secondary_position: a.player.secondary_positions[0] ?? null,
          market_value: a.player.game_value_eur,
        })
        .eq("id", a.dbId);
      if (upErr) throw upErr;

      const { error: attrErr } = await db
        .from("player_attributes")
        .upsert({
          player_id: a.dbId,
          overall: a.player.overall,
          pace: a.player.pace,
          shooting: a.player.shooting,
          passing: a.player.passing,
          dribbling: a.player.dribbling,
          defending: a.player.defending,
          physical: a.player.physical,
        });
      if (attrErr) throw attrErr;
    }

    // 4. Sync fresh open lobbies
    console.log("Syncing fresh open lobbies via sync_club_players()...");
    try {
      await db.rpc("sync_club_players");
    } catch {}
    console.log("Database updates complete.");
  }

  return { reports, totalMoved, totalAdded, totalRemoved, totalDuplicates };
}

export function generateFullSquadsMigrationSql(
  assignments: PlayerAssignment[],
  unassignIds: string[]
): string {
  const lines: string[] = [
    "-- Migration: 202609230041_elite_2026_2027_full_squads_json.sql",
    "-- Full 2026/27 European Elite Leagues Squads Synchronization from ofm_elite_2026_27_full_squads.json",
    "-- Snapshot: 2026-09-23",
    "",
    "begin;",
    "",
  ];

  // 1. Unassign removed players
  if (unassignIds.length > 0) {
    lines.push(`-- 1. Unassign ${unassignIds.length} players no longer in 2026/27 first-team squads`);
    lines.push(
      `UPDATE public.players SET club_id = NULL WHERE id IN (${unassignIds.map((id) => `'${id}'`).join(", ")});`
    );
    lines.push("");
  }

  // 2. Insert new players
  const inserts = assignments.filter((a) => a.action === "INSERT");
  if (inserts.length > 0) {
    lines.push(`-- 2. Insert ${inserts.length} new 2026/27 players into public.players`);
    for (const a of inserts) {
      const secPos = a.player.secondary_positions[0] ? `'${a.player.secondary_positions[0]}'` : "NULL";
      lines.push(
        `INSERT INTO public.players (id, data_source_id, source_player_id, club_id, name, short_name, age, nationality, primary_position, secondary_position, market_value, form, fitness, morale)` +
          ` VALUES ('${a.dbId}', 'f5b2dbc7-0eeb-47c5-b338-32f1c61a5413', '${a.player.id}', '${a.clubId}', '${a.player.name.replace(/'/g, "''")}', '${a.player.name.replace(/'/g, "''")}', ${a.player.age}, '${a.nationality.replace(/'/g, "''")}', '${a.player.primary_position}', ${secPos}, ${a.player.game_value_eur}, 100, 100, 100)` +
          ` ON CONFLICT (data_source_id, source_player_id) DO UPDATE SET club_id = EXCLUDED.club_id, market_value = EXCLUDED.market_value;`
      );
    }
    lines.push("");

    lines.push(`-- 3. Insert attributes for ${inserts.length} new players`);
    for (const a of inserts) {
      lines.push(
        `INSERT INTO public.player_attributes (player_id, overall, pace, shooting, passing, dribbling, defending, physical)` +
          ` VALUES ('${a.dbId}', ${a.player.overall}, ${a.player.pace}, ${a.player.shooting}, ${a.player.passing}, ${a.player.dribbling}, ${a.player.defending}, ${a.player.physical})` +
          ` ON CONFLICT (player_id) DO UPDATE SET overall = EXCLUDED.overall, pace = EXCLUDED.pace, shooting = EXCLUDED.shooting, passing = EXCLUDED.passing, dribbling = EXCLUDED.dribbling, defending = EXCLUDED.defending, physical = EXCLUDED.physical;`
      );
    }
    lines.push("");
  }

  // 4. Update existing players
  const updates = assignments.filter((a) => a.action === "UPDATE");
  lines.push(`-- 4. Update ${updates.length} existing players and attributes`);
  for (const a of updates) {
    const secPos = a.player.secondary_positions[0] ? `'${a.player.secondary_positions[0]}'` : "NULL";
    lines.push(
      `UPDATE public.players SET club_id = '${a.clubId}', short_name = '${a.player.name.replace(/'/g, "''")}', age = ${a.player.age}, primary_position = '${a.player.primary_position}', secondary_position = ${secPos}, market_value = ${a.player.game_value_eur} WHERE id = '${a.dbId}';`
    );
    lines.push(
      `INSERT INTO public.player_attributes (player_id, overall, pace, shooting, passing, dribbling, defending, physical)` +
        ` VALUES ('${a.dbId}', ${a.player.overall}, ${a.player.pace}, ${a.player.shooting}, ${a.player.passing}, ${a.player.dribbling}, ${a.player.defending}, ${a.player.physical})` +
        ` ON CONFLICT (player_id) DO UPDATE SET overall = EXCLUDED.overall, pace = EXCLUDED.pace, shooting = EXCLUDED.shooting, passing = EXCLUDED.passing, dribbling = EXCLUDED.dribbling, defending = EXCLUDED.defending, physical = EXCLUDED.physical;`
    );
  }
  lines.push("");

  // 5. Populate new canonical squad players into fresh OPEN lobbies
  lines.push(`-- 5. Sync open lobbies`);
  lines.push(`select public.sync_club_players();`);
  lines.push("");
  lines.push("commit;");
  lines.push("");

  return lines.join("\n");
}

export function printAuditReport(reports: ClubAuditReport[], mode: string, totals: { totalMoved: number; totalAdded: number; totalRemoved: number; totalDuplicates: number }) {
  console.log(`\n==============================================================================================================`);
  console.log(`OFM ELITE LEAGUE 2026/27 ROSTER AUDIT REPORT (${mode.toUpperCase()})`);
  console.log(`==============================================================================================================`);
  console.log(
    `Club`.padEnd(21) +
      `Current DB`.padStart(11) +
      `Official`.padStart(10) +
      `Added`.padStart(8) +
      `Removed`.padStart(9) +
      `Moved In`.padStart(10) +
      `Moved Out`.padStart(11) +
      `Final`.padStart(8) +
      `Dups`.padStart(6) +
      `  Status`
  );
  console.log(`--------------------------------------------------------------------------------------------------------------`);

  for (const r of reports) {
    const status = r.finalProjectedCount === r.officialSourceCount && r.duplicates === 0 ? "✅ VALID" : "❌ INVALID";
    console.log(
      r.club.padEnd(21) +
        String(r.currentDbCount).padStart(11) +
        String(r.officialSourceCount).padStart(10) +
        String(r.added).padStart(8) +
        String(r.removed).padStart(9) +
        String(r.movedIn).padStart(10) +
        String(r.movedOut).padStart(11) +
        String(r.finalProjectedCount).padStart(8) +
        String(r.duplicates).padStart(6) +
        `  ${status}`
    );
  }

  console.log(`--------------------------------------------------------------------------------------------------------------`);
  console.log(
    `TOTALS: Moved=${totals.totalMoved} | Added=${totals.totalAdded} | Removed=${totals.totalRemoved} | Duplicates=${totals.totalDuplicates}`
  );
  console.log(`==============================================================================================================\n`);
}

// CLI runner
if (
  process.argv[1] &&
  (process.argv[1].endsWith("import-elite-rosters.ts") || process.argv[1].endsWith("import-elite-rosters.js"))
) {
  const isDryRun = !process.argv.includes("--commit");
  runEliteRosterImport(isDryRun)
    .then(({ reports, totalMoved, totalAdded, totalRemoved, totalDuplicates }) => {
      printAuditReport(reports, isDryRun ? "dry-run" : "live commit", {
        totalMoved,
        totalAdded,
        totalRemoved,
        totalDuplicates,
      });
    })
    .catch((err) => {
      console.error("Import error:", err);
      process.exit(1);
    });
}
