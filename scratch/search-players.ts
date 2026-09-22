import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

const db = createDatabaseClient(loadConfig());

async function listCurrent() {
  const { data: arsenal } = await db.from("clubs").select("id").eq("name", "Arsenal").single();
  const { data: milan } = await db.from("clubs").select("id").eq("name", "AC Milan").single();

  const { data: pArsenal } = await db.from("players").select("short_name, primary_position").eq("club_id", arsenal?.id);
  const { data: pMilan } = await db.from("players").select("short_name, primary_position").eq("club_id", milan?.id);

  console.log("Arsenal current (" + pArsenal?.length + "):", pArsenal?.map(p => p.short_name).join(", "));
  console.log("\nAC Milan current (" + pMilan?.length + "):", pMilan?.map(p => p.short_name).join(", "));
}
listCurrent().catch(console.error);
