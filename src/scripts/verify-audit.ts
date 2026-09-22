import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { TransferRepository } from "../transfers/transfer.repository.js";
import { LeagueRepository } from "../leagues/league.repository.js";

dotenv.config();

const database = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runAudit() {
  console.log("=== 1. Testing League Lobbies ===");
  const leagueRepo = new LeagueRepository(database);
  const lobbies = await leagueRepo.listOpenLobbies();
  console.log("Open lobbies found:", lobbies.length);
  for (const lobby of lobbies) {
    console.log(`- ${lobby.competitionName} #${lobby.instanceNumber} (${lobby.status}): ${lobby.humanCount}/${lobby.maxClubs} managers, closes at: ${lobby.registrationClosesAt}`);
  }

  console.log("\n=== 2. Testing Carlos Espí in Athletic Club Squad (clubTargets) ===");
  const transferRepo = new TransferRepository(database);

  // Find human club and Athletic Club in the same league
  const { data: athleticClub } = await database
    .from("league_clubs")
    .select("id, league_instance_id, clubs!inner(name)")
    .eq("clubs.name", "Athletic Club")
    .limit(1)
    .single();

  if (athleticClub) {
    const { data: realMadrid } = await database
      .from("league_clubs")
      .select("id, manager_user_id, clubs!inner(name)")
      .eq("league_instance_id", athleticClub.league_instance_id)
      .eq("clubs.name", "Real Madrid")
      .limit(1)
      .single();

  if (athleticClub && realMadrid && realMadrid.manager_user_id) {
    const targets = await transferRepo.clubTargets(
      realMadrid.manager_user_id,
      realMadrid.id,
      athleticClub.id,
      0,
      35
    );
    const espi = targets.find((t) => t.name.includes("Espí"));
    console.log("Total Athletic Club players found via clubTargets:", targets.length);
    console.log("Carlos Espí found in Athletic Club squad?", Boolean(espi));
    if (espi) {
      console.log("Carlos Espí details:", {
        name: espi.name,
        clubName: espi.clubName,
        overall: espi.overall,
        marketValue: espi.marketValue,
        isResaleLocked: espi.isResaleLocked,
      });
    }

    console.log("\n=== 3. Testing saleCandidates for Real Madrid (Checking Starting XI detection) ===");
    const candidates = await transferRepo.saleCandidates(realMadrid.manager_user_id, realMadrid.id);
    console.log("Real Madrid sale candidates count:", candidates.length);
    const startingCount = candidates.filter((c) => c.isStarting).length;
    console.log("Candidates marked as Starting XI:", startingCount);
    console.log("Sample candidates:", candidates.slice(0, 3).map((c) => ({
      name: c.name,
      pos: c.position,
      ovr: c.overall,
      isStarting: c.isStarting,
      isListed: c.isListed,
    })));
    }
  }

  console.log("\n=== 4. Checking Reserved Budget Invariant in league_clubs ===");
  const { data: clubsWithGhostBudget } = await database
    .from("league_clubs")
    .select("id, clubs(name), transfer_budget, reserved_transfer_budget")
    .gt("reserved_transfer_budget", 0);

  console.log("Clubs with reserved budget > 0:", (clubsWithGhostBudget ?? []).length);
  for (const c of clubsWithGhostBudget ?? []) {
    const { data: pendingOffers } = await database
      .from("transfer_offers")
      .select("id, status, amount")
      .eq("buyer_club_id", c.id)
      .eq("status", "PENDING");
    console.log(`- ${(c.clubs as any)?.name}: Reserved = €${Number(c.reserved_transfer_budget) / 1e6}M | Pending offers count = ${pendingOffers?.length ?? 0}`);
  }

  console.log("\n=== Audit Complete ===");
}

runAudit().catch(console.error);
