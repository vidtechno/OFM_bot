import type { SupabaseClient } from "@supabase/supabase-js";

const one = <T>(value: T | T[]): T => (Array.isArray(value) ? (value[0] as T) : value);

export interface MarketPlayer {
  listingId: string;
  name: string;
  age: number;
  position: string;
  overall: number;
  askingPrice: number;
  availableUntil: string;
  sellerName?: string;
  sellerClubId?: string | null;
  clubPlayerId?: string | null;
  isOwnListing?: boolean;
}

export interface LeagueTransferClub {
  leagueClubId: string;
  clubName: string;
}

export interface OfferOutcome {
  offerId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "COUNTERED";
  counterAmount: number | null;
}

export interface TransferTarget {
  clubPlayerId: string;
  name: string;
  clubName: string;
  targetClubId?: string;
  leagueInstanceId?: string;
  position: string;
  overall: number;
  marketValue: number;
  age?: number;
  nationality?: string;
  isStarting?: boolean;
  isListed?: boolean;
  listingId?: string;
}

export interface IncomingOffer {
  offerId: string;
  buyerClub: string;
  playerName: string;
  position: string;
  overall: number;
  amount: number;
  expiresAt: string;
}

export interface TransferNotification {
  offerId: string;
  playerName: string;
  amount: number;
  buyerClub: string;
  sellerClub: string;
  buyerClubId: string;
  sellerClubId: string;
  buyerTelegramId: number | null;
  sellerTelegramId: number | null;
  counterAmount: number | null;
}

export interface TransferHistoryItem {
  id: string;
  type: "INCOMING" | "OUTGOING";
  playerName: string;
  fromClub: string;
  toClub: string;
  fee: number;
  date: string;
}

export class TransferRepository {
  constructor(public readonly database: SupabaseClient) {}

  /**
   * Resolves the manager's club in the same league instance as the target club.
   */
  async buyerClubForTarget(userId: string, targetClubId: string): Promise<string | null> {
    const { data, error } = await this.database
      .from("league_clubs")
      .select("league_instance_id")
      .eq("id", targetClubId)
      .maybeSingle();

    if (error || !data) return null;
    const { data: buyer, error: buyerError } = await this.database
      .from("league_clubs")
      .select("id")
      .eq("league_instance_id", data.league_instance_id)
      .eq("manager_user_id", userId)
      .maybeSingle();

    if (buyerError || !buyer) return null;
    return buyer.id;
  }

  /**
   * Resolves the manager's club in the same league instance as the player.
   */
  async buyerClubForPlayer(userId: string, clubPlayerId: string): Promise<string | null> {
    const { data, error } = await this.database
      .from("club_players")
      .select("league_club_id, league_clubs!inner(league_instance_id)")
      .eq("id", clubPlayerId)
      .maybeSingle();

    if (error || !data) return null;
    const instanceId = one<any>(data.league_clubs).league_instance_id;
    const { data: buyer, error: buyerError } = await this.database
      .from("league_clubs")
      .select("id")
      .eq("league_instance_id", instanceId)
      .eq("manager_user_id", userId)
      .maybeSingle();

    if (buyerError || !buyer) return null;
    return buyer.id;
  }

