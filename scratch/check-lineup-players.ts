import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const { data: lp, error } = await db.from("lineup_players").select("*");
  if (error) console.error("Error:", error);
  console.log("Lineup players (11):", JSON.stringify(lp, null, 2));
}

main().catch(console.error);
