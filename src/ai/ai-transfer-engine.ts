import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpenAiStrategyService } from "./openai-strategy.service.js";
import type { Logger } from "../lib/logger.js";

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

  /**
   * Evaluates a transfer offer sent by a human to an AI club.
   */
  async evaluateOffer(
    sellerClubId: string,
    clubPlayerId: string,
    offeredAmount: number
  ): Promise<OfferEvaluationResult> {
    // 1. Get player attributes and club context
    const { data: cp } = await this.database
      .from("club_players")
      .select("id, league_club_id, players!inner(short_name, age, market_value, primary_position, player_attributes!inner(overall)), league_clubs!inner(cash_balance, transfer_budget)")
      .eq("id", clubPlayerId)
      .single();

    if (!cp) {
      return { decision: "REJECT", reasoning: "Player not found" };
    }

    const player = cp.players as any;
    const overall = player.player_attributes?.[0]?.overall ?? player.player_attributes?.overall ?? 75;
    const marketValue = Number(player.market_value);
    const age = Number(player.age);
    const position = player.primary_position;

    // 2. Fetch AI strategy (cached or fallback)
    const strategy = await this.strategyService.getClubStrategy(sellerClubId);

    // 3. Count squad depth at this position
    const { data: samePos } = await this.database
      .from("club_players")
      .select("id, players!inner(primary_position)")
      .eq("league_club_id", sellerClubId)
      .eq("players.primary_position", position);

    const positionCount = samePos?.length ?? 1;

    // 4. Calculate threshold
    let multiplier = 1.20;

    // Star protection
    if (overall >= 84) {
      multiplier += (overall - 83) * 0.04 * strategy.star_protection;
    }

    // Scarcity
    if (positionCount <= 1) {
      multiplier += 0.25; // Vital player, critical resistance
    } else if (positionCount === 2) {
      multiplier += 0.10;
    } else if (positionCount >= 4) {
      multiplier -= 0.05; // Surplus player, easier to sell
    }

    // Age
    if (age >= 31) {
      multiplier -= 0.08;
    } else if (age <= 22) {
      multiplier += strategy.youth_preference * 0.12;
    }

    // Sell candidate discount
    if (strategy.sell_candidates?.some((name) => player.short_name.toLowerCase().includes(name.toLowerCase()))) {
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
      reasoning = `Offered amount €${offeredAmount.toLocaleString()} meets or exceeds required threshold €${requiredThreshold.toLocaleString()}.`;
    } else if (offeredAmount >= marketValue * 1.15) {
      decision = "COUNTER";
      counterAmount = requiredThreshold;
      reasoning = `Offered amount €${offeredAmount.toLocaleString()} is viable for negotiation. Countering at €${requiredThreshold.toLocaleString()}.`;
    } else {
      decision = "REJECT";
      reasoning = `Offered amount €${offeredAmount.toLocaleString()} is below negotiation baseline €${(marketValue * 1.15).toLocaleString()}.`;
    }

    // Log decision in ai_decisions
    await this.database.from("ai_decisions").insert({
      league_club_id: sellerClubId,
      action: "OFFER_RESPONSE",
      details: {
        clubPlayerId,
        playerName: player.short_name,
        offeredAmount,
        marketValue,
        requiredThreshold,
        decision,
        counterAmount,
        reasoning,
      },
    });

    return { decision, counterAmount, reasoning };
  }

  /**
   * Scheduled cycle: AI clubs place offers on needed human players or AI-to-AI transfers.
   */
  async runAiTransferCycle(): Promise<{ outgoingOffers: AiOutgoingOffer[]; aiAiTransfers: number }> {
    const outgoingOffers: AiOutgoingOffer[] = [];
    let aiAiTransfers = 0;

    // 1. Fetch active AI clubs
    const { data: aiClubs } = await this.database
      .from("league_clubs")
      .select("id, league_instance_id, transfer_budget, cash_balance, clubs!inner(name)")
      .eq("manager_type", "AI")
      .gt("transfer_budget", 20_000_000)
      .limit(6);

    if (!aiClubs || !aiClubs.length) return { outgoingOffers, aiAiTransfers };

    // 2. For up to 2 AI clubs, seek to buy a player from a human-managed club in the same league
    for (const buyer of aiClubs.slice(0, 2)) {
      const strategy = await this.strategyService.getClubStrategy(buyer.id);
      const neededPos = strategy.priority_positions[0] ?? "ST";

      // Find human clubs in same league instance
      const { data: humanClubs } = await this.database
        .from("league_clubs")
        .select("id, manager_user_id, clubs!inner(name), users!inner(telegram_id)")
        .eq("league_instance_id", buyer.league_instance_id)
        .eq("manager_type", "HUMAN")
        .not("manager_user_id", "is", null);

      if (!humanClubs || !humanClubs.length) continue;

      for (const seller of humanClubs) {
        // Find a candidate player in seller's squad matching needed position
        const { data: candidates } = await this.database
          .from("club_players")
          .select("id, resale_locked_until, players!inner(short_name, market_value, primary_position, player_attributes!inner(overall))")
          .eq("league_club_id", seller.id)
          .eq("players.primary_position", neededPos)
          .limit(3);

        const target = candidates?.find(c => !c.resale_locked_until || new Date(c.resale_locked_until) <= new Date());
        if (!target) continue;

        const targetPlayer = target.players as any;
        const offerAmount = Math.round((Number(targetPlayer.market_value) * 1.25) / 100_000) * 100_000;

        if (offerAmount <= Number(buyer.transfer_budget)) {
          // Directly insert transfer offer:
          const { data: newOffer, error: insErr } = await this.database.from("transfer_offers").insert({
            buyer_club_id: buyer.id,
            seller_club_id: seller.id,
            club_player_id: target.id,
            amount: offerAmount,
            status: "PENDING",
          }).select("id").single();

          if (!insErr && newOffer) {
            // Reserve buyer budget
            await this.database
              .from("league_clubs")
              .update({ reserved_transfer_budget: offerAmount })
              .eq("id", buyer.id);

            outgoingOffers.push({
              offerId: newOffer.id,
              sellerTelegramId: (seller.users as any)?.telegram_id ?? null,
              buyerClubName: (buyer.clubs as any)?.name ?? "AI Club",
              sellerClubName: (seller.clubs as any)?.name ?? "Human Club",
              playerName: targetPlayer.short_name,
              amount: offerAmount,
            });

            await this.database.from("ai_decisions").insert({
              league_club_id: buyer.id,
              action: "AI_BUY",
              details: {
                targetPlayerName: targetPlayer.short_name,
                sellerClubName: (seller.clubs as any)?.name,
                offerAmount,
              },
            });

            break; // One offer per buyer club
          }
        }
      }
    }

    // 3. Optional AI -> AI Transfer (1 balanced trade if feasible)
    if (aiClubs.length >= 2) {
      const buyer = aiClubs[aiClubs.length - 1]!;
      const seller = aiClubs[0]!;

      if (buyer.id !== seller.id && Number(buyer.transfer_budget) > 30_000_000) {
        // Find an AI surplus player in seller club
        const { data: surplus } = await this.database
          .from("club_players")
          .select("id, players!inner(short_name, market_value, player_attributes!inner(overall))")
          .eq("league_club_id", seller.id)
          .limit(5);

        const target = surplus?.[0];
        if (target) {
          const fee = Math.round((Number((target.players as any).market_value) * 1.2) / 100_000) * 100_000;
          if (fee <= Number(buyer.transfer_budget)) {
            const { data: offer } = await this.database.from("transfer_offers").insert({
              buyer_club_id: buyer.id,
              seller_club_id: seller.id,
              club_player_id: target.id,
              amount: fee,
              status: "PENDING",
            }).select("id").single();

            if (offer) {
              const { error: settleErr } = await this.database.rpc("settle_transfer", {
                p_offer_id: offer.id,
              });

              if (!settleErr) {
                aiAiTransfers++;
                await this.database.from("ai_decisions").insert({
                  league_club_id: buyer.id,
                  action: "AI_BUY",
                  details: {
                    type: "AI_TO_AI",
                    sellerClubId: seller.id,
                    clubPlayerId: target.id,
                    amount: fee,
                  },
                });
              }
            }
          }
        }
      }
    }

    return { outgoingOffers, aiAiTransfers };
  }
}