  /**
   * Fetches Global Transfer Market listings (external top stars).
   * Returns up to `pageSize` active players, optionally filtered by position group.
   */
  async market(
    userId: string,
    clubId: string,
    page = 0,
    pageSize = 8,
    positionGroup = "ALL"
  ): Promise<MarketPlayer[]> {
    const owner = await this.ownerLeague(userId, clubId);

    // Fetch player_ids already in this league instance so they are not offered again
    const { data: existingCp } = await this.database
      .from("club_players")
      .select("player_id, league_clubs!inner(league_instance_id)")
      .eq("league_clubs.league_instance_id", owner.league_instance_id);

    const existingPlayerSet = new Set(
      (existingCp ?? [])
        .map((cp: any) => cp.player_id)
        .filter(Boolean)
    );

    let query = this.database
      .from("global_market_listings")
      .select(
        "id, asking_price, available_until, seller_name, player_id, players!inner(short_name, age, primary_position, player_attributes!inner(overall))"
      )
      .eq("status", "ACTIVE")
      .is("club_player_id", null)
      .gt("available_until", new Date().toISOString())
      .order("asking_price", { ascending: false });

    if (positionGroup !== "ALL") {
      const posMap: Record<string, string[]> = {
        GK: ["GK"],
        DEF: ["CB", "LB", "RB", "RWB", "LWB"],
        MID: ["CM", "CDM", "CAM", "LM", "RM"],
        ATT: ["ST", "CF", "RW", "LW"],
      };
      const allowed = posMap[positionGroup];
      if (allowed) {
        query = query.in("players.primary_position", allowed);
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    const filtered = (data ?? []).filter((row: any) => !existingPlayerSet.has(row.player_id));
    const from = page * pageSize;
    const paged = filtered.slice(from, from + pageSize);

    return paged.map((row: any) => {
      const player = one<any>(row.players);
      return {
        listingId: row.id,
        name: player.short_name,
        age: player.age,
        position: player.primary_position,
        overall: one<any>(player.player_attributes)?.overall ?? 75,
        askingPrice: Number(row.asking_price),
        availableUntil: row.available_until,
        sellerName: row.seller_name ?? "Global Market",
      };
    });
  }

  /**
   * Fetches In-League Transfer Market listings (players listed for sale by clubs in the same league).
   */
  async leagueMarket(
    userId: string,
    clubId: string,
    page = 0,
    pageSize = 8,
    positionGroup = "ALL"
  ): Promise<MarketPlayer[]> {
    const owner = await this.ownerLeague(userId, clubId);

    let query = this.database
      .from("global_market_listings")
      .select(
        "id, asking_price, available_until, seller_name, seller_club_id, club_player_id, players!inner(short_name, age, primary_position, player_attributes!inner(overall)), seller_club:league_clubs!seller_club_id!inner(league_instance_id)"
      )
      .eq("status", "ACTIVE")
      .not("club_player_id", "is", null)
      .eq("seller_club.league_instance_id", owner.league_instance_id)
      .gt("available_until", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (positionGroup !== "ALL") {
      const posMap: Record<string, string[]> = {
        GK: ["GK"],
        DEF: ["CB", "LB", "RB", "RWB", "LWB"],
        MID: ["CM", "CDM", "CAM", "LM", "RM"],
        ATT: ["ST", "CF", "RW", "LW"],
      };
      const allowed = posMap[positionGroup];
      if (allowed) {
        query = query.in("players.primary_position", allowed);
      }
    }

    const from = page * pageSize;
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;

    return (data ?? []).map((row: any) => {
      const player = one<any>(row.players);
      return {
        listingId: row.id,
        name: player.short_name,
        age: player.age,
        position: player.primary_position,
        overall: one<any>(player.player_attributes)?.overall ?? 75,
        askingPrice: Number(row.asking_price),
        availableUntil: row.available_until,
        sellerName: row.seller_name ?? "Liga klubi",
        sellerClubId: row.seller_club_id,
        clubPlayerId: row.club_player_id,
        isOwnListing: row.seller_club_id === clubId,
      };
    });
  }

  /**
   * Fetches full profile for a single market listing (either global or in-league).
   */
  async listing(userId: string, clubId: string, listingId: string): Promise<MarketPlayer | null> {
    await this.ownerLeague(userId, clubId);
    const { data, error } = await this.database
      .from("global_market_listings")
      .select(
        "id, asking_price, available_until, seller_name, seller_club_id, club_player_id, players!inner(short_name, age, primary_position, player_attributes!inner(overall))"
      )
      .eq("id", listingId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error || !data) return null;
    const player = one<any>(data.players);
    return {
      listingId: data.id,
      name: player.short_name,
      age: player.age,
      position: player.primary_position,
      overall: one<any>(player.player_attributes)?.overall ?? 75,
      askingPrice: Number(data.asking_price),
      availableUntil: data.available_until,
      sellerName: data.seller_name ?? "Global Market",
      sellerClubId: data.seller_club_id,
      clubPlayerId: data.club_player_id,
      isOwnListing: data.seller_club_id === clubId,
    };
  }

  /**
   * Purchases a player listing (global star or in-league player) atomically via RPC.
   */
  async buy(
    userId: string,
    buyerClubId: string,
    listingId: string
  ): Promise<{ status: "ACCEPTED" | "REJECTED" | "COUNTERED"; counterAmount?: number }> {
    const { error } = await this.database.rpc("buy_global_player", {
      p_user_id: userId,
      p_buyer_club_id: buyerClubId,
      p_listing_id: listingId,
    });

    if (error) {
      throw new Error(error.message ?? "TRANSFER_FAILED");
    }

    return { status: "ACCEPTED" };
  }

  /**
   * Lists players owned by the club that can be put up for sale.
   * Includes starting XI flag and active listing information.
   */
  async saleCandidates(
    userId: string,
    clubId: string
  ): Promise<(TransferTarget & { isStarting: boolean; isListed: boolean; listingId?: string })[]> {
    await this.ownerLeague(userId, clubId);
    const [{ data, error }, { data: activeListings, error: listingsError }] = await Promise.all([
      this.database
        .from("club_players")
        .select(
          "id, resale_locked_until, is_starting, players!inner(short_name, primary_position, market_value, age, nationality, player_attributes!inner(overall)), league_clubs!inner(league_instance_id, clubs!inner(name))"
        )
        .eq("league_club_id", clubId),
      this.database
        .from("global_market_listings")
        .select("id, club_player_id")
        .eq("seller_club_id", clubId)
        .eq("status", "ACTIVE"),
    ]);

    if (error) throw error;
    if (listingsError) throw listingsError;

    const listedMap = new Map((activeListings ?? []).map((l: any) => [l.club_player_id, l.id]));
    const now = new Date();

    return (data ?? [])
      .filter((row: any) => !row.resale_locked_until || new Date(row.resale_locked_until) <= now)
      .map((row: any) => {
        const player = one<any>(row.players);
        const leagueClub = one<any>(row.league_clubs);
        const club = one<any>(leagueClub.clubs);
        const listingId = listedMap.get(row.id);
        return {
          clubPlayerId: row.id,
          name: player.short_name,
          clubName: club.name,
          targetClubId: clubId,
          leagueInstanceId: leagueClub.league_instance_id,
          position: player.primary_position,
          overall: one<any>(player.player_attributes)?.overall ?? 75,
          marketValue: Number(player.market_value),
          age: player.age,
          nationality: player.nationality,
          isStarting: Boolean(row.is_starting),
          isListed: Boolean(listingId),
          listingId: listingId ?? undefined,
        };
      })
      .sort((a, b) => b.overall - a.overall);
  }

  /**
   * Lists opponent clubs within the EXACT SAME league instance.
   */
  async leagueClubs(userId: string, clubId: string): Promise<LeagueTransferClub[]> {
    const owner = await this.ownerLeague(userId, clubId);
    const { data, error } = await this.database
      .from("league_clubs")
      .select("id, clubs!inner(name)")
      .eq("league_instance_id", owner.league_instance_id)
      .neq("id", clubId)
      .order("clubs(name)");

    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      leagueClubId: row.id,
      clubName: one<any>(row.clubs).name,
    }));
  }

