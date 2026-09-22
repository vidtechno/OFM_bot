import { loadConfig } from "../config/env.js";
import { createDatabaseClient } from "../db/client.js";
import { ELITE_2026_ROSTERS, type ClubRosterDef } from "./elite-2026-rosters.js";

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
  const clubById = new Map((allClubs ?? []).map((c) => [c.id, c]));
  const eliteClubByName = new Map(
    (allClubs ?? []).filter((c) => c.competition_id === eliteComp.id).map((c) => [c.name, c])
  );

  // 3. Fetch all players safely with pagination
  const allPlayers: any[] = [];
  const batch = 1000;
  for (let from = 0; ; from += batch) {
    const { data, error } = await db.from("players").select("id, name, short_name, club_id").range(from, from + batch - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allPlayers.push(...data);
    if (data.length < batch) break;
  }

  // Pre-index players (strictly exclude players belonging to UZB competition)
  const uzbClubIds = new Set((allClubs ?? []).filter((c) => c.competition_id === uzbComp.id).map((c) => c.id));
  const eligiblePlayers = allPlayers.filter((p) => !p.club_id || !uzbClubIds.has(p.club_id));

  // Build name lookup map (case-insensitive)
  const playerMapByShortName = new Map<string, any[]>();
  for (const p of eligiblePlayers) {
    const key = p.short_name.toLowerCase().trim();
    const existing = playerMapByShortName.get(key) ?? [];
    existing.push(p);
    playerMapByShortName.set(key, existing);
  }

  const reports: ClubAuditReport[] = [];
  let totalMoved = 0;
  let totalAdded = 0;
  let totalRemoved = 0;
  let totalDuplicates = 0;

  const playerTargetClub = new Map<string, string | null>(); // playerId -> targetClubId

  // Step 1: Register all official targets
  const clubOfficialMatchedPlayers = new Map<string, Set<string>>();
  const unmappedByClub = new Map<string, string[]>();

  for (const roster of ELITE_2026_ROSTERS) {
    const club = eliteClubByName.get(roster.clubName)!;
    const matched = new Set<string>();
    const unmapped: string[] = [];

    for (const officialName of roster.players) {
      const lower = officialName.toLowerCase().trim();
      let matches = playerMapByShortName.get(lower);

      if (!matches || matches.length === 0) {
        matches = eligiblePlayers.filter(
          (p) =>
            p.short_name.toLowerCase().includes(lower) ||
            p.name.toLowerCase().includes(lower) ||
            lower.includes(p.short_name.toLowerCase())
        );
      }

      if (!matches || matches.length === 0) {
        unmapped.push(officialName);
        continue;
      }

      const canonical = matches.find((m) => m.club_id === club.id) ?? matches[0]!;
      matched.add(canonical.id);
      playerTargetClub.set(canonical.id, club.id);
    }

    clubOfficialMatchedPlayers.set(club.id, matched);
    unmappedByClub.set(club.id, unmapped);
  }

  // Step 2: Collect all claimed players across all 20 Elite clubs
  const allClaimedPlayerIds = new Set<string>();
  for (const matchedSet of clubOfficialMatchedPlayers.values()) {
    for (const id of matchedSet) allClaimedPlayerIds.add(id);
  }

  for (const p of eligiblePlayers) {
    if (p.club_id && !allClaimedPlayerIds.has(p.id)) {
      playerTargetClub.set(p.id, null);
    }
  }

  // Step 3: Generate per-club audit report
  for (const roster of ELITE_2026_ROSTERS) {
    const club = eliteClubByName.get(roster.clubName)!;
    const currentPlayersAtClub = eligiblePlayers.filter((p) => p.club_id === club.id);
    const matchedSet = clubOfficialMatchedPlayers.get(club.id)!;
    const unmapped = unmappedByClub.get(club.id)!;

    let added = 0;
    let movedIn = 0;
    for (const pid of matchedSet) {
      const p = eligiblePlayers.find((item) => item.id === pid);
      if (p && p.club_id !== club.id) {
        if (p.club_id) {
          movedIn++;
          totalMoved++;
        } else {
          added++;
          totalAdded++;
        }
      }
    }

    let removed = 0;
    for (const current of currentPlayersAtClub) {
      if (!matchedSet.has(current.id)) {
        removed++;
        totalRemoved++;
      }
    }

    const nameCounts = new Map<string, number>();
    for (const p of currentPlayersAtClub) {
      nameCounts.set(p.short_name, (nameCounts.get(p.short_name) ?? 0) + 1);
    }
    const dupCount = Array.from(nameCounts.values()).filter((c) => c > 1).length;
    totalDuplicates += dupCount;

    const projectedCount = currentPlayersAtClub.length + added + movedIn - removed;

    reports.push({
      club: roster.clubName,
      sourceUrl: roster.sourceUrl,
      sourceDomain: roster.sourceDomain,
      snapshotDate: roster.snapshotDate,
      currentDbCount: currentPlayersAtClub.length,
      officialSourceCount: roster.players.length,
      added,
      removed,
      movedIn,
      movedOut: 0, // calculated later
      unmapped,
      duplicates: dupCount,
      finalProjectedCount: projectedCount,
    });
  }

  // Calculate movedOut per club
  for (const report of reports) {
    const club = eliteClubByName.get(report.club)!;
    const movedOutCount = Array.from(playerTargetClub.entries()).filter(([playerId, targetClubId]) => {
      const p = eligiblePlayers.find((item) => item.id === playerId);
      return p && p.club_id === club.id && targetClubId !== null && targetClubId !== club.id;
    }).length;
    report.movedOut = movedOutCount;
  }

  // Generate migration SQL if requested
  if (process.argv.includes("--migration")) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const migrationPath = path.resolve(process.cwd(), "supabase/migrations/202609230040_elite_2026_2027_rosters_final.sql");
    const sql = generateMigrationSql(playerTargetClub);
    await fs.writeFile(migrationPath, sql, "utf-8");
    console.log(`\nGenerated migration file: ${migrationPath}`);
  }

  // If live mode (!dryRun), execute updates safely in DB
  if (!dryRun) {
    const neededUpdates = Array.from(playerTargetClub.entries()).filter(([playerId, targetClubId]) => {
      const p = eligiblePlayers.find((item) => item.id === playerId);
      return p && p.club_id !== targetClubId;
    });
    console.log(`\nExecuting ${neededUpdates.length} needed roster updates in database...`);
    for (const [playerId, targetClubId] of neededUpdates) {
      const { error } = await db
        .from("players")
        .update({ club_id: targetClubId })
        .eq("id", playerId);
      if (error) throw error;
    }
    console.log("Database updates complete.");
  }

  return { reports, totalMoved, totalAdded, totalRemoved, totalDuplicates };
}

