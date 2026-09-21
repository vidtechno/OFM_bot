# OFM Game roadmap

## Completed

- PHASE 1 — bootstrap, Telegram, Supabase, user registration
- PHASE 2 — competitions, public leagues, AI ownership, club claiming, dashboard
- PHASE 3 — official EA FC 27 provider, 1,160 players, attributes and 40 current 2026/27 squads
- PHASE 4 — formations, automatic Starting XI, tactics and effective ratings
- PHASE 5 — balanced 38-round fixtures and twice-daily scheduling
- PHASE 6 — deterministic match engine, events, statistics, results and league table
- PHASE 7 — club balances, match income, result bonuses and finance ledger
- PHASE 8 — atomic human/AI offers, counters, expiry and anti-exploit controls
- PHASE 9 — persistent global transfer market with controlled supply
- PHASE 10 — cached AI club strategies with rule-based fallback
- PHASE 11 — sponsor contracts and Telegram membership eligibility
- PHASE 12 — manager career profiles, ELO rating and leaderboards
- PHASE 13 — secure Telegram admin dashboard, user blocking, sponsor controls, statistics and audit log

## PHASE 13 — Admin control center

Admin access is based on immutable Telegram IDs from `ADMIN_TELEGRAM_IDS`, never usernames.

### Navigation

- Admin-only `🛠 Admin panel` Reply Keyboard button
- Dashboard with inline submenus and explicit back navigation
- Regular users never receive or access admin callbacks

### User management

- Search by Telegram ID, username or internal user ID
- View profile, managed clubs, balances and recent actions
- Block/unblock bot access with reason
- Remove or transfer club ownership through audited operations
- Apply balance corrections through finance transactions, not direct balance edits

### Sponsor and mandatory-channel management

- Create, edit, activate and pause sponsors
- Configure payment per match and membership requirement
- Add/remove mandatory Telegram channels
- Validate bot admin/member-check permissions
- View eligibility and failed membership checks

### Game operations

- View/create public league instances
- Pause/resume a league and inspect occupancy
- Inspect scheduled jobs and safely retry idempotent failures
- Trigger controlled market refresh or AI strategy refresh
- View match processing status without manually editing results

### Statistics and monitoring

- Total/active/blocked users
- Human vs AI clubs and league occupancy
- Matches processed, transfer volume and game economy totals
- Sponsor eligibility and payment metrics
- Telegram, scheduled-job and OpenAI failures

### Safety

- Atomic privileged RPCs with service-role backend access
- Confirmation step for destructive or financial actions
- `admin_audit_log` records actor, action, target, before/after metadata and timestamp
- Pagination, rate limits and short callback payloads
- Secrets are never displayed in Telegram

Initial admin Telegram ID: `6117815120`.
