import { readFile } from "node:fs/promises";
import { loadConfig } from "../config/env.js";
import { createDatabaseClient } from "../db/client.js";
import { Fc26Provider } from "./providers/fc26.provider.js";

const SOURCE_URL = "https://raw.githubusercontent.com/ismailoksuz/EAFC26-DataHub/main/data/players.csv";
const BATCH_SIZE = 200;
const aliases: Record<string, string> = {
  "AFC Bournemouth": "Bournemouth",
  "Brighton & Hove Albion": "Brighton",
  "Fulham FC": "Fulham",
  "Manchester Utd": "Manchester United",
  "Newcastle Utd": "Newcastle United",
  "Nottingham Forest": "Nottingham Forest",
  "Tottenham Hotspur": "Tottenham Hotspur",
  "Wolverhampton Wanderers": "Wolverhampton",
  "Athletic Club": "Athletic Club",
  "Atlético de Madrid": "Atlético Madrid",
  "Celta de Vigo": "Celta Vigo",
  "Deportivo Alavés": "Alavés",
  "RCD Espanyol": "Espanyol",
  "Real Oviedo": "Real Oviedo",
  "Real Sociedad": "Real Sociedad",
  "Real Betis": "Real Betis",
  "Villarreal CF": "Villarreal",
  "Valencia CF": "Valencia",
  "Sevilla FC": "Sevilla",
  "Real Betis Balompié": "Real Betis",
  "CA Osasuna": "Osasuna",
  "RCD Mallorca": "Mallorca",
  "Levante UD": "Levante",
  "Girona FC": "Girona",
  "Getafe CF": "Getafe",
  "Elche CF": "Elche",
  "RC Celta": "Celta Vigo",
  "FC Barcelona": "Barcelona",
};

async function sourceText(): Promise<string> {
  const localPath = process.argv[2];
  if (localPath) return readFile(localPath, "utf8");
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`Dataset download failed: ${response.status}`);
  return response.text();
}

async function main(): Promise<void> {
  const database = createDatabaseClient(loadConfig());
  const provider = new Fc26Provider();
  const [{ data: clubs, error: clubsError }, { data: source, error: sourceError }] = await Promise.all([
    database.from("clubs").select("id, name"),
    database.from("data_sources").select("id").eq("code", provider.code).single(),
  ]);
  if (clubsError) throw clubsError;
  if (sourceError) throw sourceError;
  const clubByName = new Map((clubs ?? []).map((club) => [club.name, club.id]));
  const players = provider.load(await sourceText()).filter((player) => clubByName.has(aliases[player.clubName] ?? player.clubName));

  for (let index = 0; index < players.length; index += BATCH_SIZE) {
    const batch = players.slice(index, index + BATCH_SIZE);
    const playerRows = batch.map((player) => ({
      data_source_id: source.id, source_player_id: player.sourcePlayerId,
      club_id: clubByName.get(aliases[player.clubName] ?? player.clubName), name: player.name,
      short_name: player.shortName, age: player.age, nationality: player.nationality,
      primary_position: player.positions[0], secondary_position: player.positions[1] ?? null,
      market_value: player.marketValue,
    }));
    const { data: saved, error } = await database.from("players").upsert(playerRows, {
      onConflict: "data_source_id,source_player_id",
    }).select("id, source_player_id");
    if (error) throw error;
    const idBySource = new Map((saved ?? []).map((row) => [row.source_player_id, row.id]));
    const attributes = batch.map((player) => ({
      player_id: idBySource.get(player.sourcePlayerId), overall: player.overall, pace: player.pace,
      shooting: player.shooting, passing: player.passing, dribbling: player.dribbling,
      defending: player.defending, physical: player.physical,
    }));
    const positions = batch.flatMap((player) => player.positions.map((position, priority) => ({
      player_id: idBySource.get(player.sourcePlayerId), position, priority: priority + 1,
    })));
    const { error: attrError } = await database.from("player_attributes").upsert(attributes, { onConflict: "player_id" });
    if (attrError) throw attrError;
    const { error: posError } = await database.from("player_positions").upsert(positions, { onConflict: "player_id,position" });
    if (posError) throw posError;
    process.stdout.write(`Imported ${Math.min(index + BATCH_SIZE, players.length)}/${players.length}\n`);
  }
  const { data: linked, error: linkError } = await database.rpc("sync_club_players");
  if (linkError) throw linkError;
  await database.from("data_sources").update({ imported_at: new Date().toISOString() }).eq("id", source.id);
  process.stdout.write(`Done: ${players.length} players, ${linked} club-player links created.\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : JSON.stringify(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
