# Connect Google Drive and Gemini

This version uses your Google Drive for uploaded media, Markdown files and JSON drafts. Supabase is still used for app login and the authenticated Gemini backend. You do not need Supabase file storage when Google Drive is selected.

## 1. Create your Google project

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project named **CreativeRelay**.
2. In APIs & Services → Library, enable **Google Drive API**.
3. Open Google Auth Platform. Set the app name and support email. Choose External if friends with personal Google accounts will use it. While testing, add yourself and your friends as test users.
4. Create an OAuth client of type **Web application**.
5. Add these Authorized JavaScript origins:
   - `http://127.0.0.1:5173` for the local preview.
   - `https://YOUR-GITHUB-USERNAME.github.io` for GitHub Pages (origin only, without repository path).
6. Copy the **client ID**, which ends in `.apps.googleusercontent.com`. Set `VITE_GOOGLE_CLIENT_ID` in `.env.local` and in GitHub repository Actions variables. This ID is public. The browser token flow does not use a client secret.
7. Configure the `https://www.googleapis.com/auth/drive.file` permission. It grants access to files this app creates or files you explicitly open with the app; it does not grant full-drive access.
8. For a public release, configure the consent-screen homepage and privacy information, and complete any verification Google requires. Testing configuration is for listed test users, not unrestricted public use.

Official instructions: [Google token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## 2. Create the Gemini API key

1. Open [Google AI Studio](https://aistudio.google.com/apikey) and create an API key in the intended project.
2. Keep that key private. Do not paste it into GitHub files, `VITE_*` variables, a frontend form or this chat.
3. In your Supabase project, open Edge Functions → Secrets and add:
   - `GEMINI_API_KEY`: the private API key.
   - `GEMINI_MODEL`: an available model supporting JSON structured output. Default in this build: `gemini-3.8-flash`. Confirm model availability for your account; change this server secret if necessary.
   - `APP_ORIGIN`: your app origin, e.g. `https://YOUR-GITHUB-USERNAME.github.io` (no repository path).
4. Deploy the included `supabase/functions/generate` function with JWT verification enabled. Include its `gemini.mjs` module; do not deploy only `index.ts`.
5. Apply `supabase/schema.sql` once in a new project. Existing projects using the previous release already have the quota function and do not need to re-run the schema.
6. Set your public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Follow README for email login and redirect configuration.

The simplest deployment from your computer uses the Supabase CLI:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy generate
```

Set private secrets through the dashboard to avoid recording keys in terminal history. The server validates your app login, enforces 20 generation requests per account per day, and calls Gemini. Set provider quotas/spending controls before inviting users. Free-tier limits and data use depend on your plan: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing).

## 3. Deploy and connect

1. Add the three public configuration values to repository Actions variables, then run the GitHub Pages deployment workflow.
2. Sign in to your app, open **Settings**, select **Google Drive**, and click **Connect Google Drive**.
3. Choose the intended Google account and grant the requested permission. The app finds or creates its **CreativeRelay** folder in that account.
4. Upload a small artwork, save a draft, then check the folder in Drive. Reopen the draft from the app library.
5. Click **Generate with Gemini**. Review the generated platform titles, captions, keywords and hashtags before publishing.

Each friend should connect their own Google account. Google Drive permission tokens are held in memory, never written to browser storage or exported with drafts. A page reload or expiry may require reconnecting Drive; your app login can remain signed in. Disconnect leaves your files intact and does not revoke Google's consent grant; manage/revoke that grant in your Google account permissions if desired.

## Storage behavior and limits

- Drive stores original media and thumbnails, `.md` articles, and `.creative-relay.json` draft metadata together in the app folder. Files are private; the app never adds public permissions.
- Drive storage uses the selected Google account's quota. This build caps each media file at 500 MB; Markdown uploads at 1 MB. Uploads use a resumable-upload session, but do not resume after a page close or retry chunk-by-chunk yet.
- If a save fails after a media upload, that uploaded file can remain in your app folder. Retrying in the same session reuses the saved reference. Do not delete it until the draft has saved successfully.
- Switching storage destinations does not move existing drafts. Select the previous destination to access them.
- Existing browser-only drafts are still available by choosing **This browser (offline)**. To copy one to Drive, connect Drive first (connecting resets the composer), select browser storage and reopen the local draft, switch storage to Drive, and save. Keep a backup export first.
- Google Drive is storage, not a social publisher or public video hosting/CDN. Instagram publishing will need appropriate media transfer; this build does not make files public to solve that.
- Gemini currently reads the heading, project facts and article text. Images/videos are not sent to Gemini for visual analysis in this version.

## Verification status

The source build, adapter request formats and failure handling are tested locally with mocked provider responses. Live connection requires your Google project, key and Supabase project; none have been provisioned by this build.



Existing users keep their working Drive OAuth client and existing One Station folder; the app finds it by its unchanged internal marker. New folders use CreativeRelay. Use the new CreativeRelay Google project for the Gemini API key; do not replace the working Drive Client ID.

## Media analysis update
Replace both generate/index.ts and generate/gemini.mjs in the deployed Supabase function, then redeploy. No secret or schema changes required. The composer can send an explicitly selected image/video to Gemini using inline media (12 MB limit). Original Drive uploads retain their existing limits. Review captions before use; social publishing remains unconnected.