  /**
   * Fetches players of an opponent club in the same league instance.
   */
  async clubTargets(
    userId: string,
    buyerClubId: string,
    targetClubId: string,
    page = 0,
    pageSize = 20
  ): Promise<TransferTarget[]> {
    const owner = await this.ownerLeague(userId, buyerClubId);
    if (targetClubId === buyerClubId) throw new Error("OWN_CLUB");

    const { data: target, error: targetError } = await this.database
      .from("league_clubs")
      .select("id, league_instance_id, clubs!inner(name)")
      .eq("id", targetClubId)
      .maybeSingle();

    if (targetError || !target || target.league_instance_id !== owner.league_instance_id) {
      throw new Error("TARGET_CLUB_INVALID");
    }

    const from = page * pageSize;
    const { data, error } = await this.database
      .from("club_players")
      .select(
        "id, resale_locked_until, players!inner(short_name, primary_position, market_value, age, nationality, player_attributes!inner(overall))"
      )
      .eq("league_club_id", targetClubId)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const clubName = one<any>((target as any).clubs).name;

    return (data ?? [])
      .filter((row: any) => !row.resale_locked_until || new Date(row.resale_locked_until) <= new Date())
      .map((row: any) => {
        const player = one<any>(row.players);
        return {
          clubPlayerId: row.id,
          name: player.short_name,
          clubName,
          targetClubId,
          position: player.primary_position,
          overall: one<any>(player.player_attributes).overall,
          marketValue: Number(player.market_value),
          age: player.age,
          nationality: player.nationality,
        };
      })
      .sort((a, b) => b.overall - a.overall);
  }

