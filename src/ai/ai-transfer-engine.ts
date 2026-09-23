import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpenAiStrategyService } from "./openai-strategy.service.js";
import type { Logger } from "../lib/logger.js";

/** Minimum active listings an AI club must maintain on the transfer market */
const MIN_AI_LISTINGS = 2;
/** Maximum active listings per AI club (capped to prevent market flooding) */
const MAX_AI_LISTINGS = 4;
/** Minimum squad size — AI never sells below this threshold */
const MIN_SQUAD_SIZE = 18;

// ─────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────
function first<T>(value: T | T[]): T {
  return Array.isArray(value) ? (value[0] as T) : value;
}

function getOverall(playerOrAttrs: any): number {
  const pa = playerOrAttrs?.player_attributes ?? playerOrAttrs;
  const attr = Array.isArray(pa) ? pa[0] : pa;
  return Number(attr?.overall ?? 75);
}

/**
 * Returns the percentile rank (0–1) of value within sortedDesc (descending).
 * 0 = best player, 1 = worst player.
 */
function percentileRank(sortedDesc: number[], value: number): number {
  if (sortedDesc.length === 0) return 0.5;
  const pos = sortedDesc.findIndex((v) => v <= value);
  return pos === -1 ? 0 : pos / sortedDesc.length;
}

export interface OfferEvaluationResult {
  decision: "ACCEPT" | "REJECT" | "COUNTER";
  counterAmount?: number | undefined;
  reasoning: string;
}

export interface AiOutgoingOffer {
  offerId: string;
  sellerTelegramId: number | null;
  buyerClubName: string;
  sellerClubName: string;
  playerName: string;
  amount: number;
}

export class AiTransferEngine {
  constructor(
    private readonly database: SupabaseClient,
    private readonly strategyService: OpenAiStrategyService,
    private readonly logger: Logger
  ) {}

  // ──────────────────────────────────────────────────────────────
  // PUBLIC: Evaluate a human→AI transfer offer
  // ──────────────────────────────────────────────────────────────
  /**
   * Evaluates a transfer offer sent by a human manager to an AI-managed club.
   * Uses strategy, position scarcity, age, and squad depth to decide.
   */
  async evaluateOffer(
    sellerClubId: string,
    clubPlayerId: string,
    offeredAmount: number
  ): Promise<OfferEvaluationResult> {
    const { data: cp } = await this.database
      .from("club_players")
      .select("id, league_club_id, players!inner(short_name, age, market_value, primary_position, player_attributes!inner(overall)), league_clubs!inner(cash_balance, transfer_budget)")
      .eq("id", clubPlayerId)
      .single();

    if (!cp) {
      return { decision: "REJECT", reasoning: "Player not found" };
    }

    const player = first<any>(cp.players) as any;
    const overall = getOverall(player.player_attributes);
    const marketValue = Number(player.market_value);
    const age = Number(player.age);
    const position = player.primary_position;
    const isGk = position === "GK";

    const strategy = await this.strategyService.getClubStrategy(sellerClubId);

    const { data: samePos } = await this.database
      .from("club_players")
      .select("id, players!inner(primary_position)")
      .eq("league_club_id", sellerClubId)
      .eq("players.primary_position", position);

    const positionCount = samePos?.length ?? 1;

    let multiplier = 1.20;

    if (overall >= 84) {
      multiplier += (overall - 83) * 0.04 * (strategy.star_protection ?? 1);
    }

    if (positionCount <= 1 || (isGk && positionCount <= 1)) {
      multiplier = Math.max(multiplier, 1.60); // Sole position — critical resistance
    } else if (positionCount === 2) {
      multiplier += 0.10;
    } else if (positionCount >= 4) {
      multiplier -= 0.05;
    }

    if (age >= 31) {
      multiplier -= 0.08;
    } else if (age <= 22) {
      multiplier += (strategy.youth_preference ?? 1) * 0.12;
    }

    if (strategy.sell_candidates?.some((name: string) => player.short_name.toLowerCase().includes(name.toLowerCase()))) {
      multiplier -= 0.10;
    }

    const requiredThreshold = Math.max(
      marketValue * 1.20,
      Math.round((marketValue * multiplier) / 100_000) * 100_000
    );

    let decision: "ACCEPT" | "REJECT" | "COUNTER";
    let counterAmount: number | undefined;
    let reasoning: string;

    if (offeredAmount >= requiredThreshold) {
      decision = "ACCEPT";
      reasoning = `Taklif €${offeredAmount.toLocaleString()} talab chegarasidan (€${requiredThreshold.toLocaleString()}) oshadi yoki teng.`;
    } else if (offeredAmount >= marketValue * 1.15) {
      decision = "COUNTER";
      counterAmount = requiredThreshold;
      reasoning = `Taklif €${offeredAmount.toLocaleString()} muzokaraga yaraydi. Qarshi taklif: €${requiredThreshold.toLocaleString()}.`;
    } else {
      decision = "REJECT";
      reasoning = `Taklif €${offeredAmount.toLocaleString()} muzokarani boshlash chegarasidan (€${(marketValue * 1.15).toLocaleString()}) past.`;
    }

    await this.database.from("ai_decisions").insert({
      league_club_id: sellerClubId,
      action: "OFFER_RESPONSE",
      details: { clubPlayerId, playerName: player.short_name, offeredAmount, marketValue, requiredThreshold, decision, counterAmount, reasoning },
    });

    return { decision, counterAmount, reasoning };
  }

