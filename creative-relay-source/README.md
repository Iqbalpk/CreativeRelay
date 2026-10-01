# CreativeRelay

A responsive, installable web app for preparing creative posts and Markdown blogs. Built for GitHub Pages, with Google Drive storage, optional Supabase accounts and a Gemini backend.

## Working in this build

- Login, signup, password reset and persistent cloud sessions when Supabase is configured.
- Local studio without creating an account, with IndexedDB drafts and image/video files.
- Work and Blog modes, `.md` upload, sanitized article preview, thumbnail and video-cover upload.
- Editable platform-specific captions, honest writing-template fallback, AI generation through the included server function when deployed.
- Private Google Drive uploads and drafts in a CreativeRelay folder. Friends connect their own Google Drive. Supabase login is still used for authenticated Gemini calls.
- JSON post-pack and Markdown export. Full artwork preview without destructive cropping.
- Responsive phone interface, install manifest and service worker.

## Not yet implemented

Social OAuth connectors, live platform publishing, scheduled jobs, automatic video conversion/subtitles, analytics, extra-platform plugins, and native iOS/Android store builds. No button pretends to publish. Behance is a manual project workflow until a supported publishing integration is verified. Blog uploads prepare/export articles; a live blog destination is not configured.

## Run locally

Install Node 22+, then run `npm ci` and `npm run dev`. For the production build run `npm run build`.

Local studio is device storage, not authentication or cross-device sync. Export backups before clearing browser storage. Cloud accounts are required for friends to have private shared-service accounts.

## Google Drive and Gemini setup

Start with [GOOGLE-SETUP.md](GOOGLE-SETUP.md). It covers Google Cloud OAuth, your private Gemini key, deployment and live checks.

## Cloud login setup

1. Create a Supabase project. Run `supabase/schema.sql` once in its SQL editor.
2. Copy `.env.example` to `.env.local`. Set your project URL and **anon/publishable** key. Never use the service-role key in the frontend.
3. In Supabase Authentication, enable email/password and email confirmation. Add your hosted app URL as Site URL and allowed redirect URL. Configure production email delivery before inviting friends.
4. Deploy `supabase/functions/generate` with JWT verification enabled. Set server secrets `GEMINI_API_KEY`, optional `GEMINI_MODEL`, and `APP_ORIGIN` to the exact hosted origin (for GitHub Pages, `https://YOURNAME.github.io`). The function authenticates callers and limits generation to 20 requests per account per day. Set provider spending limits too; this does not cap signup abuse.
5. Test two accounts: one account must not be able to see or edit the other's drafts or stored files. AI calls send supplied heading/facts/article to the AI provider. This version generates from text facts, not image/video vision analysis.

Google Drive is the default storage destination; the app caps Drive media uploads at 500 MB. Browser/Supabase media uploads remain capped at 50 MB. All storage has account-specific quotas. See GOOGLE-SETUP.md for detailed setup and reconnect behavior.

## GitHub Pages deployment

1. Create a new public GitHub repository and upload this folder's contents (not `node_modules`, `.env.local`, or credentials). Include `package-lock.json`.
2. Set repository Actions variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_GOOGLE_CLIENT_ID`. These are public frontend configuration; private API keys belong only in backend secrets.
3. In Settings → Pages, select GitHub Actions. Push to `main`; the included workflow builds and deploys `dist`.
4. Open the HTTPS URL on mobile. Choose Add to Home Screen / Install app. Login uses the browser's persisted Supabase session; periodic reauthentication can still be required.

GitHub Pages hosts static files only. Supabase runs authentication/database/storage/functions. Free hosting does not make AI calls, X usage, email delivery or unlimited video storage free. Before using Pages for a paid commercial SaaS, review its usage restrictions and use suitable hosting.

## Next integration milestone

Register platform developer apps, implement OAuth callbacks and encrypted server-side token storage, then add publish adapters with scope checks, upload processing, idempotent job records and per-platform result links. Do not store social access tokens in public repo files or frontend configuration. Scheduling needs a server worker; a closed mobile browser cannot reliably run scheduled posts.

For blog destinations, first choose your own website, Dev.to, WordPress or another supported API. Preserve Markdown and explicit author attribution. For multi-account public launch, add account abuse controls, monitoring, data export/deletion and an appropriate privacy notice before onboarding friends.