  /**
   * Fetches full profile for a single target player by clubPlayerId.
   */
  async targetPlayer(clubPlayerId: string): Promise<TransferTarget | null> {
    const { data, error } = await this.database
      .from("club_players")
      .select(
        "id, league_club_id, players!inner(short_name, primary_position, market_value, age, nationality, player_attributes!inner(overall)), league_clubs!inner(league_instance_id, clubs!inner(name))"
      )
      .eq("id", clubPlayerId)
      .maybeSingle();

    if (error || !data) return null;
    const player = one<any>(data.players);
    const leagueClub = one<any>(data.league_clubs);
    const club = one<any>(leagueClub.clubs);
    return {
      clubPlayerId: data.id,
      name: player.short_name,
      clubName: club.name,
      targetClubId: data.league_club_id,
      leagueInstanceId: leagueClub.league_instance_id,
      position: player.primary_position,
      overall: one<any>(player.player_attributes).overall,
      marketValue: Number(player.market_value),
      age: player.age,
      nationality: player.nationality,
    };
  }

  async listForSale(userId: string, clubId: string, clubPlayerId: string, askingPrice: number): Promise<void> {
    const candidates = await this.saleCandidates(userId, clubId);
    const candidate = candidates.find((player) => player.clubPlayerId === clubPlayerId);
    if (!candidate) {
      throw new Error("PLAYER_NOT_AVAILABLE");
    }
    const { count, error: countError } = await this.database
      .from("club_players")
      .select("id", { count: "exact", head: true })
      .eq("league_club_id", clubId);

    if (countError) throw countError;
    if ((count ?? 0) <= 18) throw new Error("SELLER_MIN_SQUAD");

    const { data: cp, error: cpError } = await this.database
      .from("club_players")
      .select("player_id, league_clubs!inner(clubs!inner(name))")
      .eq("id", clubPlayerId)
      .single();

    if (cpError || !cp) throw new Error("PLAYER_NOT_FOUND");
    const sellerClubName = one<any>(cp.league_clubs)?.clubs?.name ?? "Klub";

    const availableUntil = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const { error } = await this.database.from("global_market_listings").insert({
      club_player_id: clubPlayerId,
      player_id: cp.player_id,
      seller_club_id: clubId,
      seller_name: sellerClubName,
      asking_price: askingPrice,
      available_until: availableUntil,
      status: "ACTIVE",
    });
    if (error) throw error;
  }

  /**
   * Delists an active player listing owned by the club.
   */
  async delist(userId: string, clubId: string, listingId: string): Promise<void> {
    await this.ownerLeague(userId, clubId);
    const { data: listing, error: findError } = await this.database
      .from("global_market_listings")
      .select("id, seller_club_id, status")
      .eq("id", listingId)
      .eq("seller_club_id", clubId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (findError || !listing) {
      throw new Error("LISTING_NOT_FOUND");
    }

    const { error } = await this.database
      .from("global_market_listings")
      .update({ status: "CANCELLED" })
      .eq("id", listingId);

    if (error) throw error;
  }

  /**
   * Submits an offer for a player in the same league.
   */
  async offer(userId: string, buyerClubId: string, clubPlayerId: string, amount: number): Promise<OfferOutcome> {
    const { data, error } = await this.database.rpc("create_transfer_offer", {
      p_user_id: userId,
      p_buyer_club_id: buyerClubId,
      p_club_player_id: clubPlayerId,
      p_amount: amount,
    });
    if (error) throw error;
    const result = data?.[0];
    return {
      offerId: result.offer_id,
      status: result.status,
      counterAmount: result.counter_amount ? Number(result.counter_amount) : null,
    };
  }

  async incomingOffers(userId: string, clubId: string): Promise<IncomingOffer[]> {
    const { data: club, error: clubError } = await this.database
      .from("league_clubs")
      .select("id")
      .eq("id", clubId)
      .eq("manager_user_id", userId)
      .maybeSingle();

    if (clubError || !club) throw new Error("CLUB_NOT_OWNED");

    const { data, error } = await this.database
      .from("transfer_offers")
      .select("id, buyer_club_id, club_player_id, amount, expires_at")
      .eq("seller_club_id", clubId)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });

