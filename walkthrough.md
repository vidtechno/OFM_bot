# OFM Bot: Production Audit & Overhaul Walkthrough

## Executive Summary
This production update covers the complete overhaul of **Liga Lifecycle**, **Transfer System**, **Negotiation State Machine**, **Ghost Budget Bug Fix**, **Carlos Espí Visibility Bug Fix**, and **AI Schedulers** on the live Frankfurt Supabase project (`fcwonehtpuyzdyuxcvre`, `eu-central-1`).

---

## 1. League Lifecycle & Automated Lobbies
- **Removal of Private League / Code Joining**:
  - Removed "🔒 Private liga yaratish" (`pv`) and "🔑 Kod bilan qo‘shilish" (`pj`) from public bot menus.
  - Users only join bot-created public leagues.
- **Automated Open Lobbies**:
  - 12-hour registration lobbies created automatically at **07:00** and **19:00** for Premier League and LaLiga.
  - Automatically ensures at least 1 `OPEN` lobby with available clubs (<20 claimed) is always open for each competition via `ensure_open_lobby_available()` RPC.
  - If a lobby fills to 20/20 human managers, registration closes immediately and a new open lobby is triggered.
  - Verified live on Frankfurt DB:
    - `LaLiga #2 (OPEN)`: closes at `2026-09-22T18:53:23.553651+00:00`.
    - `Premier League #2 (OPEN)`: closes at `2026-09-22T18:53:23.553651+00:00`.
- **Pre-Season Transfer Lock**:
  - While a league has status `OPEN`, all transfer actions (Transfer Market purchases, offers via Ligadan izlash, Global Market, selling candidates) are strictly locked with notice:
    `⏳ DIQQAT: Liga hali boshlanmagan (Pre-season). Barcha transferlar liga startidan keyin ochiladi.`
  - Lineups, tactics, and squad browsing remain fully operational during pre-season.

---

## 2. Transfer System & Bug Fixes
- **Root Cause & Fix for "Futbolchi sotish"**:
  - **Root Cause**: `saleCandidates` selected `is_starting`, which does not exist on the `club_players` table. PostgREST returned error `column club_players.is_starting does not exist`, causing the callback to fail.
  - **Fix**: Query `lineup_players` join `lineups` to check actual starting XI membership dynamically.
  - **Verification**: Real Madrid's 32 players queried successfully; exactly 11 players identified as starting XI (`K. Mbappé`, `T. Courtois`, `J. Bellingham`, etc.).
- **Starting XI Selling Confirmation**:
  - If player is in Starting XI: displays warning dialog `⚠️ Bu futbolchi Starting XI tarkibida.` with `[✅ Baribir sotuvga qo‘yish]` and `[❌ Bekor qilish]`.
  - Preset options: `+10%`, `+20%`, `+30%`, `[⌨️ Boshqa narx]`.
  - Delist option: `[❌ Sotuvdan olish]` for active listings.
- **Root Cause & Fix for Carlos Espí Visibility Bug**:
  - **Root Cause**: In `clubTargets` (Ligadan izlash), a filter excluded any player with `resale_locked_until > now()`. When Carlos Espí was purchased, a 48-hour resale lock was applied, which caused him to be completely filtered out of Athletic Club's squad view.
  - **Fix**: Removed the exclusion filter in `clubTargets`. All squad players remain visible, with `isResaleLocked: true` indicating temporary resale protection.
  - **Verification**: Athletic Club squad returned 33 players, including `Carlos Espí` (⭐77, €48.2M, `isResaleLocked: true`).
- **Root Cause & Fix for Ghost Reserved Budget (Yamal Bug)**:
  - **Root Cause**: In `create_transfer_offer` and `respond_transfer_offer`, when an offer transitioned to `COUNTERED`, the buyer's previously held reservation in `reserved_transfer_budget` was never released.
  - **Fix**: In migration `202609220025_league_lifecycle_and_transfer_lock.sql`, when status becomes `COUNTERED`, the old reservation is released immediately (`reserved_transfer_budget = greatest(0, reserved_transfer_budget - amount)`). When the user accepts the counter, the counter amount is verified and reserved atomically.
  - **Verification**: Cleaned up legacy ghost reservations on live DB; all clubs with `reserved_transfer_budget > 0` now have an exact 1:1 match with active pending offers.

---

## 3. Transfer Hub UI
- Accessible exclusively via `Klubim` -> `Transfer`.
- Persistent reply keyboard contains only `⚽ Klubim`, `🏆 Ligalar`, `👤 Profil`, `🛠 Admin panel`.
- Transfer Hub displays:
  ```
  🔁 REAL MADRID — TRANSFER

  💰 Transfer budjeti: €150.0M
  🔒 Band qilingan: €0.0M
  ✅ Mavjud: €150.0M
  🏦 G‘azna: €120.0M
  ```
- Buttons layout:
  - Row 1: `[🛒 Transfer bozori]` `[🔎 Ligadan izlash]`
  - Row 2: `[🌍 Global Transfer]` `[📤 Futbolchi sotish]`
  - Row 3: `[📥 Takliflar]` `[📜 Transfer tarixi]`
  - Row 4: `[↩️ Klubga qaytish]`

---

## 4. AI Transfer Engine (`gpt-4o-mini`)
- **Restricted to ACTIVE Leagues**: AI transfer activity (listings, buying, trades) only executes on leagues where `league_instances.status = 'ACTIVE'`.
- **Early Season Star Protection**: AI clubs never list 85+ OVR stars or starting XI players during rounds 1-2.
- **Fixed Query**: Removed non-existent `is_starting` column reference from `ai-transfer-engine.ts`.

---

## 5. Deployment & Verification Summary
- **Migration**: `supabase/migrations/202609220025_league_lifecycle_and_transfer_lock.sql` applied cleanly to Frankfurt Supabase.
- **Edge Function**: Bundle compiled (165.5kb) and deployed to `fcwonehtpuyzdyuxcvre` via `npx supabase functions deploy telegram-webhook --no-verify-jwt`.
- **Webhook Status**: `FAOL (Active)` with 0 pending updates.
- **Automated Tests**: 27 test files, 78/78 tests passing (`npm run check`).
- **Git Commit**: `bbbf4b5` pushed to `origin main`.
