# My blogs — deletion first

Adds a signed-in **My blogs** section with owner-only listing, title search, status filters, newest/oldest/title sorting, editing, recoverable Delete, and Restore. Public rearranging is deferred as requested. Counts describe blog records; visitor analytics are not fabricated.

Deletion changes the existing article to non-public `preparing` status. Its public article endpoint returns 404 and it disappears from the collection, while the article and cover remain available to restore under the same ID. Existing posts on social networks are separate and are not deleted or reposted. Editing updates the existing CreativeRelay article rather than sharing a new social post.

All management requests require the existing Supabase login and a matching user ID. Every database read/write is scoped to the authenticated owner. Changes rotate the article's existing payload hash as an opaque version; stale edits/deletions are rejected. Rotating this version also prevents replaying an old publish request from accidentally reviving a deleted article. Restore is the intended way to reactivate it.

## Deployment sequence

1. Back up the deployed `blog` Edge Function source.
2. Deploy `supabase/functions/blog/index.ts` to the existing `blog` function in project `zymtasgzqcnlzqgqigqt`. Keep its existing secrets, gateway settings and authentication configuration. **No SQL migration or permission change is required.**
3. Verify public collection and article GET requests still work and unauthenticated management POST returns 401.
4. Merge/deploy the frontend through the existing GitHub Pages workflow.
5. Reopen CreativeRelay, sign in and open **My blogs**. Check listing and edit/delete confirmation. Do not delete a user's real article merely to test deployment.

Do not deploy the frontend before the backend management actions are available. The current public app remains unchanged until deployment is completed.

## Validation already completed locally

- Six backend integration tests against a real embedded PostgreSQL engine: unauthenticated/forged-owner rejection, owner-scoped list/counts, cross-account mutation denial, delete → public 404 / collection removal → restore with same link/cover, edit with stale-version protection, and bounded search/filter requests.
- Four DOM workflow tests: Delete requires confirmation of the named article, Delete/Restore use the same ID, editing loads existing content and closes private dialogs on navigation, and account change prevents submitting an old confirmation.
- Existing 24 app regression tests pass.
- Production build passes both without cloud configuration and with test cloud configuration to include the complete management UI.

Test harnesses and implementation backups are retained in the task workspace under `work/blog-manager-tests` and `outputs/blog-manager`. No existing production article has been deleted by the assistant during this work.
