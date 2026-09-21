import { loadConfig } from "../config/env.js";
import { createDatabaseClient } from "../db/client.js";
import { simulateMatch } from "./match-engine.js";
import { MatchRepository } from "./match.repository.js";

const repository = new MatchRepository(createDatabaseClient(loadConfig()));
const due = await repository.due(40);
for (const fixture of due) await repository.complete(fixture.fixtureId, simulateMatch(fixture.fixtureId, fixture.home, fixture.away));
process.stdout.write(JSON.stringify({ processed: due.length }) + "\n");
