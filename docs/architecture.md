# Implementation

## Storage and authentication

The Turso/libSQL migration creates users, hashed server-side sessions, runs, a global public-feature cache, and per-suggestion publication operations. Account identity is the Spotify profile ID, not email. Sortify accepts any Spotify account permitted to authorize the Spotify app, without an application account allowlist. Tokens use authenticated AES-256-GCM encryption with a unique nonce. Refresh runs inside a libSQL write transaction (serialized by the database writer lock) to serialize rotation across requests. Sessions last seven days, use HttpOnly/SameSite=Lax cookies (Secure in production), and are rotated at sign-in. OAuth state is random, cookie-bound, expires after ten minutes, and is cleared before code exchange. Disconnect deletes credentials, sessions, and user runs. Mutating app endpoints require an exact same-origin header and an authenticated session. Run reads and mutations scope to the session user.

## Jobs and checkpoints

A partial unique SQLite index enforces one active organization or publication run per user. Inngest limits execution to one invocation per run for each job type. Import page cursors, completed-source IDs, and enrichment cursors are persisted in addition to Inngest steps, so fresh resume events do not inflate counts or repeat completed pages of work. Spotify pagination rejects unexpected origins and repeated links. Imports deduplicate IDs while retaining all source memberships. Local files, episodes, missing and unplayable tracks are skipped.

Import is checkpointed per source page, enrichment per two tracks. Step outputs contain small cursors/counts instead of full libraries. Provider retries have a 45-second transport budget. Cancellation is checked between steps and persisted updates require a non-cancelled run. Publishing cannot be cancelled once approved writes have started. Transport uses timeouts, bounded retries, and Retry-After handling. Large Retry-After values return control to durable retries rather than holding a Vercel request open. Non-idempotent writes never retry network failures or 5xx responses inside the transport.

Successful ReccoBeats features cache for thirty days, confirmed missing matches for twenty-four hours. Invalid envelopes, invalid features, and provider failures throw and do not negative-cache records. Each response maps through its exact Spotify URL; array position is never used. The read-only contract probe verified a conservative two-ID request size, reordered requests, and partial matches; a larger maximum is intentionally not assumed. Internal logs record counts and algorithm version without credentials.

## Organization

Algorithm `sortify-v1` keeps raw features separate from vectors. Seven unit-range dimensions are validated, tempo is transformed with natural log, tempo/loudness use the run's 10th–90th percentile range, outliers clamp, and constant dimensions become 0.5. Feature-backed tracks sort by Spotify ID before deterministic seeded k-means++ initialization. Candidate k ranges from two through eight, requires ten members per cluster, and competes against a single-group default with sampled silhouette above 0.15. Small or indistinguishable collections remain one group. Labels derive from raw centroids without an LLM.

New runs use `sortify-v2`; saved `sortify-v1` runs retain the original algorithm in both previews and final analysis. Unsupported versions throw explicitly. Stored drafts, approvals and published playlists are not regenerated. No schema or API payload migration is required.

V2 retains normalization, seeded k-means, the ten-member minimum and silhouette strictly above 0.15, but considers up to sixteen clusters. Sampled pairwise distances are cached once per run (approximately 200 × track count), rather than recomputed for each candidate. More groups are possible, not guaranteed.

V2 names use raw feature averages, joined with ` · ` in texture/tone/energy/rhythm/tempo order. Texture precedence: instrumentalness > 0.65 plus acousticness > 0.70 → Acoustic instrumental; otherwise instrumentalness > 0.65 → Instrumental; otherwise speechiness ≥ 0.33 → Vocal & spoken; otherwise acousticness > 0.70 → Acoustic. Valence > 0.65 adds Bright; < 0.35 adds Reflective. Energy > 0.68 means High energy; < 0.35 means Low key; otherwise Easy flow. Without texture, danceability > 0.65 adds Rhythmic. Tempo < 90 adds Slow pace; > 130 adds Fast pace. Only repeated complete names receive numerical suffixes, in deterministic cluster order; these are not rankings.

Predefined categories use `1 − weighted mean absolute distance` from target, accepting fit ≥ 0.76, ranked by fit then Spotify ID, capped at one hundred tracks. The catalogue below is in priority order; notation is target × weight. The first four profiles remain unchanged.

| Category | Targets × weights | Inclusive hard gates (v2 additions) |
| --- | --- | --- |
| Chill | energy .20 × 3; acousticness .70 × 1; valence .45 × .5 | None |
| Upbeat | energy .75 × 1; danceability .75 × 2; valence .80 × 2 | None |
| Workout | energy .90 × 3; danceability .65 × 1 | None |
| Instrumental Focus | instrumentalness 1 × 4; speechiness 0 × 2; energy .35 × .5 | None |
| Acoustic | acousticness .90 × 4; energy .35 × 1 | acousticness ≥ .70 |
| Acoustic Instrumentals | acousticness .90 × 3; instrumentalness .90 × 4; speechiness .05 × 1 | acousticness ≥ .70; instrumentalness ≥ .65 |
| Dance | danceability .90 × 4; energy .70 × 1 | danceability ≥ .75 |
| Mellow Instrumentals | instrumentalness .90 × 4; energy .20 × 3; speechiness .05 × 1 | instrumentalness ≥ .65; energy ≤ .35 |
| High-Energy Instrumentals | instrumentalness .90 × 4; energy .85 × 3 | instrumentalness ≥ .65; energy ≥ .70 |
| Bright & Mellow | valence .85 × 3; energy .25 × 3 | valence ≥ .70; energy ≤ .40 |
| Dark & Intense | valence .20 × 3; energy .85 × 3 | valence ≤ .35; energy ≥ .70 |
| Reflective | valence .20 × 3; energy .25 × 3 | valence ≤ .35; energy ≤ .40 |
| Rhythmic & Mellow | danceability .80 × 3; energy .30 × 3 | danceability ≥ .65; energy ≤ .45 |
| Vocal & Spoken | speechiness .65 × 4; instrumentalness .05 × 2 | speechiness ≥ .33; instrumentalness ≤ .35 |