  // ──────────────────────────────────────────────────────────────
  // PUBLIC: Seed active market immediately for a fresh league
  // ──────────────────────────────────────────────────────────────
  /**
   * Immediately populates minimum listings for all AI clubs in a given league instance.
   * Call this as soon as a league transitions to ACTIVE status so the market is not empty.
   */
  async seedActiveMarket(leagueInstanceId: string): Promise<number> {
    const { data: aiClubs } = await this.database
      .from("league_clubs")
      .select("id, clubs!inner(name)")
      .eq("league_instance_id", leagueInstanceId)
      .eq("manager_type", "AI");

    if (!aiClubs || aiClubs.length === 0) return 0;

    let seeded = 0;
    try {
      await this.database.rpc("ensure_ai_market_listings", { p_league_instance_id: leagueInstanceId });
    } catch {}

    for (const aiClub of aiClubs) {
      const listed = await this.ensureMinListings(
        leagueInstanceId,
        aiClub.id,
        (aiClub.clubs as any)?.name ?? "AI Club",
        false // fresh league — no early-season star protection
      );
      seeded += listed;
    }

    this.logger.info(
      { event: "ai_market_seeded", leagueInstanceId, seeded },
      "AI market seeded for newly activated league"
    );
    return seeded;
  }

  // ──────────────────────────────────────────────────────────────
  // PUBLIC: Scheduled transfer cycle
  // ──────────────────────────────────────────────────────────────
  /**
   * Scheduled cycle (runs every 15 min):
   *   1. Ensures minimum 2 active listings per AI club in ACTIVE leagues.
   *   2. AI→Human: up to 2 AI clubs send offers to human managers.
   *   3. AI→AI: one balanced trade per cycle if viable.
   */
  async runAiTransferCycle(): Promise<{ outgoingOffers: AiOutgoingOffer[]; aiAiTransfers: number }> {
    const outgoingOffers: AiOutgoingOffer[] = [];
    let aiAiTransfers = 0;

    // Fetch all AI clubs in ACTIVE leagues
    const { data: allAiClubs } = await this.database
      .from("league_clubs")
      .select("id, league_instance_id, transfer_budget, cash_balance, clubs!inner(name), league_instances!inner(status, current_round, competition_id, competitions!inner(code))")
      .eq("manager_type", "AI")
      .eq("league_instances.status", "ACTIVE");

    if (!allAiClubs || allAiClubs.length === 0) return { outgoingOffers, aiAiTransfers };

    const uniqueLeagueInstanceIds = Array.from(new Set(allAiClubs.map((c) => c.league_instance_id)));

    // ── STEP 1: Ensure active listings per AI club across active leagues ──
    for (const instId of uniqueLeagueInstanceIds) {
      try {
        await this.database.rpc("ensure_ai_market_listings", { p_league_instance_id: instId });
      } catch {}
    }

    for (const aiClub of allAiClubs) {
      const currentRound = (aiClub as any).league_instances?.current_round ?? 0;
      const isEarlySeason = currentRound <= 2;
      await this.ensureMinListings(
        aiClub.league_instance_id,
        aiClub.id,
        (aiClub.clubs as any)?.name ?? "AI Club",
        isEarlySeason
      );
    }

    // ── STEP 2: AI -> Human offers (dynamic budget threshold by league) ──
    const buyerCandidates = allAiClubs.filter((c) => {
      const budget = Number(c.transfer_budget);
      const isUzbek = (c as any).league_instances?.competitions?.code === "UZB";
      return isUzbek ? budget >= 2_000_000 : budget >= 15_000_000;
    });

    for (const buyer of buyerCandidates.slice(0, 3)) {
      const strategy = await this.strategyService.getClubStrategy(buyer.id);
      const neededPos = (strategy.priority_positions?.[0] as string | undefined) ?? "ST";

      const { data: humanClubs } = await this.database
        .from("league_clubs")
        .select("id, manager_user_id, clubs!inner(name), users!inner(telegram_id)")
        .eq("league_instance_id", buyer.league_instance_id)
        .eq("manager_type", "HUMAN")
        .not("manager_user_id", "is", null);

      if (!humanClubs?.length) continue;

      for (const seller of humanClubs) {
        const { data: candidates } = await this.database
          .from("club_players")
          .select("id, resale_locked_until, players!inner(short_name, market_value, primary_position, player_attributes!inner(overall))")
          .eq("league_club_id", seller.id)
          .eq("players.primary_position", neededPos)
          .limit(3);

        const target = candidates?.find(
          (c) => !c.resale_locked_until || new Date(c.resale_locked_until) <= new Date()
        );
        if (!target) continue;

        const targetPlayer = first<any>(target.players) as any;
        const offerAmount = Math.round((Number(targetPlayer.market_value) * 1.25) / 100_000) * 100_000;

        if (offerAmount <= Number(buyer.transfer_budget)) {
          const { data: newOffer, error: insErr } = await this.database
            .from("transfer_offers")
            .insert({
              buyer_club_id: buyer.id,
              seller_club_id: seller.id,
              club_player_id: target.id,
              amount: offerAmount,
              status: "PENDING",
            })
            .select("id")
            .single();

          if (!insErr && newOffer) {
            await this.database
              .from("league_clubs")
              .update({ reserved_transfer_budget: offerAmount })
              .eq("id", buyer.id);

            const sellerUsers = first<any>(seller.users) as any;
            outgoingOffers.push({
              offerId: newOffer.id,
              sellerTelegramId: sellerUsers?.telegram_id ?? null,
              buyerClubName: (first<any>(buyer.clubs) as any)?.name ?? "AI Club",
              sellerClubName: (first<any>(seller.clubs) as any)?.name ?? "Human Club",
              playerName: targetPlayer.short_name,
              amount: offerAmount,
            });

            await this.database.from("ai_decisions").insert({
              league_club_id: buyer.id,
              action: "AI_BUY",
              details: {
                targetPlayerName: targetPlayer.short_name,
                sellerClubName: (first<any>(seller.clubs) as any)?.name,
                offerAmount,
              },
            });

            break; // One offer per buyer per cycle
          }
        }
      }
    }

    // ── STEP 3: AI -> AI balanced trade (one per cycle) ──────────
    if (allAiClubs.length >= 2) {
      const buyer = allAiClubs[allAiClubs.length - 1]!;
      const seller = allAiClubs[0]!;
      const isUzbek = (buyer as any).league_instances?.competitions?.code === "UZB";
      const minTradeBudget = isUzbek ? 2_500_000 : 25_000_000;

      if (buyer.id !== seller.id && Number(buyer.transfer_budget) >= minTradeBudget) {
        const { data: surplus } = await this.database
          .from("club_players")
          .select("id, players!inner(short_name, market_value, player_attributes!inner(overall))")
          .eq("league_club_id", seller.id)
          .limit(5);

        const target = surplus?.[0];
        if (target) {
          const playerData = first<any>(target.players) as any;
          const fee = Math.round((Number(playerData.market_value) * 1.2) / 100_000) * 100_000;
          if (fee <= Number(buyer.transfer_budget)) {
            const { data: offer } = await this.database
              .from("transfer_offers")
              .insert({
                buyer_club_id: buyer.id,
                seller_club_id: seller.id,
                club_player_id: target.id,
                amount: fee,
                status: "PENDING",
              })
              .select("id")
              .single();

            if (offer) {
              const { error: settleErr } = await this.database.rpc("settle_transfer", {
                p_offer_id: offer.id,
              });

              if (!settleErr) {
                aiAiTransfers++;
                await this.database.from("ai_decisions").insert({
                  league_club_id: buyer.id,
                  action: "AI_BUY",
                  details: { type: "AI_TO_AI", sellerClubId: seller.id, clubPlayerId: target.id, amount: fee },
                });
              }
            }
          }
        }
      }
    }

    // ── STEP 4: AI buys from market listings in each active league instance ──
    for (const instId of uniqueLeagueInstanceIds) {
      try {
        const { data: boughtCount } = await this.database.rpc("ai_market_buy_cycle", { p_league_instance_id: instId });
        if (boughtCount) {
          aiAiTransfers += Number(boughtCount);
        }
      } catch {}
    }

    return { outgoingOffers, aiAiTransfers };
  }

