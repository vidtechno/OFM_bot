import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const { data: lcs } = await db.from("league_clubs").select("id, club_id, clubs(name), transfer_budget, reserved_transfer_budget, cash_balance, manager_type, league_instance_id");
  console.log("Total league_clubs:", lcs?.length);
  for (const lc of (lcs || []).slice(0, 15)) {
    console.log(`- ${(lc.clubs as any)?.name}: transfer_budget=${lc.transfer_budget}, reserved=${lc.reserved_transfer_budget}, cash=${lc.cash_balance}, manager=${lc.manager_type}`);
  }
}

main().catch(console.error);
