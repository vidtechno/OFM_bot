import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml } from "../lib/html.js";

export type NotificationType =
  | "LEAGUE_3H_REMINDER"
  | "LEAGUE_STARTED"
  | "NEW_ROUND"
  | "ROUND_COMPLETED"
  | "TABLE_MOVEMENT"
  | "TOP3_ENTERED"
  | "RELEGATION_WARNING"
  | "CHAMPION_SECURED"
  | "TITLE_RACE_FINAL_ROUND";

export interface PendingNotification {
  userId: string;
  telegramId?: number | null;
  leagueInstanceId: string;
  type: NotificationType;
  dedupKey: string;
  text: string;
  payload?: Record<string, any>;
}

export class LeagueNotificationService {
  constructor(private readonly database: SupabaseClient) {}

  /**
   * Records a notification with strict deduplication in the database.
   * Returns true if newly recorded, false if already sent.
   */
  async recordNotification(
    userId: string,
    leagueInstanceId: string,
    type: NotificationType,
    dedupKey: string,
    payload: Record<string, any> = {}
  ): Promise<boolean> {
    const { data, error } = await this.database
      .from("league_notifications")
      .upsert(
        {
          user_id: userId,
          league_instance_id: leagueInstanceId,
          notification_type: type,
          dedup_key: dedupKey,
          payload,
        },
        { onConflict: "dedup_key", ignoreDuplicates: true }
      )
      .select("id");

    if (error) return false;
    return Boolean(data && data.length > 0);
  }

  // === Formatters for the 9 Notification Types ===

  format3hReminder(leagueName: string): string {
    return [
      "⏳ <b>Liga boshlanishiga 3 soat qoldi</b>",
      "",
      `🇪🇺 ${escapeHtml(leagueName)}`,
      "",
      "<i>Tarkib va taktikangizni tekshirib qo‘ying.</i>",
    ].join("\n");
  }

  formatLeagueStarted(leagueName: string, clubName: string): string {
    return [
      "🚀 <b>LIGA BOSHLANDI!</b>",
      "",
      `${escapeHtml(leagueName)} start oldi.`,
      "",
      `🏟 Siz: <b>${escapeHtml(clubName)}</b>`,
    ].join("\n");
  }

  formatNewRound(roundNumber: number, opponentName: string): string {
    return [
      "⚽ <b>YANGI TUR</b>",
      "",
      `<b>${roundNumber}-tur</b> boshlandi.`,
      "",
      "Keyingi raqib:",
      `<b>${escapeHtml(opponentName)}</b>`,
    ].join("\n");
  }

  formatRoundCompleted(roundNumber: number): string {
    return [
      `🏁 <b>${roundNumber}-TUR YAKUNLANDI</b>`,
      "",
      "Jadval va natijalar yangilandi.",
    ].join("\n");
  }

  formatTableMovement(oldPos: number, newPos: number): string {
    if (newPos < oldPos) {
      return [
        "📈 <b>Jadvalda ko‘tarildingiz!</b>",
        `${oldPos}-o‘rin → <b>${newPos}-o‘rin</b>`,
      ].join("\n");
    }
    return [
      "📉 <b>Jadvalda pastladingiz</b>",
      `${oldPos}-o‘rin → <b>${newPos}-o‘rin</b>`,
    ].join("\n");
  }

  formatTop3Entered(newPos: number): string {
    return [
      "🔥 <b>TOP-3!</b>",
      "",
      `Siz turnir jadvalida <b>${newPos}-o‘rin</b>ga ko‘tarildingiz.`,
    ].join("\n");
  }

  formatRelegationWarning(): string {
    return [
      "⚠️ <b>XAVFLI HUDUD</b>",
      "",
      "Klubingiz quyi o‘rinlarga tushib qoldi.",
    ].join("\n");
  }

  formatChampionSecured(): string {
    return [
      "🏆 <b>CHEMPION!</b>",
      "",
      "Tabriklaymiz!",
      "Siz mavsum tugashidan oldin chempionlikni matematik jihatdan kafolatladingiz.",
    ].join("\n");
  }

  formatFinalRoundTitleRace(): string {
    return [
      "🏁 <b>SO‘NGGI TUR — CHEMPIONLIK JANGI</b>",
      "",
      "Chempionlik taqdiri oxirgi turda hal bo‘ladi.",
    ].join("\n");
  }

  // === Mathematical Title and Race Checks ===

  static checkMathematicalChampion(
    leaderPoints: number,
    secondPlacePoints: number,
    remainingRounds: number
  ): boolean {
    if (remainingRounds <= 0) return true;
    const maxPossibleSecondPlacePoints = secondPlacePoints + remainingRounds * 3;
    return leaderPoints > maxPossibleSecondPlacePoints;
  }

  static checkFinalRoundTitleRace(
    currentRound: number,
    totalRounds: number,
    clubsPoints: number[]
  ): boolean {
    // Only applies on final round
    if (currentRound !== totalRounds) return false;
    if (clubsPoints.length < 2) return false;

    const leaderPoints = clubsPoints[0]!;
    // Count how many clubs can still tie or beat leader
    const contenders = clubsPoints.filter((pts) => pts + 3 >= leaderPoints);
    return contenders.length >= 2;
  }
}
