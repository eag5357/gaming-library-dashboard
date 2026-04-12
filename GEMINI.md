# Project Context: Unified Gaming Dashboard (Updated April 12, 2026)

## Current Status: Multi-Platform Vertical Slice (Steam + Xbox + PlayStation)
We have successfully implemented a cross-platform ETL pipeline and a unified dashboard.

### Core Features Completed
1.  **Multi-Platform Ingestion**:
    *   `sync-steam`: Fetches 300+ raw records via official Web API.
    *   `sync-xbox`: Fetches 70+ records via OpenXBL (xbl.io) using XUID-based logic.
    *   `sync-psn`: Full integration using `psn-api`. Features direct CLI mode (`--sync`) and automatic token rotation/bootstrapping via NPSSO.
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

## Next Steps
1.  **Xbox Playtime Stability**: Investigate why OpenXBL `/v2/titles` is missing `minutesPlayed` despite documentation, and resolve the 500 errors on specific stats endpoints.
2.  **User Auth**: Transition from public read policies to authenticated user sessions for account linking.
3.  **Cloud Deployment**: Deploy Edge Functions and migrations to Supabase Production.
4.  **Nintendo Integration**: Research and scaffold `sync-nintendo` (likely using browser automation/cookie extraction).
