// src/matches/match-scheduler-edge.ts
import { createClient } from "@supabase/supabase-js";

// src/matches/match-engine.ts
function seedFrom(value) {
  let seed = 2166136261;
  for (const char of value) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}
function random(seed) {
  return () => {
    seed |= 0;
    seed = seed + 1831565813 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function poisson(lambda, rng) {
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= rng();
  } while (product > limit && count < 10);
  return count - 1;
}
function mentalityBoost(value) {
  return {
    VERY_DEFENSIVE: -0.22,
    DEFENSIVE: -0.11,
    BALANCED: 0,
    ATTACKING: 0.12,
    VERY_ATTACKING: 0.22
  }[value] ?? 0;
}
function simulateMatch(fixtureId, home, away) {
  const rng = random(seedFrom(fixtureId));
  const gap = Math.max(-20, Math.min(20, home.strength - away.strength));
  const homeLine = home.defensiveLine ?? 50;
  const awayLine = away.defensiveLine ?? 50;
  const homePassing = home.passingStyle ?? "MIXED";
  const awayPassing = away.passingStyle ?? "MIXED";
  const homeFocus = home.attackFocus ?? "MIXED";
  const awayFocus = away.attackFocus ?? "MIXED";
  const homeTackling = home.tackling ?? "NORMAL";
  const awayTackling = away.tackling ?? "NORMAL";
  let homeTacticalMod = 0;
  let awayTacticalMod = 0;
  let possessionMod = 0;
  if (homeLine > 65) {
    possessionMod += 3;
    if (away.tempo > 65 || awayPassing === "DIRECT") {
      awayTacticalMod += 0.16;
    }
  }
  if (awayLine > 65) {
    possessionMod -= 3;
    if (home.tempo > 65 || homePassing === "DIRECT") {
      homeTacticalMod += 0.16;
    }
  }
  if (home.pressing > 65) {
    if (awayPassing === "SHORT") {
      awayTacticalMod += 0.12;
    } else {
      possessionMod += 2;
      awayTacticalMod -= 0.08;
    }
  }
  if (away.pressing > 65) {
    if (homePassing === "SHORT") {
      homeTacticalMod += 0.12;
    } else {
      possessionMod -= 2;
      homeTacticalMod -= 0.08;
    }
  }
  const isWingAttack = (focus) => ["LEFT", "RIGHT", "BOTH_WINGS"].includes(focus);
  if ((home.width ?? 50) < 40 && isWingAttack(awayFocus)) {
    awayTacticalMod += 0.14;
  }
  if ((away.width ?? 50) < 40 && isWingAttack(homeFocus)) {
    homeTacticalMod += 0.14;
  }
  let homeFoulsBase = 8;
  let awayFoulsBase = 8;
  let homeYellowsBase = 1;
  let awayYellowsBase = 1;
  let homeRedChance = 0.01;
  let awayRedChance = 0.01;
  if (homeTackling === "AGGRESSIVE") {
    homeFoulsBase += 4;
    homeYellowsBase += 1;
    homeRedChance = 0.04;
    awayTacticalMod += 0.08;
    homeTacticalMod += 0.04;
  } else if (homeTackling === "CAUTIOUS") {
    homeFoulsBase = Math.max(4, homeFoulsBase - 3);
    homeYellowsBase = 0;
    homeRedChance = 2e-3;
    homeTacticalMod -= 0.04;
  }
  if (awayTackling === "AGGRESSIVE") {
    awayFoulsBase += 4;
    awayYellowsBase += 1;
    awayRedChance = 0.04;
    homeTacticalMod += 0.08;
    awayTacticalMod += 0.04;
  } else if (awayTackling === "CAUTIOUS") {
    awayFoulsBase = Math.max(4, awayFoulsBase - 3);
    awayYellowsBase = 0;
    awayRedChance = 2e-3;
    awayTacticalMod -= 0.04;
  }
  const homeLambda = Math.max(
    0.25,
    1.35 + 0.2 + gap * 0.055 + mentalityBoost(home.mentality) + (home.tempo - 50) / 300 + homeTacticalMod
  );
  const awayLambda = Math.max(
    0.2,
    1.22 - gap * 0.05 + mentalityBoost(away.mentality) + (away.tempo - 50) / 320 + awayTacticalMod
  );
  const homeGoals = Math.min(8, poisson(homeLambda, rng));
  const awayGoals = Math.min(8, poisson(awayLambda, rng));
  const possessionHome = Math.max(
    28,
    Math.min(72, Math.round(50 + gap * 0.7 + (home.pressing - away.pressing) * 0.08 + possessionMod))
  );
  const shotsHome = Math.max(homeGoals, Math.round(7 + homeLambda * 3 + rng() * 5));
  const shotsAway = Math.max(awayGoals, Math.round(7 + awayLambda * 3 + rng() * 5));
  const stats = {
    possessionHome,
    shotsHome,
    shotsAway,
    shotsOnTargetHome: Math.min(shotsHome, Math.max(homeGoals, Math.round(shotsHome * (0.32 + rng() * 0.15)))),
    shotsOnTargetAway: Math.min(shotsAway, Math.max(awayGoals, Math.round(shotsAway * (0.32 + rng() * 0.15)))),
    cornersHome: Math.round(2 + rng() * 6),
    cornersAway: Math.round(2 + rng() * 6),
    foulsHome: Math.round(homeFoulsBase + rng() * 5),
    foulsAway: Math.round(awayFoulsBase + rng() * 5)
  };
  const events = [];
  for (const side of ["HOME", "AWAY"]) {
    const goals = side === "HOME" ? homeGoals : awayGoals;
    const opponentTackling = side === "HOME" ? awayTackling : homeTackling;
    for (let index = 0; index < goals; index += 1) {
      const isPen = opponentTackling === "AGGRESSIVE" && rng() < 0.25;
      events.push({
        minute: 1 + Math.floor(rng() * 90),
        type: "GOAL",
        side,
        isPenalty: isPen
      });
    }
    const yellows = Math.max(0, Math.floor(side === "HOME" ? homeYellowsBase + rng() * 2 : awayYellowsBase + rng() * 2));
    for (let index = 0; index < yellows; index += 1) {
      events.push({ minute: 1 + Math.floor(rng() * 90), type: "YELLOW_CARD", side });
    }
    const redChance = side === "HOME" ? homeRedChance : awayRedChance;
    if (rng() < redChance) {
      events.push({ minute: 20 + Math.floor(rng() * 70), type: "RED_CARD", side });
    }
  }
  events.sort((a, b) => a.minute - b.minute);
  return { homeGoals, awayGoals, stats, events };
}

// src/game/team-ovr.ts
var first = (value) => Array.isArray(value) ? value[0] : value;
var GK_POSITIONS = /* @__PURE__ */ new Set(["GK"]);
var DEF_POSITIONS = /* @__PURE__ */ new Set(["CB", "LB", "RB", "RWB", "LWB"]);
var MID_POSITIONS = /* @__PURE__ */ new Set(["CM", "CDM", "CAM", "LM", "RM"]);
var ATT_POSITIONS = /* @__PURE__ */ new Set(["ST", "CF", "LW", "RW"]);
async function calculateTeamOvr(database, leagueClubId) {
  const { data: lpData } = await database.from("lineup_players").select("club_player_id, club_players!inner(players!inner(player_attributes!inner(overall))), lineups!inner(league_club_id)").eq("lineups.league_club_id", leagueClubId);
  if (lpData && lpData.length === 11) {
    const ratings = lpData.map((row) => {
      const cp = first(row.club_players);
      const p = first(cp.players);
      const attr = first(p.player_attributes);
      return Number(attr?.overall ?? 75);
    });
    const avg = ratings.reduce((sum, r) => sum + r, 0) / 11;
    return Math.round(avg);
  }
  const { data: squadData } = await database.from("club_players").select("id, players!inner(primary_position, player_attributes!inner(overall))").eq("league_club_id", leagueClubId);
  if (!squadData || squadData.length === 0) {
    return 75;
  }
  const players = squadData.map((row) => {
    const p = first(row.players);
    const attr = first(p.player_attributes);
    return {
      id: row.id,
      position: p.primary_position ?? "CM",
      overall: Number(attr?.overall ?? 70)
    };
  });
  return selectBestStartingOvr(players);
}
function selectBestStartingOvr(players) {
  if (players.length === 0) return 75;
  if (players.length <= 11) {
    const avg2 = players.reduce((sum, p) => sum + p.overall, 0) / players.length;
    return Math.round(avg2);
  }
  const gks = players.filter((p) => GK_POSITIONS.has(p.position)).sort((a, b) => b.overall - a.overall);
  const defs = players.filter((p) => DEF_POSITIONS.has(p.position)).sort((a, b) => b.overall - a.overall);
  const mids = players.filter((p) => MID_POSITIONS.has(p.position)).sort((a, b) => b.overall - a.overall);
  const atts = players.filter((p) => ATT_POSITIONS.has(p.position)).sort((a, b) => b.overall - a.overall);
  const picked = /* @__PURE__ */ new Set();
  const starting11 = [];
  const pick = (list, count) => {
    let chosen = 0;
    for (const player of list) {
      if (chosen >= count) break;
      if (!picked.has(player.id)) {
        picked.add(player.id);
        starting11.push(player);
        chosen++;
      }
    }
  };
  pick(gks, 1);
  pick(defs, 4);
  pick(mids, 3);
  pick(atts, 3);
  if (starting11.length < 11) {
    const remaining = players.filter((p) => !picked.has(p.id)).sort((a, b) => b.overall - a.overall);
    pick(remaining, 11 - starting11.length);
  }
  const avg = starting11.reduce((sum, p) => sum + p.overall, 0) / starting11.length;
  return Math.round(avg);
}

// src/lib/html.ts
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function formatMoney(amount) {
  const abs = Math.abs(amount);
  if (abs >= 1e6) {
    const val = amount / 1e6;
    const formatted = val % 1 === 0 ? val.toFixed(0) : val.toFixed(1);
    return `\u20AC${formatted}M`;
  }
  if (abs >= 1e3) {
    const val = amount / 1e3;
    const formatted = val % 1 === 0 ? val.toFixed(0) : val.toFixed(1);
    return `\u20AC${formatted}K`;
  }
  return `\u20AC${amount}`;
}
function getTashkentParts(dateInput) {
  const d = new Date(dateInput);
  const now = /* @__PURE__ */ new Date();
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(d).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const nowFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  });
  const targetDateFormatted = nowFormatter.format(d);
  const nowDateFormatted = nowFormatter.format(now);
  const tomorrow = new Date(now.getTime() + 864e5);
  const tomorrowDateFormatted = nowFormatter.format(tomorrow);
  return {
    day: Number(parts.day ?? 1),
    month: parts.month ?? "",
    hours: parts.hour ?? "00",
    minutes: parts.minute ?? "00",
    isToday: targetDateFormatted === nowDateFormatted,
    isTomorrow: targetDateFormatted === tomorrowDateFormatted
  };
}
function formatDateTime(dateInput) {
  const p = getTashkentParts(dateInput);
  return `${p.day} ${p.month} \xB7 ${p.hours}:${p.minutes}`;
}
function formatMatchPreviewDate(dateInput) {
  const p = getTashkentParts(dateInput);
  if (p.isToday) {
    return `Bugun, ${p.day} ${p.month} \xB7 ${p.hours}:${p.minutes}`;
  }
  if (p.isTomorrow) {
    return `Ertaga, ${p.day} ${p.month} \xB7 ${p.hours}:${p.minutes}`;
  }
  return `${p.day} ${p.month} \xB7 ${p.hours}:${p.minutes}`;
}

