import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function main() {
  const sql = `
  select count(*) from public.lineup_players lp
  join public.club_players cp on cp.id = lp.club_player_id
  join public.players p on p.id = cp.player_id
  where p.data_source_id = 'f5b2dbc7-0eeb-47c5-b338-32f1c61a5413';
  `;
  console.log("Checking if direct query or rpc works...");
}

main().catch(console.error);
