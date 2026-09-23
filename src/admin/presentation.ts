import type { AdminSponsor, AdminStats, AdminUser, LaunchDashboardStats } from "./admin.repository.js";
import { escapeHtml, formatMoney } from "../lib/html.js";

export const formatAdminStats = (s: AdminStats) => [
  "🛠 <b>ADMIN BOSHQARUV PANELI</b>",
  "",
  `👤 Foydalanuvchilar: <b>${s.users}</b> · Faol: <b>${s.activeUsers}</b> · Blok: <b>${s.blockedUsers}</b>`,
  `🏆 Jami aktiv ligalar: <b>${s.activeLeagues}</b> · Ochiq lobbilar: <b>${s.openLobbies}</b>`,
  `🏟 Klublar: <b>${s.humanClubs}</b> manager · <b>${s.aiClubs}</b> AI`,
  `⚽ O‘yinlar: <b>${s.matches}</b>`,
  `🔄 Takliflar: <b>${s.offers}</b>`,
  `🛒 Faol listinglar: <b>${s.activeListings}</b>`,
].join("\n");

export const formatLaunchDashboard = (s: LaunchDashboardStats) => [
  "📊 <b>LAUNCH DASHBOARD</b>", "",
  `👥 Jami users: <b>${s.users.toLocaleString("en-US")}</b>`,
  `🆕 Bugun: <b>+${s.todayUsers.toLocaleString("en-US")}</b>`, "",
  `🎮 Active managers: <b>${s.activeManagers.toLocaleString("en-US")}</b>`,
  `🏟 Claimed clubs: <b>${s.claimedClubs.toLocaleString("en-US")}</b>`,
  `🏆 Active leagues: <b>${s.activeLeagues.toLocaleString("en-US")}</b>`, "",
  `⚽ Completed matches: <b>${s.completedMatches.toLocaleString("en-US")}</b>`,
  `🔁 Transfers: <b>${s.transfers.toLocaleString("en-US")}</b>`, "",
  "⭐ <b>STARS</b>",
  `Attempts: <b>${s.starsAttempts}</b>`,
  `✅ Paid: <b>${s.starsPaid}</b>`,
  `↩️ Refunded: <b>${s.starsRefunded}</b>`,
  `⏳ Pending: <b>${s.starsPending}</b>`,
  `❌ Failed/cancelled: <b>${s.starsFailed}</b>`,
].join("\n");

export const formatAdminUsers = (rows: AdminUser[]) => [
  "👥 <b>FOYDALANUVCHILAR</b>",
  "",
  ...rows.map(
    (u, i) =>
      `${i + 1}. <b>${escapeHtml(u.username ? `@${u.username}` : u.name)}</b> · <code>${u.telegramId}</code> · <i>${u.blocked ? "BLOCKED" : "ACTIVE"}</i>`
  ),
].join("\n");

export const formatAdminSponsors = (rows: AdminSponsor[]) => [
  "💰 <b>HOMIYLAR</b>",
  "",
  ...rows.map(
    (s, i) =>
      `${i + 1}. <b>${escapeHtml(s.name)}</b> — <b>${formatMoney(s.payment)}</b> · <i>${s.active ? "ACTIVE" : "PAUSED"}</i>\n   Kanal: <i>${escapeHtml(s.channel ?? (s.channelId ? String(s.channelId) : "sozlanmagan"))}</i>`
  ),
].join("\n");