export function generateMigrationSql(playerTargetClub: Map<string, string | null>): string {
  const lines: string[] = [
    "-- Migration: 202609230038_elite_2026_2027_official_rosters.sql",
    "-- Authoritative 2026/27 European Elite Clubs Roster Reconciliation",
    "-- Snapshot: 2026-09-22 / 2026-09-23",
    "",
    "begin;",
    "",
  ];

  const nullClubPlayerIds: string[] = [];
  const clubPlayerMap = new Map<string, string[]>();

  for (const [playerId, targetClubId] of playerTargetClub.entries()) {
    if (!targetClubId) {
      nullClubPlayerIds.push(playerId);
    } else {
      const existing = clubPlayerMap.get(targetClubId) ?? [];
      existing.push(playerId);
      clubPlayerMap.set(targetClubId, existing);
    }
  }

  if (nullClubPlayerIds.length > 0) {
    lines.push(`-- 1. Unassign ${nullClubPlayerIds.length} players to external pool`);
    lines.push(`UPDATE public.players SET club_id = NULL WHERE id IN (${nullClubPlayerIds.map((id) => `'${id}'`).join(", ")});`);
    lines.push("");
  }

  lines.push(`-- 2. Assign players to their 2026/27 European clubs`);
  for (const [clubId, playerIds] of clubPlayerMap.entries()) {
    lines.push(`UPDATE public.players SET club_id = '${clubId}' WHERE id IN (${playerIds.map((id) => `'${id}'`).join(", ")});`);
  }
  lines.push("");

  lines.push(`-- 3. Deduplicate canonical players within each club if any
do $$
declare
  dup_id uuid;
begin
  for dup_id in
    select p1.id
    from public.players p1
    join public.players p2
      on p1.club_id = p2.club_id
      and p1.club_id is not null
      and p1.short_name = p2.short_name
      and p1.id > p2.id
  loop
    delete from public.lineup_players lp
    using public.club_players cp
    where lp.club_player_id = cp.id
      and cp.player_id = dup_id;

    delete from public.global_market_listings where player_id = dup_id;

    delete from public.transfer_offers tf
    using public.club_players cp
    where tf.club_player_id = cp.id
      and cp.player_id = dup_id;

    delete from public.club_players where player_id = dup_id;
    delete from public.players where id = dup_id;
  end loop;
end;
$$;
`);

  lines.push(`-- 4. Clean up stale club_players in OPEN lobbies with 0 transfer activity
delete from public.lineup_players lp
where lp.club_player_id in (
  select cp.id
  from public.club_players cp
  join public.league_clubs lc on lc.id = cp.league_club_id
  join public.league_instances li on li.id = lc.league_instance_id
  join public.players p on p.id = cp.player_id
  where li.status = 'OPEN'
    and p.club_id is distinct from lc.club_id
    and not exists (
      select 1 from public.transfer_offers
      where buyer_club_id = lc.id or seller_club_id = lc.id
    )
);

delete from public.club_players cp
using public.league_clubs lc, public.league_instances li, public.players p
where cp.league_club_id = lc.id
  and cp.player_id = p.id
  and lc.league_instance_id = li.id
  and li.status = 'OPEN'
  and p.club_id is distinct from lc.club_id
  and not exists (
    select 1 from public.transfer_offers
    where buyer_club_id = lc.id or seller_club_id = lc.id
  );

-- 5. Populate new canonical squad players into fresh OPEN lobbies
select public.sync_club_players();

commit;
`);

  return lines.join("\n");
}