Categories may overlap. After ranking/capping, suppress a category if its track-ID Jaccard similarity to any retained category is ≥ 0.85; earlier catalogue entries win. Empty categories are omitted. Unassigned tracks group by artist, then album, then source; sparse relationships go into More from your library. Metadata groups never assert audio values or mood. Names and thresholds are provisional product heuristics, not validated mood, genre, or activity claims. Use representative libraries to assess usefulness before claiming tuning or validation.

Run the synthetic 1,000/5,000-track comparison with `node --import tsx scripts/benchmark-organize.ts`. Synthetic results measure runtime and separability, not real-library quality.

Local synthetic benchmark on 2026-09-18 (single run; hardware/runtime dependent): 1,000 tracks took 114 ms with v1 (8 groups), 173 ms with v2 (16 groups); 5,000 tracks took 295 ms with v1 (8 groups), 863 ms with v2 (16 groups). These are not production latency guarantees.

## Approval and publication

Every edit increments the revision and clears legacy approval. The server validates membership, names, and suggestion IDs. Individual and bulk import commands snapshot only explicitly requested suggestions under a row lock at the exact saved revision. The legacy approval command still references exactly the saved revision. Existing publication IDs are checked across all revisions to block repeat imports, with unique run/suggestion/revision keys as an additional safeguard. Playlist creation stores an uncertain intent before the write and embeds a unique operation marker in the Spotify description. On resume, owned private playlists are searched for exactly one marker match; an unresolved or conflicting result pauses rather than recreating.

Playlist creation and each append run in separate durable steps. Each append stores an uncertain intent before writing and checkpoints its offset after success. Resumption reads the full playlist and compares its ordered IDs to the expected snapshot before advancing. Already applied batches advance without another append. An uncertain batch that is not visible pauses; it is never blindly sent again. An externally changed or partially applied batch also pauses for review. This deliberately trades automatic recovery from a proven-no-write timeout for protection against duplicates. Definitively rejected writes can clear their intent and be resumed; ambiguous network outcomes require Spotify evidence or operator review. Spotify has no native idempotency key for these writes.

## Boundaries

No automatic publishing, playback, new-song discovery, ongoing sync, or edits to existing playlists. Inngest/Turso production behavior, Spotify account access, and actual private playlist creation require the live rollout described in validation.md. Browser fixtures exercise UI behavior rather than claiming a live integration result.

## Provider references

[Spotify Development Mode migration](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide), [ReccoBeats audio-feature endpoint](https://reccobeats.com/docs/apis/get-audio-features), and [ReccoBeats rate-limit handling](https://reccobeats.com/docs/documentation/rate-limiting).
## Playlist review and explicit imports

The user-facing flow now defaults to a blended collection, with no grouping-mode
selector. Blend interleaves natural groups and curated categories, suppresses
near-duplicates against retained suggestions at Jaccard ≥ 0.85, and preserves
coverage with a remainder playlist if suppression leaves tracks uncovered.
Legacy explicit groups/activity requests and saved runs remain supported.
One Recluster CTA defaults to blend; each review revision uses a reproducible
alternate k-means seed (711 + variation × 997), retaining size and silhouette
checks. Category rules remain fixed and low-variation libraries may not change.
Only unsaved edits require a discard confirmation. Imported playlists remain
locked and excluded from reclustering. Import all playlists imports every
nonempty, unimported suggestion, independent of legacy selection flags, with an
explicit confirmation. Individual Add to Spotify buttons remain primary.

Review is individual-first: each suggested playlist has its own “Add to Spotify” action. Saving edits does not publish anything. That action authorizes only the specified playlist IDs at the exact saved revision; Import all playlists explicitly confirms all nonempty, unimported playlists. Legacy approve/publish API commands remain compatible, but are no longer the primary interface.

Publication rows are immutable authorization snapshots. Review revisions do not invalidate an already-authorized operation. Imported suggestions are locked and cannot be edited or re-imported, even after a later revision. Publishing remains serialized per run with the existing uncertain-write reconciliation. After an import completes, the run returns to review so the remaining suggestions can be imported separately.

Reclustering uses the saved algorithm version and never updates Spotify playlists. Imported suggestions are retained unchanged; tracks already present in those imported suggestions are excluded from fresh grouping. New suggestion IDs include the review revision. Deterministic rules mean identical inputs, mode, algorithm and variation yield identical results.
