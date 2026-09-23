import type { SupabaseClient } from "@supabase/supabase-js";
import { simulateMatch } from "./match-engine.js";
import { MatchRepository } from "./match.repository.js";

export interface MatchSchedulerLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

export interface MatchSchedulerResult {
  claimed: number;
  processed: number;
  failed: number;
  remaining: boolean;
  matchIds: string[];
}

export async function processDueMatches(
  database: SupabaseClient,
  logger: MatchSchedulerLogger,
  options: { batchSize?: number; maxMatches?: number; workerId?: string } = {}
): Promise<MatchSchedulerResult> {
  const repository = new MatchRepository(database);
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 20, 40));
  const maxMatches = Math.max(batchSize, Math.min(options.maxMatches ?? 120, 200));
  const workerId = options.workerId ?? crypto.randomUUID();
  let claimed = 0;
  let processed = 0;
  let failed = 0;
  let remaining = false;
  const matchIds: string[] = [];

  while (claimed < maxMatches) {
    const limit = Math.min(batchSize, maxMatches - claimed);
    const due = await repository.claimDue(limit, workerId);
    claimed += due.length;
    if (!due.length) break;

    for (const fixture of due) {
      try {
        const matchId = await repository.complete(
          fixture.fixtureId,
          simulateMatch(fixture.fixtureId, fixture.home, fixture.away)
        );
        matchIds.push(matchId);
        processed += 1;
      } catch (error: unknown) {
        failed += 1;
        try {
          await repository.releaseClaim(fixture.fixtureId, workerId);
        } catch (releaseError: unknown) {
          logger.warn(
            { event: "fixture_claim_release_failed", fixtureId: fixture.fixtureId, err: releaseError },
            "Fixture claim will expire automatically"
          );
        }
        logger.error(
          { event: "scheduled_match_failed", fixtureId: fixture.fixtureId, err: error },
          "Scheduled match simulation failed"
        );
      }
    }

    if (due.length < limit) break;
    remaining = claimed >= maxMatches;
  }

  logger.info(
    { event: "match_scheduler_completed", workerId, claimed, processed, failed, remaining },
    "Match scheduler run completed"
  );
  return { claimed, processed, failed, remaining, matchIds };
}

export function isAuthorizedSchedulerRequest(req: Request, serviceRoleKey: string): boolean {
  return req.headers.get("authorization") === `Bearer ${serviceRoleKey}`;
}
