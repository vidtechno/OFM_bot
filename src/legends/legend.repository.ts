import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClubLegendSummary,
  LegendCategory,
  LegendFulfillmentResult,
  LegendListingItem,
  LegendPlayer,
  LegendPurchaseIntent,
} from "./legend.types.js";

export class LegendRepository {
  constructor(private readonly database: SupabaseClient) {}

  async getClubSummary(userId: string, clubId: string): Promise<ClubLegendSummary> {
    const { data: club, error: clubErr } = await this.database
      .from("league_clubs")
      .select("id, league_instance_id, manager_user_id, manager_type, clubs!inner(name), league_instances!inner(id, status, instance_number, competitions!inner(name))")
      .eq("id", clubId)
      .maybeSingle();

    if (clubErr || !club) {
      throw new Error(`CLUB_NOT_FOUND: ${clubErr?.message ?? "Club not found"}`);
    }

    const leagueInst = club.league_instances as any;
    const compName = leagueInst?.competitions?.name ?? "OFM League";
    const instNum = String(leagueInst?.instance_number ?? 1).padStart(4, "0");
    const leagueName = `${compName} #${instNum}`;

    const { data: owned, error: ownedErr } = await this.database
      .from("league_legend_players")
      .select("legend_id, club_player_id, legend_players!inner(name, display_name, primary_position, overall, tier)")
      .eq("league_club_id", clubId)
      .eq("status", "ACTIVE");

    if (ownedErr) {
      throw new Error(`FAILED_FETCH_OWNED_LEGENDS: ${ownedErr.message}`);
    }

    const legends = (owned ?? []).map((row: any) => ({
      legendId: row.legend_id,
      clubPlayerId: row.club_player_id,
      name: row.legend_players.name,
      displayName: row.legend_players.display_name,
      primaryPosition: row.legend_players.primary_position,
      overall: row.legend_players.overall,
      tier: row.legend_players.tier,
    }));

    return {
      clubName: (club.clubs as any)?.name ?? "Klub",
      leagueName,
      leagueInstanceId: club.league_instance_id,
      leagueClubId: club.id,
      leagueStatus: leagueInst?.status ?? "OPEN",
      currentLegendCount: legends.length,
      maxLegends: 5,
      legends,
    };
  }