// Print formatted audit report
export function printAuditReport(
  reports: ClubAuditReport[],
  dryRun: boolean,
  totals: { totalMoved: number; totalAdded: number; totalRemoved: number; totalDuplicates: number }
) {
  console.log("\n" + "=".repeat(110));
  console.log(`OFM ELITE LEAGUE 2026/27 ROSTER AUDIT REPORT (${dryRun ? "DRY-RUN" : "LIVE COMMIT"})`);
  console.log("=".repeat(110));
  console.log(
    "Club".padEnd(20) +
      "Current DB".padStart(11) +
      "Official".padStart(10) +
      "Added".padStart(8) +
      "Removed".padStart(9) +
      "Moved In".padStart(10) +
      "Moved Out".padStart(11) +
      "Final".padStart(8) +
      "Dups".padStart(7) +
      "  Status"
  );
  console.log("-".repeat(110));

  for (const r of reports) {
    const valid = r.finalProjectedCount >= 18 && r.finalProjectedCount <= 35 && r.duplicates === 0;
    console.log(
      r.club.padEnd(20) +
        String(r.currentDbCount).padStart(11) +
        String(r.officialSourceCount).padStart(10) +
        String(r.added).padStart(8) +
        String(r.removed).padStart(9) +
        String(r.movedIn).padStart(10) +
        String(r.movedOut).padStart(11) +
        String(r.finalProjectedCount).padStart(8) +
        String(r.duplicates).padStart(7) +
        (valid ? "  ✅ VALID" : "  ⚠️ CHECK")
    );
  }
  console.log("-".repeat(110));
  console.log(
    `TOTALS: Moved=${totals.totalMoved} | Added=${totals.totalAdded} | Removed=${totals.totalRemoved} | Duplicates=${totals.totalDuplicates}`
  );
  console.log("=".repeat(110) + "\n");

  const unmappedClubs = reports.filter((r) => r.unmapped.length > 0);
  if (unmappedClubs.length > 0) {
    console.log("UNMAPPED PLAYERS REQUIRING IDENTITY ALIASES:");
    for (const r of unmappedClubs) {
      console.log(`- ${r.club} (${r.unmapped.length}): ${r.unmapped.join(", ")}`);
    }
    console.log("");
  }
}

if (process.argv[1]?.endsWith("import-elite-rosters.ts")) {
  const isDryRun = !process.argv.includes("--commit");
  runEliteRosterImport(isDryRun)
    .then(({ reports, totalMoved, totalAdded, totalRemoved, totalDuplicates }) => {
      printAuditReport(reports, isDryRun, { totalMoved, totalAdded, totalRemoved, totalDuplicates });
    })
    .catch(console.error);
}
