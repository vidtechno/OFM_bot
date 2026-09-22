import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const { data: clubs } = await db.from("clubs").select("name, starting_budget, competition_id, competitions(code)");
  console.log("Clubs count:", clubs?.length);
  const sample = clubs?.slice(0, 10);
  for (const c of sample || []) {
    console.log(`- ${c.name} (${(c.competitions as any)?.code}): starting_budget = ${c.starting_budget}`);
  }
}

main().catch(console.error);