  async getCategoryLegends(
    userId: string,
    clubId: string,
    category: LegendCategory,
    page = 0,
    pageSize = 6
  ): Promise<{ items: LegendListingItem[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const summary = await this.getClubSummary(userId, clubId);

    // Fetch all active legends in category
    const { data: legends, error: legErr } = await this.database
      .from("legend_players")
      .select("*")
      .eq("category", category)
      .eq("active", true)
      .order("overall", { ascending: false });

    if (legErr || !legends) {
      throw new Error(`FAILED_FETCH_LEGENDS: ${legErr?.message ?? "Error"}`);
    }

    // Fetch all assignments in this league instance
    const { data: leagueAssignments, error: assignErr } = await this.database
      .from("league_legend_players")
      .select("legend_id, league_club_id, league_clubs!inner(clubs!inner(name))")
      .eq("league_instance_id", summary.leagueInstanceId)
      .eq("status", "ACTIVE");

    if (assignErr) {
      throw new Error(`FAILED_FETCH_LEAGUE_ASSIGNMENTS: ${assignErr.message}`);
    }

    const assignmentMap = new Map<string, { clubId: string; clubName: string }>();
    for (const a of leagueAssignments ?? []) {
      const cName = (a.league_clubs as any)?.clubs?.name ?? "Boshqa klub";
      assignmentMap.set(a.legend_id, { clubId: a.league_club_id, clubName: cName });
    }

    const items: LegendListingItem[] = legends.map((raw: any) => {
      const legend: LegendPlayer = {
        id: raw.id,
        slug: raw.slug,
        name: raw.name,
        displayName: raw.display_name,
        category: raw.category,
        primaryPosition: raw.primary_position,
        secondaryPositions: raw.secondary_positions ?? [],
        overall: raw.overall,
        pace: raw.pace,
        shooting: raw.shooting,
        passing: raw.passing,
        dribbling: raw.dribbling,
        defending: raw.defending,
        physical: raw.physical,
        tier: raw.tier,
        starsPrice: raw.stars_price,
        active: raw.active,
        cardMetadata: raw.card_metadata ?? {},
      };

      const assignment = assignmentMap.get(raw.id);
      let status: LegendListingItem["status"] = "AVAILABLE";
      let isOwnedByMe = false;
      let ownerClubName: string | undefined;

      if (assignment) {
        if (assignment.clubId === clubId) {
          status = "OWNED_BY_CURRENT_CLUB";
          isOwnedByMe = true;
          ownerClubName = summary.clubName;
        } else {
          status = "OWNED_BY_OTHER_CLUB";
          ownerClubName = assignment.clubName;
        }
      } else if (summary.currentLegendCount >= summary.maxLegends) {
        status = "CLUB_LIMIT_REACHED";
      } else if (summary.leagueStatus !== "ACTIVE") {
        status = "LEAGUE_NOT_ACTIVE";
      }

      return {
        legend,
        status,
        ownerClubName,
        isOwnedByMe,
      };
    });

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const paginated = items.slice(safePage * pageSize, (safePage + 1) * pageSize);

    return {
      items: paginated,
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  }

  async getLegendDetail(
    userId: string,
    clubId: string,
    legendId: string
  ): Promise<{ item: LegendListingItem; summary: ClubLegendSummary }> {
    const summary = await this.getClubSummary(userId, clubId);

    const { data: raw, error } = await this.database
      .from("legend_players")
      .select("*")
      .eq("id", legendId)
      .maybeSingle();

    if (error || !raw) {
      throw new Error(`LEGEND_NOT_FOUND: ${error?.message ?? "Legend not found"}`);
    }

    const { data: assignment } = await this.database
      .from("league_legend_players")
      .select("league_club_id, league_clubs!inner(clubs!inner(name))")
      .eq("league_instance_id", summary.leagueInstanceId)
      .eq("legend_id", legendId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    const legend: LegendPlayer = {
      id: raw.id,
      slug: raw.slug,
      name: raw.name,
      displayName: raw.display_name,
      category: raw.category,
      primaryPosition: raw.primary_position,
      secondaryPositions: raw.secondary_positions ?? [],
      overall: raw.overall,
      pace: raw.pace,
      shooting: raw.shooting,
      passing: raw.passing,
      dribbling: raw.dribbling,
      defending: raw.defending,
      physical: raw.physical,
      tier: raw.tier,
      starsPrice: raw.stars_price,
      active: raw.active,
      cardMetadata: raw.card_metadata ?? {},
    };

    let status: LegendListingItem["status"] = "AVAILABLE";
    let isOwnedByMe = false;
    let ownerClubName: string | undefined;

    if (assignment) {
      const cName = (assignment.league_clubs as any)?.clubs?.name ?? "Boshqa klub";
      if (assignment.league_club_id === clubId) {
        status = "OWNED_BY_CURRENT_CLUB";
        isOwnedByMe = true;
        ownerClubName = summary.clubName;
      } else {
        status = "OWNED_BY_OTHER_CLUB";
        ownerClubName = cName;
      }
    } else if (summary.currentLegendCount >= summary.maxLegends) {
      status = "CLUB_LIMIT_REACHED";
    } else if (summary.leagueStatus !== "ACTIVE") {
      status = "LEAGUE_NOT_ACTIVE";
    }

    return {
      item: {
        legend,
        status,
        ownerClubName,
        isOwnedByMe,
      },
      summary,
    };
  }

  async createPurchaseIntent(
    userId: string,
    clubId: string,
    legendId: string
  ): Promise<LegendPurchaseIntent> {
    const { data, error } = await this.database.rpc("create_legend_purchase_intent", {
      p_user_id: userId,
      p_league_club_id: clubId,
      p_legend_id: legendId,
    });

    if (error) {
      throw new Error(error.message);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("FAILED_CREATE_PURCHASE_INTENT");

    return {
      purchaseId: row.purchase_id,
      starsAmount: row.stars_amount,
      legendName: row.legend_name,
      legendPos: row.legend_pos,
      legendOvr: row.legend_ovr,
      clubName: row.club_name,
      leagueInstanceId: row.league_instance_id,
    };
  }

  async validatePreCheckout(
    purchaseId: string,
    userId: string,
    starsAmount: number
  ): Promise<boolean> {
    const { data, error } = await this.database.rpc("validate_legend_precheckout", {
      p_purchase_id: purchaseId,
      p_user_id: userId,
      p_stars_amount: starsAmount,
    });

    if (error) return false;
    return Boolean(data);
  }

  async fulfillPurchase(
    purchaseId: string,
    telegramPaymentChargeId: string,
    providerPaymentChargeId?: string
  ): Promise<LegendFulfillmentResult> {
    const { data, error } = await this.database.rpc("fulfill_legend_purchase", {
      p_purchase_id: purchaseId,
      p_telegram_payment_charge_id: telegramPaymentChargeId,
      p_provider_payment_charge_id: providerPaymentChargeId ?? null,
    });

    if (error) {
      throw new Error(error.message);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("FAILED_FULFILL_PURCHASE");

    return {
      clubPlayerId: row.club_player_id,
      legendName: row.legend_name,
      legendPos: row.legend_pos,
      legendOvr: row.legend_ovr,
      clubName: row.club_name,
      leagueInstanceId: row.league_instance_id,
    };
  }

  async recordRefund(purchaseId: string): Promise<boolean> {
    const { data, error } = await this.database.rpc("record_legend_refund", {
      p_purchase_id: purchaseId,
    });

    if (error) return false;
    return Boolean(data);
  }

  async getPurchase(purchaseId: string): Promise<any> {
    const { data } = await this.database
      .from("legend_purchases")
      .select("*, legend_players(*)")
      .eq("id", purchaseId)
      .maybeSingle();
    return data;
  }
}