  // ──────────────────────────────────────────────────────────────
  // PRIVATE: Ensure an AI club has at least MIN_AI_LISTINGS active listings
  // ──────────────────────────────────────────────────────────────
  /**
   * Adds market listings until the club has MIN_AI_LISTINGS (2) active listings.
   *
   * LOW  — bottom 35% OVR percentile, priced at 1.10x market value
   * MID  — 40-60% OVR percentile, priced at 1.15x (or 1.5x-1.8x for stars)
   *
   * Safety guards (never violated):
   *   - Sole player at any position (incl. sole GK) is NEVER listed
   *   - Squad must stay above MIN_SQUAD_SIZE (18) after listing
   *   - Stars (>=85 OVR) protected during early season (rounds <= 2)
   *   - Cap at MAX_AI_LISTINGS (4) total active listings
   */
  private async ensureMinListings(
    leagueInstanceId: string,
    leagueClubId: string,
    clubName: string,
    isEarlySeason: boolean
  ): Promise<number> {
    const { data: existingListings } = await this.database
      .from("global_market_listings")
      .select("club_player_id, status")
      .eq("seller_club_id", leagueClubId)
      .eq("status", "ACTIVE");

    const currentListingCount = existingListings?.length ?? 0;
    if (currentListingCount >= MAX_AI_LISTINGS) return 0;

    const needed = Math.max(0, MIN_AI_LISTINGS - currentListingCount);
    if (needed === 0) return 0;

    const { data: squad } = await this.database
      .from("club_players")
      .select("id, player_id, resale_locked_until, players!inner(short_name, market_value, primary_position, player_attributes!inner(overall))")
      .eq("league_club_id", leagueClubId);

    if (!squad || squad.length <= MIN_SQUAD_SIZE) return 0; // Squad too small — guard

    const alreadyListedIds = new Set((existingListings ?? []).map((l: any) => l.club_player_id));

    // Count per position for sole-position guard
    const posCount = new Map<string, number>();
    for (const cp of squad) {
      const pos = (first<any>(cp.players) as any)?.primary_position ?? "CM";
      posCount.set(pos, (posCount.get(pos) ?? 0) + 1);
    }

    const enriched = squad.map((cp) => {
      const p = first<any>(cp.players) as any;
      const attr = first<any>(p.player_attributes) as any;
      return { cp, ovr: Number(attr?.overall ?? 70), position: p.primary_position ?? "CM" };
    });

    const sortedOvrs = enriched.map((e) => e.ovr).sort((a, b) => b - a); // descending

    const canList = (item: typeof enriched[0]): boolean => {
      if (alreadyListedIds.has(item.cp.id)) return false;
      if (item.cp.resale_locked_until && new Date(item.cp.resale_locked_until) > new Date()) return false;
      if (isEarlySeason && item.ovr >= 85) return false; // Star protection
      if ((posCount.get(item.position) ?? 0) <= 1) return false; // Sole position guard
      return true;
    };

    let listed = 0;

    // LOW: bottom 35% percentile
    const lowTarget = enriched
      .filter((item) => percentileRank(sortedOvrs, item.ovr) >= 0.65 && canList(item))
      .sort((a, b) => a.ovr - b.ovr)[0];

    if (lowTarget && listed < needed) {
      const p = first<any>(lowTarget.cp.players) as any;
      const price = Math.round((Number(p.market_value) * 1.10) / 100_000) * 100_000;
      const ok = await this.insertListing(leagueInstanceId, leagueClubId, lowTarget.cp, p, price, clubName, "LOW");
      if (ok) {
        alreadyListedIds.add(lowTarget.cp.id);
        posCount.set(lowTarget.position, (posCount.get(lowTarget.position) ?? 1) - 1);
        listed++;
      }
    }

    // MID: 40-60% percentile if still needed
    if (listed < needed) {
      const midTarget = enriched
        .filter((item) => {
          const rank = percentileRank(sortedOvrs, item.ovr);
          return rank >= 0.40 && rank <= 0.60 && canList(item);
        })
        .sort((a, b) => b.ovr - a.ovr)[0];

      if (midTarget) {
        const p = first<any>(midTarget.cp.players) as any;
        const premium = midTarget.ovr >= 85 ? (isEarlySeason ? 1.8 : 1.5) : 1.15;
        const price = Math.round((Number(p.market_value) * premium) / 100_000) * 100_000;
        const ok = await this.insertListing(leagueInstanceId, leagueClubId, midTarget.cp, p, price, clubName, "MID");
        if (ok) listed++;
      }
    }

    return listed;
  }

