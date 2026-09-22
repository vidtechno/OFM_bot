import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  htmlEscape,
  formatMoney,
  formatCountdown,
  formatLobbyCountdown,
  formatLeagueNumber,
  formatDateTime,
  formatCompetitionName,
  competitionFlag,
  positionGroupLabel,
  positionGroupPluralLabel,
} from "../src/lib/html.js";
import { createMainKeyboard, MAIN_MENU } from "../src/bot/keyboards.js";
import { formatOpenLobbies, claimErrorMessage, formatClubDashboard } from "../src/leagues/presentation.js";
import { formatLeagueMarket, formatMarket, formatIncomingOffer, formatPlayerProfile } from "../src/transfers/presentation.js";
import { formatMatchReport } from "../src/matches/presentation.js";
import { formatProfile } from "../src/progression/presentation.js";
import { formatStartingXi, formatTactics } from "../src/tactics/presentation.js";

describe("UI/UX & Presentation Regression Test Suite", () => {
  describe("1. Bayroqlar va competition mapping", () => {
    it("OFM Elite League uchun 🇪🇺 va O‘zbekiston Superligasi uchun 🇺🇿 bayroqlarini qaytaradi", () => {
      expect(competitionFlag("ELITE")).toBe("🇪🇺");
      expect(competitionFlag("elite")).toBe("🇪🇺");
      expect(competitionFlag("UZB")).toBe("🇺🇿");
      expect(competitionFlag("uzb")).toBe("🇺🇿");
      // Ingliz bayrog'i (🏴󠁧󠁢󠁥󠁮󠁧󠁿) ELITE uchun ishlatilmasligi kerak
      expect(competitionFlag("ELITE")).not.toBe("🏴");
      expect(competitionFlag("ELITE")).not.toBe("🏴󠁧󠁢󠁥󠁮󠁧󠁿");
    });

    it("formatCompetitionName to'g'ri nomlarni qaytaradi", () => {
      expect(formatCompetitionName("UZB")).toBe("O‘zbekiston Superligasi");
      expect(formatCompetitionName("ELITE")).toBe("OFM Elite League");
    });

    it("formatOpenLobbies 🇪🇺 va 🇺🇿 bayroqlarini chiqaradi", () => {
      const lobbies = [
        {
          competitionCode: "UZB",
          competitionName: "O‘zbekiston Superligasi",
          instanceNumber: 1,
          humanCount: 0,
          maxClubs: 16,
          registrationClosesAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
          status: "OPEN",
        },
        {
          competitionCode: "ELITE",
          competitionName: "OFM Elite League",
          instanceNumber: 1,
          humanCount: 0,
          maxClubs: 20,
          registrationClosesAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
          status: "OPEN",
        },
      ];

      const text = formatOpenLobbies(lobbies, []);
      expect(text).toContain("🇺🇿 <b>O‘zbekiston Superligasi</b>");
      expect(text).toContain("🇪🇺 <b>OFM Elite League</b>");
      expect(text).not.toContain("🏴󠁧󠁢󠁥󠁮󠁧󠁿");
      expect(text).toContain("👤 0/16 manager");
      expect(text).toContain("👤 0/20 manager");
      expect(text).toContain("📌 <b>MENING LIGALARIM</b>");
      expect(text).toContain("<i>Hozircha faol turniringiz yo‘q.</i>");
      expect(text).toContain("🎮 Faol turnirlar: <b>0/2</b>");
    });
  });

  describe("2. Liga tanlash callback regex & uzunlik", () => {
    const lgRegex = /^lg:([0-9a-f-]{36})(?::(\d+))?$/;
    const testUuid = "1b3bbdd0-7df7-4298-aa20-2a5e35021b74";

    it("lg callback ham page'siz (lg:uuid), ham page bilan (lg:uuid:page) ishlaydi", () => {
      const matchNoPage = `lg:${testUuid}`.match(lgRegex);
      expect(matchNoPage).not.toBeNull();
      expect(matchNoPage![1]).toBe(testUuid);
      expect(matchNoPage![2]).toBeUndefined();

      const matchPage0 = `lg:${testUuid}:0`.match(lgRegex);
      expect(matchPage0).not.toBeNull();
      expect(matchPage0![1]).toBe(testUuid);
      expect(matchPage0![2]).toBe("0");

      const matchPage1 = `lg:${testUuid}:1`.match(lgRegex);
      expect(matchPage1).not.toBeNull();
      expect(matchPage1![1]).toBe(testUuid);
      expect(matchPage1![2]).toBe("1");
    });

    it("barcha callback_data uzunligi Telegram 64-bayt chegarasidan oshmaydi", () => {
      const callbacks = [
        `lg:${testUuid}`,
        `lg:${testUuid}:0`,
        `lg:${testUuid}:9`,
        `cf:${testUuid}`,
        `cl:${testUuid}`,
        `db:${testUuid}`,
        `lx:${testUuid}`,
        `lm:${testUuid}:0:ALL`,
        `lm:${testUuid}:0:GK`,
        `gm:${testUuid}:0:DEF`,
        `gm:${testUuid}:0:MID`,
        `gm:${testUuid}:0:ATT`,
        `lb:${testUuid}`,
        `gb:${testUuid}`,
        "cb:band",
        "noop",
        "refresh:leagues",
        "join",
      ];

      for (const cb of callbacks) {
        const byteLen = Buffer.byteLength(cb, "utf8");
        expect(byteLen).toBeLessThanOrEqual(64);
      }
    });
  });

  describe("3. Shared Formatterlar", () => {
    it("htmlEscape xavfsiz HTML belgilarini almashtiradi", () => {
      expect(htmlEscape("<script>alert('xss')</script> & \"hello\"")).toBe(
        "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt; &amp; &quot;hello&quot;"
      );
      expect(escapeHtml("<b>test</b>")).toBe("&lt;b&gt;test&lt;/b&gt;");
    });

    it("formatMoney to'g'ri million va mingliklarni formatlaydi", () => {
      expect(formatMoney(150_000_000)).toBe("€150M");
      expect(formatMoney(42_500_000)).toBe("€42.5M");
      expect(formatMoney(900_000)).toBe("€900K");
      expect(formatMoney(500)).toBe("€500");
    });

    it("formatCountdown vaqt chegaralarini to'g'ri chiqaradi", () => {
      // 11 soat 20 daqiqa
      const t1 = new Date(Date.now() + (11 * 60 + 20) * 60_000 + 1000).toISOString();
      expect(formatCountdown(t1)).toBe("<b>11</b> soat <b>20</b> daqiqa qoldi");

      // 45 daqiqa
      const t2 = new Date(Date.now() + 45 * 60_000 + 1000).toISOString();
      expect(formatCountdown(t2)).toBe("<b>45</b> daqiqa qoldi");

      // 1 soat 0 daqiqa
      const t3 = new Date(Date.now() + 60 * 60_000 + 1000).toISOString();
      expect(formatCountdown(t3)).toBe("<b>1</b> soat qoldi");

      // 0:00 yoki o'tib ketgan
      const t0 = new Date(Date.now() - 1000).toISOString();
      expect(formatCountdown(t0)).toBe("<b>Liga boshlanmoqda...</b>");
      expect(formatCountdown(null)).toBe("<b>Liga boshlanmoqda...</b>");
    });

    it("formatLeagueNumber 4 xonali padding beradi", () => {
      expect(formatLeagueNumber(1)).toBe("#0001");
      expect(formatLeagueNumber(42)).toBe("#0042");
    });

    it("positionGroupLabel va positionGroupPluralLabel o‘zbekcha nomlarni beradi", () => {
      expect(positionGroupLabel("GK")).toBe("Darvozabon");
      expect(positionGroupLabel("DEF")).toBe("Himoyachi");
      expect(positionGroupLabel("MID")).toBe("Yarim himoyachi");
      expect(positionGroupLabel("ATT")).toBe("Hujumchi");
      expect(positionGroupLabel("ALL")).toBe("Barchasi");

      expect(positionGroupPluralLabel("GK")).toBe("Darvozabonlar");
      expect(positionGroupPluralLabel("DEF")).toBe("Himoyachilar");
      expect(positionGroupPluralLabel("MID")).toBe("Yarim himoyachilar");
      expect(positionGroupPluralLabel("ATT")).toBe("Hujumchilar");
      expect(positionGroupPluralLabel("ALL")).toBe("Barchasi");
    });
  });

  describe("4. Main Keyboard va Bot haqida", () => {
    it("Reply keyboard 2x2 bo'lib, 'ℹ️ Bot haqida' tugmasi mavjud", () => {
      const kbJson = JSON.parse(JSON.stringify(createMainKeyboard(false))) as {
        keyboard: Array<Array<{ text: string }>>;
      };
      expect(kbJson.keyboard).toEqual([
        [{ text: MAIN_MENU.club }, { text: MAIN_MENU.leagues }],
        [{ text: MAIN_MENU.profile }, { text: "ℹ️ Bot haqida" }],
      ]);
      // Doimiy Transfer tugmasi yo'qligini tasdiqlash
      const allButtons = kbJson.keyboard.flat().map((b) => b.text);
      expect(allButtons).not.toContain("🌍 Transfer");
    });

    it("Admin uchun alohida 3-qatorda Admin panel tugmasi chiqadi", () => {
      const kbJson = JSON.parse(JSON.stringify(createMainKeyboard(true))) as {
        keyboard: Array<Array<{ text: string }>>;
      };
      expect(kbJson.keyboard).toHaveLength(3);
      expect(kbJson.keyboard[2]).toEqual([{ text: "🛠 Admin panel" }]);
    });
  });

  describe("5. Transfer Bozor Matni & Filter UI", () => {
    it("bo'sh transfer bozorida toza empty state chiqadi", () => {
      const empty = formatLeagueMarket([], "OFM Elite League #0001", "ALL");
      expect(empty).toContain("🛒 <b>TRANSFER BOZORI</b>");
      expect(empty).toContain("🏆 <i>OFM Elite League #0001</i>");
      expect(empty).toContain("📂 Bo‘lim: <b>Barchasi</b>");
      expect(empty).toContain("<i>Hozircha transferga qo‘yilgan futbolchilar topilmadi.</i>");
      expect(empty).toContain("Boshqa pozitsiyani tanlang yoki keyinroq qayta tekshiring.");
    });

    it("futbolchilar alohida blokda va toza formatda chiqadi", () => {
      const players = [
        {
          listingId: "1",
          name: "Ronald Araújo",
          age: 25,
          position: "CB",
          overall: 86,
          askingPrice: 58_000_000,
          availableUntil: new Date().toISOString(),
          sellerName: "Barcelona",
          isOwnListing: false,
        },
        {
          listingId: "2",
          name: "Alessandro Bastoni",
          age: 25,
          position: "CB",
          overall: 85,
          askingPrice: 54_000_000,
          availableUntil: new Date().toISOString(),
          sellerName: "Inter",
          isOwnListing: false,
        },
      ];

      const text = formatLeagueMarket(players, "OFM Elite League #0001", "DEF");
      expect(text).toContain("📂 Bo‘lim: <b>Himoyachilar</b>");
      expect(text).toContain("1. <b>Ronald Araújo</b>");
      expect(text).toContain("🛡 CB · ⭐<b>86</b>");
      expect(text).toContain("🏟 Barcelona");
      expect(text).toContain("💰 <b>€58M</b>");

      expect(text).toContain("2. <b>Alessandro Bastoni</b>");
      expect(text).toContain("🛡 CB · ⭐<b>85</b>");
      expect(text).toContain("🏟 Inter");
      expect(text).toContain("💰 <b>€54M</b>");
    });
  });

  describe("6. Error va Empty States", () => {
    it("claimErrorMessage texnik xatolar o'rniga foydalanuvchiga tushunarli o'zbekcha xabarlar qaytaradi", () => {
      expect(claimErrorMessage(new Error("MAX_TOURNAMENT_LIMIT_REACHED"))).toContain(
        "Turnir limiti to‘lgan"
      );
      expect(claimErrorMessage(new Error("CLUB_ALREADY_CLAIMED"))).toContain(
        "Klub band qilingan"
      );
      expect(claimErrorMessage(new Error("LEAGUE_PRE_SEASON_LOCKED"))).toContain(
        "Liga hali boshlanmagan"
      );
      expect(claimErrorMessage(new Error("PREVIOUSLY_DEPARTED_THIS_LEAGUE"))).toContain(
        "Qayta kirish taqiqlangan"
      );
      expect(claimErrorMessage(new Error("UNKNOWN_DATABASE_ERROR_42P01"))).toBe(
        "❌ <b>Amal bajarilmadi</b>\n<i>Qayta urinib ko‘ring.</i>"
      );
    });
  });

  describe("7. Match Result & Profile Formatting", () => {
    it("formatMatchReport g'alaba, durang va mag'lubiyat holatlarini to'g'ri ko'rsatadi", () => {
      const baseReport = {
        telegramId: 123456,
        clubId: "club-1",
        club: "Real Madrid",
        opponent: "Barcelona",
        isHome: true,
        homeGoals: 3,
        awayGoals: 1,
        goals: [{ minute: 17, player: "Mbappé", assist: "Bellingham" }],
        possession: [54, 46] as [number, number],
        shots: [14, 10] as [number, number],
        onTarget: [7, 4] as [number, number],
        corners: [5, 3] as [number, number],
        position: 2,
        points: 25,
        wins: 8,
        draws: 1,
        losses: 2,
        played: 11,
        balance: 50_000_000,
        leagueName: "OFM Elite League",
        income: 1_200_000,
        next: null,
      };

      const winReport = formatMatchReport(baseReport);
      expect(winReport).toContain("🟢 <b>G‘ALABA</b>");
      expect(winReport).toContain("<b>REAL MADRID 3–1 BARCELONA</b>");
      expect(winReport).toContain("⚽ <b>GOLLAR</b>");
      expect(winReport).toContain("17' Mbappé <i>(Bellingham)</i>");
      expect(winReport).toContain("To‘p nazorati: <b>54%</b> — 46%");
      expect(winReport).toContain("Zarbalar: <b>14</b> — 10");
      expect(winReport).toContain("Aniq zarbalar: <b>7</b> — 4");
      expect(winReport).toContain("📈 <b>LIGA</b>");
      expect(winReport).toContain("<b>2-o‘rin</b>");
      expect(winReport).toContain("25 ochko · 8W 1D 2L");

      const drawReport = formatMatchReport({ ...baseReport, homeGoals: 2, awayGoals: 2 });
      expect(drawReport).toContain("🟡 <b>DURANG</b>");

      const lossReport = formatMatchReport({ ...baseReport, homeGoals: 0, awayGoals: 1 });
      expect(lossReport).toContain("🔴 <b>MAG‘LUBIYAT</b>");
    });

    it("formatProfile manager profilini ixcham formatda ko'rsatadi", () => {
      const profile = {
        name: "Diyorbek",
        username: "diyorbek_anorboyev",
        rating: 1245,
        seasons: 5,
        titles: 2,
        wins: 40,
        draws: 10,
        losses: 10,
        matches: 60,
        points: 130,
        spend: 100_000_000,
        income: 150_000_000,
        biggest: 80_000_000,
      };

      const formatted = formatProfile(profile);
      expect(formatted).toContain("👤 <b>MANAGER PROFILI</b>");
      expect(formatted).toContain("<b>@diyorbek_anorboyev</b>");
      expect(formatted).toContain("⭐ Reyting: <b>1,245</b>");
      expect(formatted).toContain("🎮 Mavsumlar: 5");
      expect(formatted).toContain("🏆 Chempionlik: <b>2</b>");
    });
  });
});