    if (error) throw error;
    const offers = data ?? [];
    if (!offers.length) return [];

    const playerIds = offers.map((row: any) => row.club_player_id);
    const buyerIds = offers.map((row: any) => row.buyer_club_id);

    const [playersResult, buyersResult] = await Promise.all([
      this.database
        .from("club_players")
        .select("id, players!inner(short_name, primary_position, player_attributes!inner(overall))")
        .in("id", playerIds),
      this.database.from("league_clubs").select("id, clubs!inner(name)").in("id", buyerIds),
    ]);

    if (playersResult.error) throw playersResult.error;
    if (buyersResult.error) throw buyersResult.error;

    const players = new Map(
      (playersResult.data ?? []).map((row: any) => {
        const p = one<any>(row.players);
        return [row.id, p];
      })
    );
    const buyers = new Map(
      (buyersResult.data ?? []).map((row: any) => [row.id, one<any>(row.clubs).name])
    );

    return offers.map((row: any) => {
      const p = players.get(row.club_player_id);
      return {
        offerId: row.id,
        buyerClub: buyers.get(row.buyer_club_id) ?? "Noma’lum klub",
        playerName: p?.short_name ?? "Futbolchi",
        position: p?.primary_position ?? "",
        overall: p ? one<any>(p.player_attributes).overall : 0,
        amount: Number(row.amount),
        expiresAt: row.expires_at,
      };
    });
  }

  async respondToOffer(userId: string, offerId: string, decision: "ACCEPT" | "REJECT"): Promise<string> {
    const { data, error } = await this.database.rpc("respond_transfer_offer", {
      p_user_id: userId,
      p_offer_id: offerId,
      p_decision: decision,
      p_counter: null,
    });
    if (error) throw error;
    return String(data);
  }

  async counterOffer(userId: string, offerId: string, amount: number): Promise<string> {
    const { data, error } = await this.database.rpc("respond_transfer_offer", {
      p_user_id: userId,
      p_offer_id: offerId,
      p_decision: "COUNTER",
      p_counter: amount,
    });
    if (error) throw error;
    return String(data);
  }

  async acceptCounterOffer(userId: string, offerId: string): Promise<void> {
    const { error } = await this.database.rpc("accept_counter_offer", {
      p_user_id: userId,
      p_offer_id: offerId,
    });
    if (error) throw error;
  }

  async notification(offerId: string): Promise<TransferNotification | null> {
    const { data: offer, error } = await this.database
      .from("transfer_offers")
      .select("id, buyer_club_id, seller_club_id, club_player_id, amount, counter_amount")
      .eq("id", offerId)
      .maybeSingle();

    if (error || !offer) return null;

    const [clubsResult, playerResult] = await Promise.all([
      this.database
        .from("league_clubs")
        .select("id, manager_user_id, clubs!inner(name)")
        .in("id", [offer.buyer_club_id, offer.seller_club_id]),
      this.database.from("club_players").select("players!inner(short_name)").eq("id", offer.club_player_id).maybeSingle(),
    ]);

    if (clubsResult.error) throw clubsResult.error;
    if (playerResult.error) throw playerResult.error;

    const clubs = new Map(
      (clubsResult.data ?? []).map((row: any) => [
        row.id,
        { name: one<any>(row.clubs).name, userId: row.manager_user_id },
      ])
    );
    const ids = [...new Set([...clubs.values()].map((c) => c.userId).filter(Boolean))];
    const { data: people, error: peopleError } = ids.length
      ? await this.database.from("users").select("id, telegram_id").in("id", ids)
      : { data: [], error: null };

    if (peopleError) throw peopleError;
    const telegram = new Map((people ?? []).map((row: any) => [row.id, row.telegram_id]));
    const buyer = clubs.get(offer.buyer_club_id);
    const seller = clubs.get(offer.seller_club_id);

    return {
      offerId: offer.id,
      playerName: one<any>((playerResult.data as any)?.players).short_name,
      amount: Number(offer.amount),
      counterAmount: offer.counter_amount ? Number(offer.counter_amount) : null,
      buyerClub: buyer?.name ?? "Klub",
      sellerClub: seller?.name ?? "Klub",
      buyerClubId: offer.buyer_club_id,
      sellerClubId: offer.seller_club_id,
      buyerTelegramId: buyer?.userId ? telegram.get(buyer.userId) ?? null : null,
      sellerTelegramId: seller?.userId ? telegram.get(seller.userId) ?? null : null,
    };
  }

  /**
   * Fetches incoming and outgoing transfer history for a club.
   */
  async transferHistory(clubId: string): Promise<TransferHistoryItem[]> {
    const { data, error } = await this.database
      .from("transfer_offers")
      .select(
        "id, amount, responded_at, buyer_club_id, seller_club_id, club_players!inner(players!inner(short_name)), buyer:league_clubs!buyer_club_id(clubs!inner(name)), seller:league_clubs!seller_club_id(clubs!inner(name))"
      )
      .eq("status", "ACCEPTED")
      .or(`buyer_club_id.eq.${clubId},seller_club_id.eq.${clubId}`)
      .order("responded_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    return (data ?? []).map((row: any) => {
      const isBuyer = row.buyer_club_id === clubId;
      const player = one<any>(row.club_players).players;
      const buyerName = one<any>(row.buyer).clubs.name;
      const sellerName = one<any>(row.seller).clubs.name;

      return {
        id: row.id,
        type: isBuyer ? "INCOMING" : "OUTGOING",
        playerName: player.short_name,
        fromClub: sellerName,
        toClub: buyerName,
        fee: Number(row.amount),
        date: row.responded_at,
      };
    });
  }

  /**
   * Database-backed session storage for custom user inputs (avoids in-memory Maps in serverless edge functions).
   */
  async saveInputSession(userId: string, mode: string, data: Record<string, unknown>): Promise<void> {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await this.database.from("user_input_sessions").upsert({
      user_id: userId,
      mode,
      data,
      expires_at: expiresAt,
    }, { onConflict: "user_id" });
  }

  async getInputSession(userId: string): Promise<{ mode: string; data: Record<string, unknown> } | null> {
    const now = new Date().toISOString();
    const { data, error } = await this.database
      .from("user_input_sessions")
      .select("mode, data, expires_at")
      .eq("user_id", userId)
      .gt("expires_at", now)
      .maybeSingle();

    if (error || !data) return null;
    return { mode: data.mode, data: data.data as Record<string, unknown> };
  }

  async clearInputSession(userId: string): Promise<void> {
    await this.database.from("user_input_sessions").delete().eq("user_id", userId);
  }

  private async ownerLeague(userId: string, clubId: string): Promise<{ league_instance_id: string }> {
    const { data, error } = await this.database
      .from("league_clubs")
      .select("league_instance_id")
      .eq("id", clubId)
      .eq("manager_user_id", userId)
      .maybeSingle();

    if (error || !data) throw new Error("CLUB_NOT_OWNED");
    return data;
  }

  async maintain(): Promise<void> {
    const now = new Date().toISOString();
    await this.database.rpc("expire_transfer_offers");
    await this.database
      .from("global_market_listings")
      .update({ status: "EXPIRED" })
      .eq("status", "ACTIVE")
      .lte("available_until", now);
  }
}