  // ──────────────────────────────────────────────────────────────
  // PRIVATE: Insert a single market listing and log to ai_decisions
  // ──────────────────────────────────────────────────────────────
  private async insertListing(
    leagueInstanceId: string,
    leagueClubId: string,
    cp: any,
    player: any,
    askingPrice: number,
    sellerName: string,
    listingType: "LOW" | "MID"
  ): Promise<boolean> {
    const availableUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const { data: inserted, error } = await this.database
      .from("global_market_listings")
      .insert({
        league_instance_id: leagueInstanceId,
        club_player_id: cp.id,
        player_id: cp.player_id,
        seller_club_id: leagueClubId,
        seller_name: sellerName,
        asking_price: askingPrice,
        available_until: availableUntil,
        status: "ACTIVE",
      })
      .select("id")
      .maybeSingle();

    if (error) {
      this.logger.warn(
        { event: "ai_listing_insert_failed", leagueClubId, clubPlayerId: cp.id, error },
        "Failed to create AI market listing"
      );
      return false;
    }

    if (inserted) {
      await this.database.from("ai_decisions").insert({
        league_club_id: leagueClubId,
        action: "AI_SELL",
        model: "rule-based",
        details: {
          type: "MARKET_LISTING",
          listingType,
          listingId: inserted.id,
          playerName: player.short_name,
          position: player.primary_position,
          overall: getOverall(player.player_attributes),
          askingPrice,
        },
      });
    }

    return !!inserted;
  }
}