// src/matches/event-participants.ts
function seedFrom2(value) {
  let seed = 2166136261;
  for (const char of value) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}
function random2(seed) {
  return () => {
    seed |= 0;
    seed = seed + 1831565813 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function scorerWeight(position) {
  if (["ST", "CF"].includes(position)) return 7;
  if (["LW", "RW"].includes(position)) return 5;
  if (position === "CAM") return 4;
  if (["CM", "LM", "RM"].includes(position)) return 2.5;
  if (["CDM", "LB", "RB", "LWB", "RWB"].includes(position)) return 1.2;
  if (position === "CB") return 0.7;
  return 0.08;
}
function assistWeight(position) {
  if (["LW", "RW", "CAM"].includes(position)) return 6;
  if (["CM", "LM", "RM"].includes(position)) return 5;
  if (["ST", "CF", "LB", "RB", "LWB", "RWB"].includes(position)) return 2.5;
  if (["CDM", "CB"].includes(position)) return 1.2;
  return 0.05;
}
function weightedPick(players, weight, rng) {
  const weights = players.map((player) => Math.max(1e-3, weight(player)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = rng() * total;
  for (let index = 0; index < players.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return players[index];
  }
  return players[players.length - 1];
}
function assignGoalParticipants(seedKey, players, events, penaltyTakerClubPlayerId) {
  if (!players.length) return [];
  const rng = random2(seedFrom2(seedKey));
  const goalsByPlayer = /* @__PURE__ */ new Map();
  const assistsByPlayer = /* @__PURE__ */ new Map();
  const penaltyTaker = penaltyTakerClubPlayerId ? players.find((player) => player.clubPlayerId === penaltyTakerClubPlayerId) : void 0;
  return events.map((event) => {
    const scorer = event.isPenalty && penaltyTaker ? penaltyTaker : weightedPick(
      players,
      (player) => scorerWeight(player.position) * (0.65 + player.overall / 100) / (1 + (goalsByPlayer.get(player.id) ?? 0) * 0.55),
      rng
    );
    goalsByPlayer.set(scorer.id, (goalsByPlayer.get(scorer.id) ?? 0) + 1);
    let assistant = null;
    if (!event.isPenalty && rng() >= 0.18) {
      const candidates = players.filter((player) => player.id !== scorer.id);
      if (candidates.length) {
        assistant = weightedPick(
          candidates,
          (player) => assistWeight(player.position) * (0.65 + player.overall / 100) / (1 + (assistsByPlayer.get(player.id) ?? 0) * 1.8),
          rng
        );
        assistsByPlayer.set(assistant.id, (assistsByPlayer.get(assistant.id) ?? 0) + 1);
      }
    }
    return { eventId: event.id, scorer, assistant };
  });
}

// src/matches/match.repository.ts
var first2 = (value) => Array.isArray(value) ? value[0] : value;
var MatchRepository = class {
  constructor(database) {
    this.database = database;
  }
  database;
  async team(clubId) {
    const [{ data: tactic, error: tacticError }, { data: lineup, error: lineupError }] = await Promise.all([
      this.database.from("tactics").select("mentality,pressing,tempo,defensive_line,width,passing_style,attack_focus,tackling").eq("league_club_id", clubId).single(),
      this.database.from("lineups").select("lineup_players(effective_rating)").eq("league_club_id", clubId).single()
    ]);
    if (tacticError) throw tacticError;
    if (lineupError) throw lineupError;
    let ratings = (lineup.lineup_players ?? []).map((row) => Number(row.effective_rating));
    if (ratings.length < 11) {
      const { data, error } = await this.database.from("club_players").select("players!inner(player_attributes!inner(overall))").eq("league_club_id", clubId);
      if (error) throw error;
      ratings = (data ?? []).map((row) => Number(first2(first2(row.players).player_attributes).overall)).sort((a, b) => b - a).slice(0, 11);
    }
    return {
      clubId,
      strength: ratings.reduce((sum, rating) => sum + rating, 0) / Math.max(1, ratings.length),
      mentality: tactic.mentality,
      pressing: tactic.pressing,
      tempo: tactic.tempo,
      defensiveLine: tactic.defensive_line,
      width: tactic.width,
      passingStyle: tactic.passing_style,
      attackFocus: tactic.attack_focus,
      tackling: tactic.tackling
    };
  }
  async due(limit = 20) {
    const { data, error } = await this.database.from("fixtures").select("id,home_club_id,away_club_id").eq("status", "SCHEDULED").lte("scheduled_at", (/* @__PURE__ */ new Date()).toISOString()).order("scheduled_at").limit(limit);
    if (error) throw error;
    return Promise.all((data ?? []).map(async (fixture) => ({ fixtureId: fixture.id, home: await this.team(fixture.home_club_id), away: await this.team(fixture.away_club_id) })));
  }
  async claimDue(limit = 20, workerId = crypto.randomUUID()) {
    const { data, error } = await this.database.rpc("claim_due_fixtures", {
      p_limit: limit,
      p_worker_id: workerId
    });
    if (error) throw error;
    try {
      return await Promise.all((data ?? []).map(async (fixture) => ({
        fixtureId: fixture.fixture_id,
        home: await this.team(fixture.home_club_id),
        away: await this.team(fixture.away_club_id)
      })));
    } catch (claimError) {
      await Promise.allSettled((data ?? []).map((fixture) => this.releaseClaim(fixture.fixture_id, workerId)));
      throw claimError;
    }
  }
  async releaseClaim(fixtureId, workerId) {
    const { error } = await this.database.rpc("release_fixture_claim", {
      p_fixture_id: fixtureId,
      p_worker_id: workerId
    });
    if (error) throw error;
  }
  async complete(fixtureId, simulation) {
    const { data, error } = await this.database.rpc("complete_match", {
      p_fixture_id: fixtureId,
      p_home_goals: simulation.homeGoals,
      p_away_goals: simulation.awayGoals,
      p_stats: simulation.stats,
      p_events: simulation.events,
      p_engine_version: "v2"
    });
    if (error) throw error;
    const matchId = data;
    await this.recordPlayerStats(matchId);
    await this.checkSeasonCompletion(matchId);
    return matchId;
  }
  async checkSeasonCompletion(matchId) {
    const { data: match } = await this.database.from("matches").select("league_instance_id").eq("id", matchId).maybeSingle();
    if (!match?.league_instance_id) return;
    const instanceId = match.league_instance_id;
    const { count, error: countErr } = await this.database.from("fixtures").select("id", { count: "exact", head: true }).eq("league_instance_id", instanceId).eq("status", "SCHEDULED");
    if (countErr || (count ?? 0) > 0) return;
    await this.database.from("league_instances").update({ status: "COMPLETED" }).eq("id", instanceId).neq("status", "COMPLETED");
    const { error: archiveError } = await this.database.rpc("archive_completed_league", {
      p_league_instance_id: instanceId
    });
    if (archiveError) throw archiveError;
  }
  async repairPlayerStats(matchId) {
    await this.recordPlayerStats(matchId, true);
  }
  async recordPlayerStats(matchId, replaceExisting = false) {
    const { data: match, error: matchError } = await this.database.from("matches").select("home_club_id, away_club_id, home_goals, away_goals").eq("id", matchId).single();
    if (matchError) throw matchError;
    const assign = async (clubId, goals) => {
      if (!goals) return;
      const [{ data, error }, { data: events, error: eventError }, { data: lineup }] = await Promise.all([
        this.database.from("club_players").select("id, player_id, players!inner(id, primary_position, player_attributes!inner(overall))").eq("league_club_id", clubId),
        this.database.from("match_events").select("id, minute, is_penalty").eq("match_id", matchId).eq("club_id", clubId).eq("event_type", "GOAL").order("minute"),
        this.database.from("lineups").select("penalty_taker_player_id, lineup_players(club_player_id)").eq("league_club_id", clubId).maybeSingle()
      ]);
      if (error) throw error;
      if (eventError) throw eventError;
      let players = (data ?? []).map((row) => {
        const player = first2(row.players);
        return {
          id: player.id,
          clubPlayerId: row.id,
          position: player.primary_position,
          overall: Number(first2(player.player_attributes).overall)
        };
      }).sort((a, b) => {
        const weight = (p) => p === "ST" ? 4 : p === "LW" || p === "RW" || p === "CAM" ? 3 : p === "CM" || p === "LM" || p === "RM" ? 2 : 1;
        return weight(b.position) * 100 + b.overall - (weight(a.position) * 100 + a.overall);
      });
      const starterIds = new Set((lineup?.lineup_players ?? []).map((row) => row.club_player_id));
      if (starterIds.size === 11) players = players.filter((player) => starterIds.has(player.clubPlayerId));
      if (!players.length) return;
      const rows = /* @__PURE__ */ new Map();
      const assignments = assignGoalParticipants(
        `${matchId}:${clubId}`,
        players,
        (events ?? []).map((event) => ({
          id: event.id,
          minute: Number(event.minute),
          isPenalty: Boolean(event.is_penalty)
        })),
        lineup?.penalty_taker_player_id
      );
      for (const assignment of assignments) {
        const { scorer, assistant } = assignment;
        const scorerRow = rows.get(scorer.id) ?? {
          match_id: matchId,
          player_id: scorer.id,
          club_id: clubId,
          minutes: 90,
          goals: 0,
          assists: 0,
          rating: 6.5
        };
        scorerRow.goals++;
        rows.set(scorer.id, scorerRow);
        if (assistant) {
          const assistantRow = rows.get(assistant.id) ?? {
            match_id: matchId,
            player_id: assistant.id,
            club_id: clubId,
            minutes: 90,
            goals: 0,
            assists: 0,
            rating: 6.5
          };
          assistantRow.assists++;
          rows.set(assistant.id, assistantRow);
        }
        const { error: updateEventError } = await this.database.from("match_events").update({
          player_id: scorer.id,
          metadata: { assist_player_id: assistant?.id ?? null }
        }).eq("id", assignment.eventId);
        if (updateEventError) throw updateEventError;
      }
      for (const row of rows.values()) {
        row.rating = Math.min(10, Math.max(5, Number((6.5 + row.goals * 1.2 + row.assists * 0.7).toFixed(1))));
      }
      if (replaceExisting) {
        const { error: deleteError } = await this.database.from("player_match_stats").delete().eq("match_id", matchId).eq("club_id", clubId);
        if (deleteError) throw deleteError;
      }
      const { error: insertError } = await this.database.from("player_match_stats").upsert([...rows.values()], { onConflict: "match_id,player_id" });
      if (insertError) throw insertError;
    };
    await Promise.all([assign(match.home_club_id, match.home_goals), assign(match.away_club_id, match.away_goals)]);
  }
  async ownerReports(matchId) {
    const { data: match, error: matchError } = await this.database.from("matches").select("league_instance_id,home_club_id,away_club_id,home_goals,away_goals,fixtures!inner(round_number),match_stats(*)").eq("id", matchId).single();
    if (matchError) throw matchError;
    const [{ data: clubs, error: clubError }, { data: events, error: eventError }] = await Promise.all([
      this.database.from("league_clubs").select("id,manager_type,manager_user_id,points,played,wins,draws,losses,cash_balance,clubs!inner(name),league_instances!inner(instance_number,competitions!inner(name)),users(telegram_id)").in("id", [match.home_club_id, match.away_club_id]),
      this.database.from("match_events").select("minute,club_id,player_id,metadata,players(short_name)").eq("match_id", matchId).eq("event_type", "GOAL").order("minute")
    ]);
    if (clubError) throw clubError;
    if (eventError) throw eventError;
    const assistantIds = (events ?? []).map((event) => event.metadata?.assist_player_id).filter(Boolean);
    const { data: assistants, error: assistError } = assistantIds.length ? await this.database.from("players").select("id,short_name").in("id", assistantIds) : { data: [], error: null };
    if (assistError) throw assistError;
    const assistantName = new Map((assistants ?? []).map((player) => [player.id, player.short_name]));
    const { data: allTable, error: tableError } = await this.database.from("league_clubs").select("id,played,points,goals_for,goals_against,clubs!inner(name)").eq("league_instance_id", match.league_instance_id);
    if (tableError) throw tableError;
    const ordered = (allTable ?? []).sort(
      (a, b) => b.points - a.points || b.goals_for - b.goals_against - (a.goals_for - a.goals_against) || b.goals_for - a.goals_for
    );
    const leagueTable = ordered.map((row, index) => ({
      position: index + 1,
      club: first2(row.clubs).name,
      played: row.played,
      goalDifference: row.goals_for - row.goals_against,
      points: row.points
    }));
    const stats = first2(match.match_stats);
    const clubMap = new Map((clubs ?? []).map((club) => [club.id, club]));
    const home = clubMap.get(match.home_club_id);
    const away = clubMap.get(match.away_club_id);
    if (!home || !away) return [];
    const goals = (events ?? []).map((event) => ({
      minute: event.minute,
      player: first2(event.players)?.short_name ?? "Noma\u2019lum",
      assist: assistantName.get(event.metadata?.assist_player_id) ?? null,
      club: first2(clubMap.get(event.club_id)?.clubs)?.name ?? "Noma\u2019lum klub"
    }));
    const result = [];
    for (const club of [home, away]) {
      if (club.manager_type !== "HUMAN") continue;
      const user = first2(club.users);
      if (!user?.telegram_id) continue;
      const isHome = club.id === match.home_club_id;
      const opponent = isHome ? away : home;
      const { data: incomeRows, error: incomeError } = await this.database.from("finance_transactions").select("amount").eq("match_id", matchId).eq("league_club_id", club.id);
      if (incomeError) throw incomeError;
      const { data: next, error: nextError } = await this.database.from("fixtures").select("scheduled_at,home:league_clubs!fixtures_home_club_id_fkey(clubs!inner(name)),away:league_clubs!fixtures_away_club_id_fkey(clubs!inner(name))").or(`home_club_id.eq.${club.id},away_club_id.eq.${club.id}`).eq("status", "SCHEDULED").gt("scheduled_at", (/* @__PURE__ */ new Date()).toISOString()).order("scheduled_at").limit(1).maybeSingle();
      if (nextError) throw nextError;
      const league = first2(club.league_instances);
      const competition = first2(league.competitions);
      result.push({
        telegramId: Number(user.telegram_id),
        clubId: club.id,
        club: first2(club.clubs).name,
        opponent: first2(opponent.clubs).name,
        isHome,
        homeGoals: match.home_goals,
        awayGoals: match.away_goals,
        goals,
        possession: [stats.possession_home, 100 - stats.possession_home],
        shots: [stats.shots_home, stats.shots_away],
        onTarget: [stats.shots_on_target_home, stats.shots_on_target_away],
        corners: [stats.corners_home, stats.corners_away],
        position: ordered.findIndex((row) => row.id === club.id) + 1,
        points: club.points,
        played: club.played,
        wins: club.wins,
        draws: club.draws,
        losses: club.losses,
        income: (incomeRows ?? []).reduce((sum, row) => sum + Number(row.amount), 0),
        balance: Number(club.cash_balance),
        next: next ? {
          home: first2(first2(next.home).clubs).name,
          away: first2(first2(next.away).clubs).name,
          scheduledAt: next.scheduled_at
        } : null,
        leagueName: `${competition.name} #${String(league.instance_number).padStart(4, "0")}`,
        leagueTable
      });
    }
    return result;
  }
  async history(userId, leagueClubId, limit = 10) {
    const { data: owned } = await this.database.from("league_clubs").select("league_instance_id").eq("id", leagueClubId).eq("manager_user_id", userId).maybeSingle();
    if (!owned) throw new Error("CLUB_NOT_OWNED");
    const { data, error } = await this.database.from("matches").select("id,played_at,home_goals,away_goals,fixtures!inner(round_number),home:league_clubs!matches_home_club_id_fkey(clubs!inner(name)),away:league_clubs!matches_away_club_id_fkey(clubs!inner(name))").or(`home_club_id.eq.${leagueClubId},away_club_id.eq.${leagueClubId}`).order("played_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => ({ id: row.id, round: first2(row.fixtures).round_number, playedAt: row.played_at, homeClub: first2(first2(row.home).clubs).name, awayClub: first2(first2(row.away).clubs).name, homeGoals: row.home_goals, awayGoals: row.away_goals }));
  }
  async table(userId, leagueClubId) {
    const { data: owned } = await this.database.from("league_clubs").select("league_instance_id").eq("id", leagueClubId).eq("manager_user_id", userId).maybeSingle();
    if (!owned) throw new Error("CLUB_NOT_OWNED");
    const { data, error } = await this.database.from("league_clubs").select("played,wins,draws,losses,goals_for,goals_against,points,clubs!inner(name)").eq("league_instance_id", owned.league_instance_id).order("points", { ascending: false }).order("goals_for", { ascending: false });
    if (error) throw error;
    return (data ?? []).sort((a, b) => b.points - a.points - (a.goals_for - a.goals_against - (b.goals_for - b.goals_against))).map((r, i) => ({ position: i + 1, club: first2(r.clubs).name, played: r.played, wins: r.wins, draws: r.draws, losses: r.losses, goalDifference: r.goals_for - r.goals_against, points: r.points }));
  }
  async leaders(userId, leagueClubId, kind) {
    const { data: owned, error: ownedError } = await this.database.from("league_clubs").select("league_instance_id").eq("id", leagueClubId).eq("manager_user_id", userId).maybeSingle();
    if (ownedError || !owned) throw new Error("CLUB_NOT_OWNED");
    const { data, error } = await this.database.from("player_match_stats").select("player_id,club_id,goals,assists,players!inner(short_name),league_clubs!inner(league_instance_id,clubs!inner(name))").eq("league_clubs.league_instance_id", owned.league_instance_id).gt(kind, 0);
    if (error) throw error;
    const totals = /* @__PURE__ */ new Map();
    for (const row of data ?? []) {
      const player = first2(row.players), club = first2(first2(row.league_clubs).clubs), current = totals.get(row.player_id) ?? { name: player.short_name, club: club.name, total: 0 };
      current.total += Number(row[kind]);
      totals.set(row.player_id, current);
    }
    return [...totals.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 10);
  }
  async finances(userId, leagueClubId) {
    const { data: club, error: clubError } = await this.database.from("league_clubs").select("cash_balance,transfer_budget,reserved_transfer_budget").eq("id", leagueClubId).eq("manager_user_id", userId).maybeSingle();
    if (clubError) throw clubError;
    if (!club) throw new Error("CLUB_NOT_OWNED");
    const { data, error } = await this.database.from("finance_transactions").select("kind,amount,description,created_at").eq("league_club_id", leagueClubId).order("created_at", { ascending: false }).limit(10);
    if (error) throw error;
    return { cashBalance: Number(club.cash_balance), transferBudget: Number(club.transfer_budget), reservedTransferBudget: Number(club.reserved_transfer_budget ?? 0), transactions: (data ?? []).map((row) => ({ kind: row.kind, amount: Number(row.amount), description: row.description, createdAt: row.created_at })) };
  }
  async clubSeasonStats(userId, leagueClubId) {
    const { data: club, error: clubErr } = await this.database.from("league_clubs").select("id, league_instance_id, played, wins, draws, losses, goals_for, goals_against, clubs!inner(name)").eq("id", leagueClubId).eq("manager_user_id", userId).maybeSingle();
    if (clubErr || !club) throw new Error("CLUB_NOT_OWNED");
    const clubName = first2(club.clubs).name;
    const { data: matches, error: mErr } = await this.database.from("matches").select("home_club_id, away_club_id, home_goals, away_goals").or(`home_club_id.eq.${leagueClubId},away_club_id.eq.${leagueClubId}`);
    if (mErr) throw mErr;
    let homeWins = 0, homeDraws = 0, homeLosses = 0;
    let awayWins = 0, awayDraws = 0, awayLosses = 0;
    for (const m of matches || []) {
      if (m.home_club_id === leagueClubId) {
        if (m.home_goals > m.away_goals) homeWins++;
        else if (m.home_goals === m.away_goals) homeDraws++;
        else homeLosses++;
      } else {
        if (m.away_goals > m.home_goals) awayWins++;
        else if (m.away_goals === m.home_goals) awayDraws++;
        else awayLosses++;
      }
    }
    const gf = Number(club.goals_for);
    const ga = Number(club.goals_against);
    return {
      clubName,
      games: Number(club.played),
      wins: Number(club.wins),
      draws: Number(club.draws),
      losses: Number(club.losses),
      goalsFor: gf,
      goalsAgainst: ga,
      goalDifference: gf - ga,
      homeWins,
      homeDraws,
      homeLosses,
      awayWins,
      awayDraws,
      awayLosses
    };
  }
  async playerSeasonStats(playerIdOrClubPlayerId, leagueClubId) {
    let resolvedPlayerId = playerIdOrClubPlayerId;
    let resolvedClubId = leagueClubId;
    let playerName = "Futbolchi";
    const { data: cp } = await this.database.from("club_players").select("id, player_id, league_club_id, players(id, short_name, name)").eq("id", playerIdOrClubPlayerId).maybeSingle();
    if (cp) {
      resolvedPlayerId = cp.player_id;
      if (!resolvedClubId) resolvedClubId = cp.league_club_id;
      const p = first2(cp.players);
      playerName = p?.short_name ?? p?.name ?? "Futbolchi";
    } else {
      const { data: p } = await this.database.from("players").select("short_name, name").eq("id", playerIdOrClubPlayerId).maybeSingle();
      playerName = p?.short_name ?? p?.name ?? "Futbolchi";
    }
    let query = this.database.from("player_match_stats").select("minutes, rating, goals, assists, yellow_cards, red_cards").eq("player_id", resolvedPlayerId);
    if (resolvedClubId) {
      query = query.eq("club_id", resolvedClubId);
    }
    const { data: rows, error } = await query;
    if (error) throw error;
    let games = 0, goals = 0, assists = 0, yellowCards = 0, redCards = 0;
    let ratingSum = 0, ratingCount = 0;
    for (const r of rows || []) {
      games++;
      goals += Number(r.goals ?? 0);
      assists += Number(r.assists ?? 0);
      yellowCards += Number(r.yellow_cards ?? 0);
      redCards += Number(r.red_cards ?? 0);
      if (r.rating !== null && r.rating !== void 0) {
        ratingSum += Number(r.rating);
        ratingCount++;
      }
    }
    const averageRating = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(1)) : null;
    return {
      playerName,
      games,
      matchesPlayed: games,
      goals,
      assists,
      yellowCards,
      redCards,
      averageRating
    };
  }
  async matchPreview(fixtureId) {
    const { data: fixture, error: fErr } = await this.database.from("fixtures").select("id, home_club_id, away_club_id, scheduled_at, league_instance_id").eq("id", fixtureId).single();
    if (fErr || !fixture) throw new Error("FIXTURE_NOT_FOUND");
    const [{ data: homeClub }, { data: awayClub }] = await Promise.all([
      this.database.from("league_clubs").select("id, clubs!inner(name)").eq("id", fixture.home_club_id).single(),
      this.database.from("league_clubs").select("id, clubs!inner(name)").eq("id", fixture.away_club_id).single()
    ]);
    const homeClubName = first2(homeClub?.clubs)?.name ?? "Home";
    const awayClubName = first2(awayClub?.clubs)?.name ?? "Away";
    const { data: table } = await this.database.from("league_clubs").select("id, points, goals_for, goals_against").eq("league_instance_id", fixture.league_instance_id);
    const ordered = (table ?? []).sort(
      (a, b) => b.points - a.points || b.goals_for - b.goals_against - (a.goals_for - a.goals_against) || b.goals_for - a.goals_for
    );
    const homeRank = ordered.findIndex((c) => c.id === fixture.home_club_id) + 1;
    const awayRank = ordered.findIndex((c) => c.id === fixture.away_club_id) + 1;
    const [homeOvr, awayOvr] = await Promise.all([
      this.getTeamOvr(fixture.home_club_id),
      this.getTeamOvr(fixture.away_club_id)
    ]);
    const [homeForm, awayForm] = await Promise.all([
      this.getLast5Form(fixture.home_club_id),
      this.getLast5Form(fixture.away_club_id)
    ]);
    const { data: h2hMatches } = await this.database.from("matches").select("home_club_id, away_club_id, home_goals, away_goals").or(
      `and(home_club_id.eq.${fixture.home_club_id},away_club_id.eq.${fixture.away_club_id}),and(home_club_id.eq.${fixture.away_club_id},away_club_id.eq.${fixture.home_club_id})`
    );
    let homeWins = 0, draws = 0, awayWins = 0;
    const hasHistory = Boolean(h2hMatches && h2hMatches.length > 0);
    for (const m of h2hMatches || []) {
      if (m.home_club_id === fixture.home_club_id) {
        if (m.home_goals > m.away_goals) homeWins++;
        else if (m.home_goals === m.away_goals) draws++;
        else awayWins++;
      } else {
        if (m.away_goals > m.home_goals) homeWins++;
        else if (m.away_goals === m.home_goals) draws++;
        else awayWins++;
      }
    }
    const scheduledAt = formatMatchPreviewDate(fixture.scheduled_at);
    return {
      homeClubName,
      awayClubName,
      homeRank: homeRank || 1,
      awayRank: awayRank || 2,
      homeOvr,
      awayOvr,
      homeForm,
      awayForm,
      h2h: { homeWins, draws, awayWins, hasHistory },
      scheduledAt
    };
  }
  async getTeamOvr(clubId) {
    return calculateTeamOvr(this.database, clubId);
  }
  async getLast5Form(clubId) {
    const { data: matches } = await this.database.from("matches").select("home_club_id, away_club_id, home_goals, away_goals, played_at").or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`).order("played_at", { ascending: false }).limit(5);
    if (!matches || !matches.length) return "";
    return matches.reverse().map((m) => {
      const isHome = m.home_club_id === clubId;
      const myGoals = isHome ? m.home_goals : m.away_goals;
      const oppGoals = isHome ? m.away_goals : m.home_goals;
      if (myGoals > oppGoals) return "W";
      if (myGoals === oppGoals) return "D";
      return "L";
    }).join("");
  }
};

// src/matches/match-scheduler.ts
async function processDueMatches(database, logger2, options = {}) {
  const repository = new MatchRepository(database);
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 20, 40));
  const maxMatches = Math.max(batchSize, Math.min(options.maxMatches ?? 120, 200));
  const workerId = options.workerId ?? crypto.randomUUID();
  let claimed = 0;
  let processed = 0;
  let failed = 0;
  let remaining = false;
  const matchIds = [];
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
      } catch (error) {
        failed += 1;
        try {
          await repository.releaseClaim(fixture.fixtureId, workerId);
        } catch (releaseError) {
          logger2.warn(
            { event: "fixture_claim_release_failed", fixtureId: fixture.fixtureId, err: releaseError },
            "Fixture claim will expire automatically"
          );
        }
        logger2.error(
          { event: "scheduled_match_failed", fixtureId: fixture.fixtureId, err: error },
          "Scheduled match simulation failed"
        );
      }
    }
    if (due.length < limit) break;
    remaining = claimed >= maxMatches;
  }
  logger2.info(
    { event: "match_scheduler_completed", workerId, claimed, processed, failed, remaining },
    "Match scheduler run completed"
  );
  return { claimed, processed, failed, remaining, matchIds };
}
function isAuthorizedSchedulerRequest(req, serviceRoleKey) {
  return req.headers.get("authorization") === `Bearer ${serviceRoleKey}`;
}

// src/matches/presentation.ts
function formatMatchReport(report) {
  const won = report.isHome ? report.homeGoals > report.awayGoals : report.awayGoals > report.homeGoals;
  const draw = report.homeGoals === report.awayGoals;
  const statusLine = won ? "\u{1F7E2} <b>G\u2018ALABA</b>" : draw ? "\u{1F7E1} <b>DURANG</b>" : "\u{1F534} <b>MAG\u2018LUBIYAT</b>";
  const homeTeam = report.isHome ? report.club : report.opponent;
  const awayTeam = report.isHome ? report.opponent : report.club;
  const scoreLine = `<b>${escapeHtml(homeTeam.toUpperCase())} ${report.homeGoals}\u2013${report.awayGoals} ${escapeHtml(awayTeam.toUpperCase())}</b>`;
  const goalsList = report.goals.length ? report.goals.map((g) => {
    const assist = g.assist ? ` <i>(${escapeHtml(g.assist)})</i>` : "";
    const club = g.club ? ` \xB7 ${escapeHtml(g.club)}` : "";
    return `${g.minute}' ${escapeHtml(g.player)}${assist}${club}`;
  }).join("\n") : "<i>Gol bo\u2018lmadi</i>";
  const [homePoss, awayPoss] = report.possession;
  const [homeShots, awayShots] = report.shots;
  const [homeOnTarget, awayOnTarget] = report.onTarget;
  const [homeCorners, awayCorners] = report.corners;
  const userPoss = report.isHome ? homePoss : awayPoss;
  const oppPoss = report.isHome ? awayPoss : homePoss;
  const userShots = report.isHome ? homeShots : awayShots;
  const oppShots = report.isHome ? awayShots : homeShots;
  const userOnTarget = report.isHome ? homeOnTarget : awayOnTarget;
  const oppOnTarget = report.isHome ? awayOnTarget : homeOnTarget;
  const userCorners = report.isHome ? homeCorners : awayCorners;
  const oppCorners = report.isHome ? awayCorners : homeCorners;
  const statsBlock = [
    "\u{1F4CA} <b>STATISTIKA</b>",
    `To\u2018p nazorati: <b>${userPoss}%</b> \u2014 ${oppPoss}%`,
    `Zarbalar: <b>${userShots}</b> \u2014 ${oppShots}`,
    `Aniq zarbalar: <b>${userOnTarget}</b> \u2014 ${oppOnTarget}`,
    `Burchaklar: <b>${userCorners}</b> \u2014 ${oppCorners}`
  ].join("\n");
  const tableRows = (report.leagueTable ?? []).map((row) => {
    const marker = row.club === report.club ? "\u{1F449} " : "";
    const difference = row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference);
    return `${marker}${row.position}. ${escapeHtml(row.club)} \xB7 ${row.played}O \xB7 ${difference} \xB7 <b>${row.points}</b>`;
  });
  const leagueBlock = [
    "\u{1F4C8} <b>LIGA</b>",
    `\u{1F3C6} <b>${escapeHtml(report.leagueName)}</b>`,
    `<b>${report.position}-o\u2018rin</b>`,
    `${report.points} ochko \xB7 ${report.wins}W ${report.draws}D ${report.losses}L`,
    ...tableRows.length ? ["", ...tableRows] : []
  ].join("\n");
  const incomeBlock = [
    "\u{1F4B0} <b>DAROMAD</b>",
    `Match: ${formatMoney(report.income)}`,
    `Balans: <b>${formatMoney(report.balance)}</b>`
  ].join("\n");
  let nextBlock = "\u23ED <b>KEYINGI O\u2018YIN</b>\n<i>Rejalashtirilgan o\u2018yin yo\u2018q.</i>";
  if (report.next) {
    const opp = report.isHome ? report.next.home === report.club ? report.next.away : report.next.home : report.next.away === report.club ? report.next.home : report.next.away;
    const dateStr = formatDateTime(report.next.scheduledAt);
    nextBlock = `\u23ED <b>KEYINGI O\u2018YIN</b>
vs <b>${escapeHtml(opp)}</b>
<i>${dateStr}</i>`;
  }
  return [
    statusLine,
    "",
    scoreLine,
    "",
    "\u26BD <b>GOLLAR</b>",
    goalsList,
    "",
    statsBlock,
    "",
    leagueBlock,
    "",
    incomeBlock,
    "",
    nextBlock
  ].join("\n");
}

// src/matches/match-scheduler-edge.ts
var logger = {
  info: (obj, message) => console.log(JSON.stringify({ level: "info", message, ...obj })),
  warn: (obj, message) => console.warn(JSON.stringify({ level: "warn", message, ...obj })),
  error: (obj, message) => console.error(JSON.stringify({ level: "error", message, ...obj }))
};
function env(key) {
  if (typeof Deno !== "undefined") return Deno.env.get(key);
  return typeof process !== "undefined" ? process.env[key] : void 0;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : typeof error === "object" && error !== null ? JSON.stringify(error) : String(error);
}
async function sendTelegramMessage(token, chatId, text, clubId) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "\u{1F465} Tarkib", callback_data: `sq:${clubId}` },
            { text: "\u{1F9E0} Taktika", callback_data: `tc:${clubId}` }
          ],
          [
            { text: "\u{1F3C6} Liga jadvali", callback_data: `tb:${clubId}` },
            { text: "\u{1F4CB} Matchlar", callback_data: `mt:${clubId}` }
          ]
        ]
      }
    })
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed (${response.status}): ${await response.text()}`);
}
async function sendTelegramPayload(token, chatId, text, inlineKeyboard) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: inlineKeyboard } })
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed (${response.status}): ${await response.text()}`);
}
var relation = (value) => Array.isArray(value) ? value[0] : value;
async function processReminders(database, telegramToken) {
  const now = /* @__PURE__ */ new Date();
  const cutoff = new Date(now.getTime() + 45 * 6e4);
  const { data: candidates, error: candidateError } = await database.from("fixtures").select("id,league_instance_id,home_club_id,away_club_id,scheduled_at").eq("status", "SCHEDULED").gt("scheduled_at", now.toISOString()).lte("scheduled_at", cutoff.toISOString()).limit(100);
  if (candidateError) throw candidateError;
  if (candidates?.length) {
    const leagueIds2 = [...new Set(candidates.map((f) => f.league_instance_id))];
    const clubIds = [...new Set(candidates.flatMap((f) => [f.home_club_id, f.away_club_id]))];
    const [{ data: leagues2 }, { data: clubs2 }] = await Promise.all([
      database.from("league_instances").select("id,status").in("id", leagueIds2),
      database.from("league_clubs").select("id,manager_user_id,manager_type,users(telegram_id)").in("id", clubIds)
    ]);
    const active2 = new Set((leagues2 ?? []).filter((l) => l.status === "ACTIVE").map((l) => l.id));
    const clubMap2 = new Map((clubs2 ?? []).map((c) => [c.id, c]));
    const rows = [];
    for (const fixture of candidates) {
      if (!active2.has(fixture.league_instance_id)) continue;
      for (const clubId of [fixture.home_club_id, fixture.away_club_id]) {
        const club = clubMap2.get(clubId);
        const u = club?.users ? relation(club.users) : null;
        if (club?.manager_type === "HUMAN" && club.manager_user_id && u?.telegram_id) rows.push({ user_id: club.manager_user_id, fixture_id: fixture.id, reminder_type: "45_MIN", telegram_id: u.telegram_id, league_club_id: club.id });
      }
    }
    if (rows.length) {
      const { error } = await database.from("match_reminders").upsert(rows, { onConflict: "user_id,fixture_id,reminder_type", ignoreDuplicates: true });
      if (error) throw error;
    }
  }
  const { data: pending, error: pendingError } = await database.from("match_reminders").select("id,user_id,fixture_id,telegram_id,league_club_id,attempts").is("sent_at", null).order("created_at").limit(50);
  if (pendingError) throw pendingError;
  if (!pending?.length) return { sent: 0, failed: 0 };
  if (!telegramToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured for reminders");
  const fixtureIds = [...new Set(pending.map((r) => r.fixture_id))];
  const { data: fixtures } = await database.from("fixtures").select("id,status,scheduled_at,league_instance_id,home_club_id,away_club_id").in("id", fixtureIds);
  const fMap = new Map((fixtures ?? []).map((f) => [f.id, f]));
  const allClubIds = [...new Set((fixtures ?? []).flatMap((f) => [f.home_club_id, f.away_club_id]))];
  const leagueIds = [...new Set((fixtures ?? []).map((f) => f.league_instance_id))];
  const [{ data: clubs }, { data: leagues }] = await Promise.all([
    database.from("league_clubs").select("id,manager_user_id,manager_type,clubs(name)").in("id", allClubIds),
    database.from("league_instances").select("id,status").in("id", leagueIds)
  ]);
  const clubMap = new Map((clubs ?? []).map((c) => [c.id, c]));
  const active = new Set((leagues ?? []).filter((l) => l.status === "ACTIVE").map((l) => l.id));
  let sent = 0, failed = 0;
  for (const row of pending) {
    try {
      const f = fMap.get(row.fixture_id);
      const managed = clubMap.get(row.league_club_id);
      if (!f || f.status !== "SCHEDULED" || !active.has(f.league_instance_id) || new Date(f.scheduled_at) <= now || managed?.manager_type !== "HUMAN" || managed?.manager_user_id !== row.user_id) {
        await database.from("match_reminders").delete().eq("id", row.id);
        continue;
      }
      if (new Date(f.scheduled_at).getTime() - now.getTime() > 45 * 6e4) continue;
      const home = clubMap.get(f.home_club_id), away = clubMap.get(f.away_club_id);
      const homeName = relation(home.clubs).name, awayName = relation(away.clubs).name;
      const time = new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(f.scheduled_at));
      await sendTelegramPayload(telegramToken, Number(row.telegram_id), `\u23F0 <b>45 daqiqadan keyin o\u2018yin!</b>

${homeName} vs ${awayName}
\u{1F550} ${time}

<i>Tarkib va taktikani tekshirib qo\u2018ying.</i>`, [[{ text: "\u{1F525} Asosiy XI", callback_data: `xi:${row.league_club_id}` }, { text: "\u{1F9E0} Taktika", callback_data: `tc:${row.league_club_id}` }], [{ text: "\u2694\uFE0F Match preview", callback_data: `mpv:${row.league_club_id}` }]]);
      await database.from("match_reminders").update({ sent_at: (/* @__PURE__ */ new Date()).toISOString(), attempts: Number(row.attempts) + 1, last_error: null }).eq("id", row.id);
      await database.rpc("log_analytics_event", { p_user_id: row.user_id, p_event_name: "match_reminder_sent", p_dedup_key: row.fixture_id + ":" + row.user_id, p_metadata: { fixture_id: row.fixture_id } });
      sent++;
    } catch (error) {
      failed++;
      await database.from("match_reminders").update({ attempts: Number(row.attempts) + 1, last_error: errorMessage(error).slice(0, 1e3) }).eq("id", row.id);
    }
  }
  return { sent, failed };
}
async function processSeasonSummaries(database, telegramToken) {
  const { data: deliveries, error } = await database.from("season_summary_deliveries").select("id,season_history_id,telegram_id,attempts").is("sent_at", null).order("created_at").limit(30);
  if (error) throw error;
  if (!deliveries?.length) return { sent: 0, failed: 0 };
  if (!telegramToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured for season summaries");
  const ids = deliveries.map((d) => d.season_history_id);
  const { data: histories, error: hError } = await database.from("manager_season_history").select("id,user_id,competition_name,instance_number,club_name,final_position,played,wins,draws,losses,goals_for,goals_against,points,season_xp_earned,champion").in("id", ids);
  if (hError) throw hError;
  const map = new Map((histories ?? []).map((h) => [h.id, h]));
  let sent = 0, failed = 0;
  for (const d of deliveries) {
    try {
      const h = map.get(d.season_history_id);
      if (!h) continue;
      const medal = h.final_position === 1 ? "\u{1F947}" : h.final_position === 2 ? "\u{1F948}" : h.final_position === 3 ? "\u{1F949}" : "\u{1F3C5}";
      const trophy = h.final_position === 1 ? `

\u{1F3C5} <b>Yangi sovrin:</b>
${h.competition_name} Champion #${String(h.instance_number).padStart(4, "0")}` : "";
      await sendTelegramPayload(telegramToken, Number(d.telegram_id), `\u{1F3C6} <b>MAVSUM YAKUNI</b>

\u{1F3DF} <b>${h.club_name}</b>
${h.competition_name} #${String(h.instance_number).padStart(4, "0")}

${medal} Yakuniy o\u2018rin: <b>${h.final_position}</b>
\u{1F3AE} O\u2018yinlar: ${h.played}
\u2705 G\u2018alaba: ${h.wins}
\u{1F91D} Durang: ${h.draws}
\u274C Mag\u2018lubiyat: ${h.losses}
\u26BD Gollar: ${h.goals_for}\u2013${h.goals_against}
\u2B50 Mavsum XP: +${h.season_xp_earned}${trophy}

\u{1F4DA} <i>Natija manager karerangizga saqlandi.</i>`, [[{ text: "\u{1F3C6} Sovrinlarim", callback_data: "pf:t" }, { text: "\u{1F4DA} Mavsumlarim", callback_data: "pf:s:0" }], [{ text: "\u{1F504} Yangi liga boshlash", callback_data: "join" }]]);
      await database.from("season_summary_deliveries").update({ sent_at: (/* @__PURE__ */ new Date()).toISOString(), attempts: Number(d.attempts) + 1, last_error: null }).eq("id", d.id);
      await database.rpc("log_analytics_event", { p_user_id: h.user_id, p_event_name: "season_summary_sent", p_dedup_key: h.id, p_metadata: { season_history_id: h.id } });
      sent++;
    } catch (err) {
      failed++;
      await database.from("season_summary_deliveries").update({ attempts: Number(d.attempts) + 1, last_error: errorMessage(err).slice(0, 1e3) }).eq("id", d.id);
    }
  }
  return { sent, failed };
}
async function handleMatchScheduler(req) {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const url = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return Response.json({ error: "Scheduler is not configured" }, { status: 500 });
  const schedulerSecret = env("MATCH_SCHEDULER_SECRET") ?? serviceRoleKey;
  if (!isAuthorizedSchedulerRequest(req, schedulerSecret)) {
    logger.warn({ event: "match_scheduler_unauthorized" }, "Rejected unauthorized scheduler request");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const database = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const result = await processDueMatches(database, logger);
    const telegramToken = env("TELEGRAM_BOT_TOKEN");
    let reportsSent = 0;
    let reportsFailed = 0;
    const { data: deliveries, error: deliveryError } = await database.from("match_report_deliveries").select("id,match_id,telegram_id,attempts").is("sent_at", null).order("created_at").limit(50);
    if (deliveryError) throw deliveryError;
    if (deliveries?.length && !telegramToken) {
      throw new Error("TELEGRAM_BOT_TOKEN is not configured for pending match reports");
    }
    if (telegramToken && deliveries?.length) {
      const repository = new MatchRepository(database);
      for (const delivery of deliveries) {
        try {
          const reports = await repository.ownerReports(delivery.match_id);
          const report = reports.find((item) => item.telegramId === Number(delivery.telegram_id));
          if (!report) throw new Error("Match owner report could not be built for queued recipient");
          await sendTelegramMessage(telegramToken, report.telegramId, formatMatchReport(report), report.clubId);
          const { error: sentError } = await database.from("match_report_deliveries").update({ sent_at: (/* @__PURE__ */ new Date()).toISOString(), attempts: Number(delivery.attempts) + 1, last_error: null }).eq("id", delivery.id);
          if (sentError) throw sentError;
          reportsSent += 1;
        } catch (error) {
          reportsFailed += 1;
          const message = errorMessage(error);
          await database.from("match_report_deliveries").update({ attempts: Number(delivery.attempts) + 1, last_error: message.slice(0, 1e3) }).eq("id", delivery.id);
          logger.warn(
            { event: "match_report_send_failed", matchId: delivery.match_id, telegramId: delivery.telegram_id, err: error },
            "Match report could not be sent; it will be retried"
          );
        }
      }
    }
    const reminders = await processReminders(database, telegramToken);
    const seasonSummaries = await processSeasonSummaries(database, telegramToken);
    const { matchIds: _matchIds, ...summary } = result;
    return Response.json({ ok: true, ...summary, reportsSent, reportsFailed, remindersSent: reminders.sent, remindersFailed: reminders.failed, seasonSummariesSent: seasonSummaries.sent, seasonSummariesFailed: seasonSummaries.failed });
  } catch (error) {
    const message = errorMessage(error);
    logger.error({ event: "match_scheduler_failed", err: error }, "Match scheduler run failed");
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
if (typeof Deno !== "undefined" && typeof Deno.serve === "function") Deno.serve(handleMatchScheduler);
var match_scheduler_edge_default = { fetch: handleMatchScheduler };
export {
  match_scheduler_edge_default as default,
  handleMatchScheduler
};
