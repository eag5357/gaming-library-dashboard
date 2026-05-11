# Project Context: Unified Gaming Dashboard (Updated April 12, 2026)

## Current Status: Multi-Platform Vertical Slice (Steam + Xbox + PlayStation)
We have successfully implemented a cross-platform ETL pipeline and a unified dashboard.

**Local Development Environment:**
*   **Frontend**: Running at [http://localhost:5173/](http://localhost:5173/) (Vite)
*   **Backend**: Local Supabase stack is active.
    *   Studio: [http://127.0.0.1:54323](http://127.0.0.1:54323)
    *   API URL: [http://127.0.0.1:54321](http://127.0.0.1:54321)

### Core Features Completed
1.  **Multi-Platform Ingestion**:
    *   `sync-steam`: Fetches 300+ raw records via official Web API.
    *   `sync-xbox`: Fetches 70+ records via OpenXBL (xbl.io) using XUID-based logic.
    *   `sync-psn`: Full integration using `psn-api`. Features direct CLI mode (`--sync`) and automatic token rotation/bootstrapping via NPSSO.
    *   `sync-nintendo`: **[NEW]** Multi-source sync using `nxapi`. Supports Coral (NSO App) for recent activity and Moon (Parental Controls) for precise, historical playtime.
2.  **Advanced Normalization**:
    *   `normalize-games`: Uses fuzzy matching and title sanitization (aggressive noise removal and space collapsing) to unify raw data with IGDB metadata.
    *   Successfully handles merging duplicates across platforms (e.g., matching Elden Ring on Steam, Xbox, and PSN to one canonical entry).
3.  **Frontend Dashboard**:
    *   **Responsive UI**: 4-column grid (desktop) scaling down to 1-column (mobile).
    *   **Interactive Features**: Real-time search, sorting (Alphabetical, Most Played, Most Recent).
    *   **Aggregation**: Automatically displays multiple platform badges per card and sums total playtime across all sources.
    *   **Stats Header**: Displays Total Library Count, Cumulative Playtime, and the #1 Most Played Game.
    *   **Platform Theming**: Color-coded badges for Steam (#171a21), Xbox (#107c10), PlayStation (#003087), and Nintendo (#e60012).

### Infrastructure
*   **Database**: PostgreSQL with RLS public read policies and unique constraints on `igdb_id`.
*   **Data Pattern**: Raw JSON payloads are stored in `platform_games` before being linked to canonical `games`.
*   **Security & Privacy**: The agent **MUST NOT** read, write, or attempt to access the `.env` file. All environment variables must be managed manually by the user or provided in instructions.
*   **Environment Constraint**: Due to local CLI limitations, Supabase Edge Functions **must be run directly via Deno** rather than using `supabase functions serve`.
    *   Example: `deno run --allow-net --allow-env --env-file=.env supabase/functions/sync-psn/index.ts --sync`

## Operational Rules
*   **Context Management**: The agent **MUST** update `GEMINI.md` after every command executed and task completed to summarize the results and save on context for future turns.

### Security & Audit Logs
*   **2026-05-11**: Full repository scan for hardcoded secrets.
    *   Verified `.gitignore` properly excludes `.env`.
    *   Confirmed all Edge Functions (`sync-*`, `normalize-games`) use `Deno.env.get` for credentials.
    *   Frontend verified to use `import.meta.env` for Supabase keys.
    *   No hardcoded API keys or sensitive tokens found in source code or migrations.
*   **2026-05-11**: Database Schema Update.
    *   Added `v_games_with_stats` view to aggregate `playtime_minutes` and `platforms` at the database level.
    *   Applied migration `20260511000000_create_unified_stats_view.sql`.
    *   Updated `frontend/src/App.tsx` to utilize the new view, simplifying client-side logic.
*   **2026-05-11**: Data Restoration & Recovery.
    *   Database was wiped during `supabase db reset` (no `seed.sql`).
    *   Recovered Xbox XUID and PSN Account ID via API lookups.
    *   Manually re-seeded `linked_accounts` with STEAM_ID, XBOX_XUID, and PSN_ID.
    *   Fixed `sync-xbox` to handle JSON-stringified `content` from OpenXBL.
    *   Fixed all sync functions to support `--sync` flag and exit properly.
    *   Verified Steam (300+ games) and PSN (50+ titles) are correctly linked and showing playtime.
*   **2026-05-11**: Final Security Audit.
    *   Performed comprehensive scan for hardcoded secrets, API keys, and sensitive tokens.
    *   Confirmed all Edge Functions and Frontend logic utilize environment variables exclusively.
    *   Verified `.gitignore` properly excludes `.env` across the entire workspace.
    *   No hardcoded credentials found in source code, migrations, or documentation.
*   **2026-05-11**: Xbox Playtime Reliability Fix.
    *   **Technical Root Cause**: The OpenXBL `v2/stats/player/{xuid}/title/{titleId}` endpoint (standard UserStats) returned 500 "NOT_FOUND" for many modern titles (e.g., *Sea of Stars*, *Starfield*) and 0 for others. This is likely due to how modern Xbox titles (GDK-based) report stats compared to legacy (XDK) titles.
    *   **Solution**: Switched to the `v2/achievements/stats/{titleId}` endpoint. This endpoint consistently returns the `MinutesPlayed` stat for both modern and legacy titles, provided the user's privacy settings allow it.
    *   **Implementation**: Updated `sync-xbox` to prioritize this endpoint. It iterates through the user's title history and fetches the `MinutesPlayed` value from the `statlistscollection`.
    *   **Verification**: Verified full sync successfully retrieves playtime for 70+ Xbox titles, including problematic ones.
*   **2026-05-11**: User Authentication Implementation.
    *   Added `user_id` column to `linked_accounts` table.
    *   Established Row Level Security (RLS) policies for `linked_accounts` and `play_stats` to ensure data isolation.
    *   Updated `v_games_with_stats` view to support per-user aggregation and filtering.
    *   Prepared database for authenticated user sessions.
*   **2026-05-11**: Nintendo Sync Refinement & Session Stability.
    *   **Session Longevity**: Research confirms Nintendo Account Session Tokens are long-lived (typically **2 years**).
    *   **Auto-Refresh**: The `nxapi` library automatically handles the 15-minute `id_token` and 2-hour Web Service token refreshes as long as the base Session Token is valid.
    *   **Stability**: The current implementation using `createWithSessionToken` is robust for long-term background syncing without requiring frequent user re-authentication.

## Next Steps
1.  **Frontend Polish**: Enhance the dashboard UI with better loading states and empty library placeholders.
2.  **Manual Account Linking UI**: (Completed) Settings page implemented for user-driven platform ID entry.
3.  **Cloud Deployment**: (Prepared) Pending project linking and secret configuration in Supabase Cloud.
4.  **Nintendo Sync Refinement**: (Refined) Documented session stability; further refinement pending long-term testing.

