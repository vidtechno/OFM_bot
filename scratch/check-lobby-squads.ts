import { loadConfig } from "../src/config/env.js";
import { createDatabaseClient } from "../src/db/client.js";

async function main() {
  const db = createDatabaseClient(loadConfig());
  const { data: players } = await db.from("players").select("id, short_name, club_id, clubs(name, competitions(code))");
  let elite = 0, uzb = 0, external = 0;
  for (const p of players || []) {
    if (!p.club_id) external++;
    else if ((p.clubs as any)?.competitions?.code === "ELITE") elite++;
    else if ((p.clubs as any)?.competitions?.code === "UZB") uzb++;
  }
  console.log({ total: players?.length, elite, uzb, external });

  const checkNames = [
    "Modrić", "Palhinha", "X. Simons", "Kolo Muani", "Marmoush", "J. David", "Zhegrova",
    "Rabiot", "Kepa", "Hincapié", "Calafiori", "Mikel Merino", "Sancho", "Pedro Neto",
    "J. Alvarez", "Olise", "Lukaku", "McTominay", "Chiesa", "Alexander-Arnold", "Mbappé"
  ];
  for (const name of checkNames) {
    const { data: found } = await db.from("players")
      .select("short_name, club_id, clubs(name, competitions(code))")
      .ilike("short_name", `%${name}%`);
    console.log(name.padEnd(20), "->", found?.map(f => `${f.short_name} @ ${(f.clubs as any)?.name ?? "EXTERNAL"}`).join(", "));
  }
}

main().catch(console.error);
