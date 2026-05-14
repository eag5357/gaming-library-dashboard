# Production Deployment Guide

Follow these steps to deploy the Unified Gaming Dashboard to Supabase Cloud and Vercel.

## 1. Supabase Backend Deployment

### Prerequisites
- Install [Supabase CLI](https://supabase.com/docs/guides/cli)
- Create a new project in the [Supabase Dashboard](https://supabase.com/dashboard)

### Steps
1. **Link your project**:
   ```bash
   supabase link --project-ref <your-project-ref>
   ```
2. **Push Database Schema**:
   ```bash
   supabase db push
   ```
3. **Set Secrets**:
   Set all required API keys for the Edge Functions.
   ```bash
   supabase secrets set STEAM_API_KEY=...
   supabase secrets set OPENXBL_API_KEY=...
   supabase secrets set PSN_NPSSO=...
   supabase secrets set TWITCH_CLIENT_ID=...
   supabase secrets set TWITCH_CLIENT_SECRET=...
   supabase secrets set NINTENDO_SESSION_TOKEN=...
   ```
4. **Deploy Edge Functions**:
   ```bash
   supabase functions deploy
   ```
5. **Configure Cron Secrets (Important)**:
   The daily sync cron job requires the `SERVICE_ROLE_KEY` to be in the Supabase Vault.
   - Go to **Supabase Dashboard** -> **Vault** -> **Secrets**.
   - Add new secrets:
     - **Name**: `SERVICE_ROLE_KEY`
     - **Secret**: (Your project's service_role key from Settings -> API)
     - **Name**: `API_URL`
     - **Secret**: `https://<your-project-ref>.supabase.co` (No trailing slash)

## 2. Vercel Frontend Deployment

### Prerequisites
- [Vercel CLI](https://vercel.com/docs/cli) or GitHub integration.

### Steps
1. **Deploy via Vercel Dashboard**:
   - Point to the `frontend/` directory.
   - Set **Build Command**: `npm run build`
   - Set **Output Directory**: `dist`
   - Set **Environment Variables**:
     - `VITE_SUPABASE_URL`: Your production Supabase URL.
     - `VITE_SUPABASE_ANON_KEY`: Your production Supabase Anon Key.
2. **Framework Preset**: Select **Vite**.

## 3. Configure Supabase Auth Redirects

To ensure users are redirected back to your application after logging in, you must register your Vercel URL in the Supabase Dashboard.

### Steps
1.  **Copy your Vercel URL**: Go to your Vercel Project Dashboard and copy your deployment URL (e.g., `https://your-project.vercel.app`).
2.  **Go to Supabase Dashboard**: Select your project.
3.  **Navigate to Auth Settings**: Click on **Authentication** (sidebar) -> **URL Configuration**.
4.  **Update Site URL (Primary Redirect)**:
    *   Change the **Site URL** to your Vercel URL: `https://your-project.vercel.app`
    *   **CRITICAL**: This URL is used as the base for all system emails (Confirm Email, Password Reset). If this is still `localhost:3000`, your emails will redirect to the wrong place.
5.  **Add Redirect URLs (Additional Allowed Paths)**:
    *   In the **Redirect URLs** section, click **Add URL**.
    *   Add your Vercel URL again: `https://your-project.vercel.app/**` (The `/**` wildcard ensures all sub-pages work).
    *   (Optional) If you want to continue testing locally, ensure `http://localhost:5173/**` is also in this list.
6.  **Save Changes**: Click **Save** at the bottom of the page.

## 4. Verification
1. Open your Vercel URL.
2. Verify you can sign in.
3. Check **Supabase Edge Function Logs** for the `sync-all` function to ensure it's triggered.
4. Verify the `pg_cron` schedule in the **Supabase SQL Editor**:
   ```sql
   SELECT * FROM cron.job;
   ```

## 5. Secret Management
- **Never** commit `.env` or `.env.local` files.
- Always use `supabase secrets set` for backend keys.
- Always use Vercel Dashboard for frontend keys.
