# Sortify

A private music organizer: connect Spotify → choose sources → organize → review and edit → approve → create new private playlists.

Standard Next.js 16 / React 19, Drizzle on Neon Postgres, Spotify Authorization Code OAuth, and Inngest durable jobs. ReccoBeats enrichment runs only on the server. No legacy database is migrated.

## Run locally

Use Node 22.13 or newer. `npm install`, copy `.env.example` into `.env.local`, and fill in the configuration. Existing `.env` was deliberately preserved; update the old Spotify redirect in the Spotify developer dashboard and your local environment to `http://127.0.0.1:3000/api/spotify/callback`.

- Use a fresh Neon database and set `DATABASE_URL`; do not point this migration at a legacy database.
- Set Spotify client ID, client secret, and exact redirect URI.
- Set `TOKEN_ENCRYPTION_KEY` to 32 random bytes encoded in base64 (`openssl rand -base64 32`). Changing it invalidates existing encrypted tokens.
- Sortify accepts all Spotify accounts that Spotify permits to authorize your app; there is no application account allowlist.
- Set `APP_URL` to the public origin, or the local origin above.

Run `npm run db:migrate`, then `npm run dev -- --hostname 127.0.0.1`. Start Inngest local development with `npx inngest-cli@latest dev -u http://127.0.0.1:3000/api/inngest`. Local Inngest does not require cloud keys.

## Deploy on Vercel

Use the standard Next.js preset and Node 22 or newer. Configure the same environment variables, production Spotify callback, and Inngest event/signing keys. Run the migration against the fresh Neon database before onboarding. Register `/api/inngest` with Inngest (or use its Vercel integration). Both job functions are exposed there; the route has a 60-second execution budget and work is broken into durable steps.

Confirm the Spotify app's quota/access mode, owner Premium subscription, and account allowlist in the developer dashboard before live testing. Development Mode imports only owned or collaborative playlists, plus Liked Songs. Requests use `/items` and `POST /me/playlists`.

Use the current stable production domain for the Inngest app URL (`https://sortifi.vercel.app/api/inngest`). After changing a Vercel domain, resync the Inngest app with the new URL and confirm a successful sync; events can be accepted while jobs fail against an obsolete URL. Queued jobs offer **Retry start**, and rejected event dispatches surface a recoverable failure instead of an indefinite progress screen.

## Checks

`npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`. With the local server running, `npm run test:browser` exercises mocked source/progress/editor/approval/publication screens and real unauthenticated OAuth/CSRF endpoints. Browser checks use installed Chrome by default; set `QA_CHROME_EXECUTABLE` for another installation. `npm run probe:recco` performs a read-only, two-ID provider contract probe.

See [validation and live rollout](docs/validation.md) and [implementation details](docs/architecture.md).
See [SEO rollout, Search Console setup and earned-backlink strategy](docs/seo.md)
for indexing configuration, isolated browser QA and remaining production checks.

## Preservation

The replaced dirty and untracked workspace was archived at `.local-backups/pre-spotify-rebuild-20260918-043507/workspace.tar.gz`, with a manifest and Git status. Secrets, generated artifacts, dependencies, and internal runtime state were excluded. The original `.env` remains local and ignored. The repository history is retained.

## About the creator

Created by [Animesh Sharma](https://animesh.cc). For product design and development work, visit [Hire Animesh](https://hire.animesh.cc).
