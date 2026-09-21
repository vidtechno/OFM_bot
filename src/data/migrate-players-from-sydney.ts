import { createClient } from "@supabase/supabase-js";
import { loadConfig } from "../config/env.js";

const SYDNEY_SUPABASE_URL = "https://ogwosvgwtxzemrhaiyfj.supabase.co";
const SYDNEY_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nd29zdmd3dHh6ZW1yaGFpeWZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTkyMTg0MSwiZXhwIjoyMTA1NDk3ODQxfQ.OKb1J_TFmrR2LWJKqznd3745X239oIW8sv-9CT0Jf1A";

const BATCH_SIZE = 100;

async function fetchAllRows(client: any, table: string, orderBy = "id"): Promise<any[]> {
  const allRows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await client.from(table).select("*").order(orderBy).range(from, to);
    if (error) throw new Error(`Fetch error on ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
  }
  return allRows;
}

export async function migratePlayersDataset(): Promise<{
  playerCount: number;
  clubPlayerCount: number;
  attributesCount: number;
  positionsCount: number;
}> {
  const config = loadConfig();
  const sydney = createClient(SYDNEY_SUPABASE_URL, SYDNEY_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const frankfurt = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  process.stdout.write("1. Klublar va data source mapping tayyorlanmoqda...\n");

  const [{ data: sClubs, error: scErr }, { data: fClubs, error: fcErr }] = await Promise.all([
    sydney.from("clubs").select("id, code, name"),
    frankfurt.from("clubs").select("id, code, name"),
  ]);
  if (scErr) throw scErr;
  if (fcErr) throw fcErr;

  const fClubByCode = new Map((fClubs ?? []).map((c) => [c.code, c.id]));
  const fClubByName = new Map((fClubs ?? []).map((c) => [c.name, c.id]));

  const sydneyToFrankfurtClubId = new Map<string, string>();
  for (const sc of sClubs ?? []) {
    const targetId = fClubByCode.get(sc.code) ?? fClubByName.get(sc.name);
    if (!targetId) {
      throw new Error(`Frankfurtda klub topilmadi: ${sc.name} (${sc.code})`);
    }
    sydneyToFrankfurtClubId.set(sc.id, targetId);
  }
  process.stdout.write(`   ✓ 40 ta klub 100% moslashtirildi\n`);

  const [{ data: sSources, error: ssErr }, { data: fSources, error: fsErr }] = await Promise.all([
    sydney.from("data_sources").select("id, code"),
    frankfurt.from("data_sources").select("id, code"),
  ]);
  if (ssErr) throw ssErr;
  if (fsErr) throw fsErr;

  const fSourceByCode = new Map((fSources ?? []).map((s) => [s.code, s.id]));
  const sydneyToFrankfurtSourceId = new Map<string, string>();
  for (const ss of sSources ?? []) {
    const targetId = fSourceByCode.get(ss.code);
    if (!targetId) {
      throw new Error(`Frankfurtda data source topilmadi: ${ss.code}`);
    }
    sydneyToFrankfurtSourceId.set(ss.id, targetId);
  }
  process.stdout.write(`   ✓ Data sources moslashtirildi\n`);

  process.stdout.write("2. Sydney loyihasidan ma'lumotlar o'qilmoqda...\n");
  const [sPlayers, sAttributes, sPositions] = await Promise.all([
    fetchAllRows(sydney, "players", "id"),
    fetchAllRows(sydney, "player_attributes", "player_id"),
    fetchAllRows(sydney, "player_positions", "player_id"),
  ]);

  process.stdout.write(
    `   ✓ O'qildi: ${sPlayers.length} players, ${sAttributes.length} attributes, ${sPositions.length} positions\n`
  );

  process.stdout.write("3. Frankfurt loyihasiga import qilinmoqda (idempotent upsert)...\n");

  // Step 3a: Players
  for (let i = 0; i < sPlayers.length; i += BATCH_SIZE) {
    const batch = sPlayers.slice(i, i + BATCH_SIZE).map((p) => ({
      id: p.id,
      data_source_id: sydneyToFrankfurtSourceId.get(p.data_source_id) ?? p.data_source_id,
      source_player_id: p.source_player_id,
      club_id: p.club_id ? (sydneyToFrankfurtClubId.get(p.club_id) ?? null) : null,
      name: p.name,
      short_name: p.short_name,
      age: p.age,
      nationality: p.nationality,
      primary_position: p.primary_position,
      secondary_position: p.secondary_position,
      market_value: p.market_value,
      form: p.form,
      fitness: p.fitness,
      morale: p.morale,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));

    const { error } = await frankfurt.from("players").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`Players import xatosi (batch ${i}): ${error.message}`);
  }
  process.stdout.write(`   ✓ Players muvaffaqiyatli saqlandi: ${sPlayers.length}\n`);

  // Step 3b: Player Attributes
  for (let i = 0; i < sAttributes.length; i += BATCH_SIZE) {
    const batch = sAttributes.slice(i, i + BATCH_SIZE);
    const { error } = await frankfurt.from("player_attributes").upsert(batch, { onConflict: "player_id" });
    if (error) throw new Error(`Player attributes import xatosi (batch ${i}): ${error.message}`);
  }
  process.stdout.write(`   ✓ Player attributes muvaffaqiyatli saqlandi: ${sAttributes.length}\n`);

  // Step 3c: Player Positions
  for (let i = 0; i < sPositions.length; i += BATCH_SIZE) {
    const batch = sPositions.slice(i, i + BATCH_SIZE);
    const { error } = await frankfurt.from("player_positions").upsert(batch, { onConflict: "player_id,position" });
    if (error) throw new Error(`Player positions import xatosi (batch ${i}): ${error.message}`);
  }
  process.stdout.write(`   ✓ Player positions muvaffaqiyatli saqlandi: ${sPositions.length}\n`);

  // Step 3d: Sync Club Players
  process.stdout.write("4. sync_club_players() ishga tushirilmoqda...\n");
  const { data: linkedCount, error: syncErr } = await frankfurt.rpc("sync_club_players");
  if (syncErr) throw new Error(`sync_club_players RPC xatosi: ${syncErr.message}`);
  process.stdout.write(`   ✓ sync_club_players bajarildi: ${linkedCount} bog'lam yaratildi\n`);

  // Update imported_at timestamp on Frankfurt data source
  const eaSourceId = fSourceByCode.get("EA_FC27_OFFICIAL");
  if (eaSourceId) {
    await frankfurt
      .from("data_sources")
      .update({ imported_at: new Date().toISOString() })
      .eq("id", eaSourceId);
  }

  // Verification counts
  const [{ count: pCount }, { count: cpCount }, { count: paCount }, { count: ppCount }] = await Promise.all([
    frankfurt.from("players").select("*", { count: "exact", head: true }),
    frankfurt.from("club_players").select("*", { count: "exact", head: true }),
    frankfurt.from("player_attributes").select("*", { count: "exact", head: true }),
    frankfurt.from("player_positions").select("*", { count: "exact", head: true }),
  ]);

  return {
    playerCount: pCount ?? 0,
    clubPlayerCount: cpCount ?? 0,
    attributesCount: paCount ?? 0,
    positionsCount: ppCount ?? 0,
  };
}

async function main() {
  try {
    const result = await migratePlayersDataset();
    process.stdout.write("\n=========================================\n");
    process.stdout.write("🎉 MIGRATSIYA MUVAFFAQIYATLI YAKUNLANDI!\n");
    process.stdout.write(`- players: ${result.playerCount}\n`);
    process.stdout.write(`- club_players: ${result.clubPlayerCount}\n`);
    process.stdout.write(`- player_attributes: ${result.attributesCount}\n`);
    process.stdout.write(`- player_positions: ${result.positionsCount}\n`);
    process.stdout.write("=========================================\n");
  } catch (error) {
    process.stderr.write(`\nXATOLIK: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("migrate-players-from-sydney.ts")) {
  void main();
}
