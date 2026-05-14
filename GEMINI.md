# Project Context: Unified Gaming Dashboard (Updated May 13, 2026)

## Current Status: Production-Ready Orchestration
We have successfully implemented a master orchestration layer and a scheduled synchronization pipeline, enabling a fully automated daily refresh of all gaming libraries.

### Core Features Completed
1.  **Multi-Platform Ingestion**:
    *   `sync-steam`, `sync-xbox`, `sync-psn`, `sync-nintendo`: Individual platform workers.
    *   **Master Orchestrator (`sync-all`)**: A new Edge Function that triggers all platform syncs sequentially.
2.  **Automated Scheduling**:
    *   **`pg_cron` Integration**: A daily database job (3:00 AM UTC) triggers the `sync-all` function via `pg_net`.
    *   **Secure Auth**: Uses Supabase Vault (`vault.secrets`) to store the `SERVICE_ROLE_KEY` for secure internal function calls.
3.  **Frontend Production Prep**:
    *   **Vercel Optimized**: Added `vercel.json` for SPA routing and standardized environment variable handling.
    *   **Deployment Guide**: Created `PROD_DEPLOY.md` with step-by-step instructions for Supabase and Vercel.
4.  **Advanced Normalization**:
    *   `normalize-games`: Automatically invoked by platform workers or the master orchestrator.
5.  **Verified**: 16 backend unit tests passing (Orchestrator test added; non-existent tests removed).

### Infrastructure
*   **Database**: PostgreSQL with RLS, `pg_cron`, and `pg_net` extensions enabled.
*   **Secret Management**: Implemented a Zero-Trust approach using `.env.local` (Local), Vercel Dashboard (Frontend Prod), and `supabase secrets` / `vault` (Backend Prod).

## Operational Rules
*   **Context Management**: The agent **MUST** update `GEMINI.md` after every major task.
*   **Commit Mandate**: The agent **MUST NEVER** stage or commit changes if the test suite (`make test`) fails.

### Security & Audit Logs
*   **2026-05-11**: Full repository security scan; no hardcoded secrets found. Applied unified stats view. Fixed Xbox playtime reliability.
*   **2026-05-12**: Authentication Verification & Test Infrastructure.
    *   Refactored `auth-steam`, `auth-xbox`, and `auth-nintendo` for testability.
    *   Implemented 17 backend unit tests with mocked provider flows.
    *   Resolved `BOOT_ERROR` in local runtime by restoring explicit paths and re-enabling JWT verification.
    *   Added **Manual ID entry** to `AccountSettings.tsx` for Steam and Xbox as a robust local development workaround.
*   **2026-05-13**: Nintendo Sync Recovery & Production Orchestration.
    *   Bypassed `UpdateRequiredException` for Nintendo (Switch 2 support).
    *   Implemented fallback to Daily Summaries for recent console activity.
    *   Integrated `normalize-games` invocation into all platform sync scripts.
    *   **Productionalization**: Created `sync-all` master orchestrator, daily `pg_cron` schedule, and Vercel optimization.
    *   Verified end-to-end sync and normalization for **Red Dead Redemption** and **Cyberpunk 2077**.

## Next Steps
1.  **Deployment**: Follow `PROD_DEPLOY.md` to link and push to Supabase Cloud.
2.  **Monitoring**: Monitor `sync-all` logs in the Supabase dashboard after the first scheduled run.
