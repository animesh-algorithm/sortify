"use client";
import Link from "next/link";
import Brand from "./brand";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RunData, Source, Suggestion } from "../lib/model";
type Run = {
  id: string;
  status: string;
  created?: string;
  mode: string;
  revision: number;
  approvedRevision: number | null;
  error: string | null;
  data: Pick<RunData, "sources" | "tracks" | "suggestions" | "enriched">;
};
type Publication = {
  id: string;
  runId: string;
  suggestionId: string;
  name: string;
  playlistId: string | null;
  status: string;
  offset: number;
  trackIds: string[];
};
type State = {
  user: { name: string } | null;
  runs: Run[];
  publications: Publication[];
};
const initial: State = { user: null, runs: [], publications: [] };
async function api(path: string, body?: unknown) {
  const response = await fetch(
    path,
    body
      ? {
          method:
            path === "/api/runs" || path.includes("disconnect")
              ? "POST"
              : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}
function LivePlaylistPreview({ run }: { run: Run }) {
  const [preview, setPreview] = useState<{
    checked: number;
    suggestions: Suggestion[];
  } | null>(null);
  const [openSuggestionId, setOpenSuggestionId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function update() {
      try {
        const response = await fetch(`/api/runs/${run.id}/preview`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) {
          const result = await response.json();
          if (!stopped && Array.isArray(result.suggestions)) setPreview(result);
        }
      } catch {
        /* The main progress state remains available if a preview fails. */
      } finally {
        if (!stopped) timer = setTimeout(update, 10000);
      }
    }

    void update();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [run.id]);

  const suggestions = preview?.suggestions ?? [];
  if (!suggestions.length) return null;
  const tracksById = new Map(run.data.tracks.map((track) => [track.id, track]));
  const openSuggestion = suggestions.find(
    (suggestion) => suggestion.id === openSuggestionId,
  );
  const openSuggestionIndex = suggestions.findIndex(
    (suggestion) => suggestion.id === openSuggestionId,
  );
  const openTracks =
    openSuggestion?.trackIds
      .map((id) => tracksById.get(id))
      .filter((track) => track !== undefined) ?? [];

  function openPlaylist(id: string) {
    setOpenSuggestionId(id);
    requestAnimationFrame(() => dialogRef.current?.showModal());
  }

  function closePlaylist() {
    dialogRef.current?.close();
  }

  return (
    <section className="live-playlists" aria-labelledby="live-playlists-title">
      <div className="live-playlists-heading">
        <h3 id="live-playlists-title">Playlists taking shape</h3>
        <span aria-live="polite">
          {preview!.checked.toLocaleString()} songs checked
        </span>
      </div>
      <div className="live-playlist-grid" aria-live="polite">
        {suggestions.map((suggestion) => {
          const tracks = suggestion.trackIds
            .map((id) => tracksById.get(id))
            .filter((track) => track !== undefined);
          const sample = tracks.slice(0, 3);

          return (
            <div className="live-playlist" key={suggestion.id}>
              <div className="live-playlist-summary">
                <strong>{suggestion.name}</strong>
                <span>{suggestion.trackIds.length.toLocaleString()} songs</span>
              </div>
              {sample.length > 0 && (
                <ul
                  className="live-track-list"
                  aria-label={`${suggestion.name} songs`}
                >
                  {sample.map((track) => (
                    <li key={track.id}>
                      <span className="live-track-name">{track.name}</span>
                      <span>
                        {track.artists.map((artist) => artist.name).join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                className="live-playlist-open"
                type="button"
                onClick={() => openPlaylist(suggestion.id)}
              >
                View all {suggestion.trackIds.length.toLocaleString()} songs
                <span aria-hidden="true">→</span>
              </button>
            </div>
          );
        })}
      </div>
      <dialog
        ref={dialogRef}
        className="playlist-modal live-playlist-modal"
        onClose={() => setOpenSuggestionId(null)}
      >
        {openSuggestion && (
          <div className="live-playlist-modal-shell">
            <header
              className={`playlist-modal-header live-modal-header live-modal-art-${Math.max(0, openSuggestionIndex) % 4}`}
            >
              <div className="live-modal-copy">
                <span className="eyebrow">Playlist taking shape</span>
                <h2>{openSuggestion.name}</h2>
                <p>
                  <span className="live-status-dot" aria-hidden="true" />
                  {openSuggestion.trackIds.length.toLocaleString()} songs · Live
                  preview
                </p>
              </div>
              <div className="live-modal-art" aria-hidden="true">
                <span>{String(openSuggestionIndex + 1).padStart(2, "0")}</span>
                <div />
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close playlist"
                onClick={closePlaylist}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M4 4l12 12M16 4L4 16" />
                </svg>
              </button>
            </header>
            <div className="modal-track-list">
              {openTracks.map((track, index) => (
                <div className="modal-track live-modal-track" key={track.id}>
                  <span className="live-modal-track-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {track.image ? (
                    <Image
                      className="live-modal-album"
                      src={track.image}
                      alt={`Album artwork for ${track.album.name}`}
                      width={46}
                      height={46}
                      sizes="46px"
                    />
                  ) : (
                    <span
                      className="live-modal-album-fallback"
                      aria-hidden="true"
                    >
                      ♫
                    </span>
                  )}
                  <div>
                    <a
                      href={`https://open.spotify.com/track/${track.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {track.name} ↗
                    </a>
                    <small>
                      {track.artists.map((artist) => artist.name).join(", ")} ·{" "}
                      {track.album.name}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
export default function Sortify() {
  const [state, setState] = useState<State>(initial),
    [loaded, setLoaded] = useState(false),
    [sources, setSources] = useState<Source[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [savingEdits, setSavingEdits] = useState(false),
    [draft, setDraft] = useState<Suggestion[] | null>(null),
    [draftRevision, setDraftRevision] = useState<number | null>(null),
    [openPlaylist, setOpenPlaylist] = useState<string | null>(null),
    [newRun, setNewRun] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const nextRevisionRef = useRef<number | null>(null);
  const currentRevisionRef = useRef(0);
  const latestDraftRef = useRef<Suggestion[] | null>(null);
  const refresh = useCallback(async () => {
    try {
      setState(await api("/api/state"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    const first = setTimeout(() => {
      const problem = new URLSearchParams(window.location.search).get("error");
      if (problem)
        setError(
          (
            {
              setup:
                "Spotify credentials and callback URL need to be configured.",
              database_setup:
                "Configure the Turso database and run migrations before connecting Spotify.",
              encryption_setup:
                "TOKEN_ENCRYPTION_KEY must contain 32 random bytes encoded as base64.",
            } as Record<string, string>
          )[problem] ??
            "We could not connect your account. Try again or reconnect Spotify.",
        );
      void refresh();
    }, 0);
    return () => {
      clearTimeout(first);
    };
  }, [refresh]);
  useEffect(() => {
    if (state.user && !sources.length)
      api("/api/sources")
        .then(setSources)
        .catch((e) => setError(e.message));
  }, [state.user, sources.length]);
  const run = newRun ? undefined : state.runs[0],
    suggestions = draft ?? run?.data.suggestions ?? [],
    working =
      run &&
      ["queued", "importing", "enriching", "analyzing"].includes(run.status),
    publishing = run && ["publishing", "publish_failed"].includes(run.status);
  const polling = state.runs.some((item) =>
    ["queued", "importing", "enriching", "analyzing", "publishing"].includes(
      item.status,
    ),
  );
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (document.visibilityState === "visible") await refresh();
      if (!stopped) timer = setTimeout(tick, 10000);
    };
    timer = setTimeout(tick, 10000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [polling, refresh]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);
  const imported = state.publications.filter((p) => p.runId === run?.id);
  const pendingSelection = suggestions.filter(
    (s) => s.trackIds.length && !imported.some((p) => p.suggestionId === s.id),
  );
  const editingPlaylistIds = new Set(
    (draft ?? [])
      .filter((suggestion) => {
        const saved = run?.data.suggestions.find(
          (item) => item.id === suggestion.id,
        );
        return (
          !saved ||
          saved.name !== suggestion.name ||
          saved.selected !== suggestion.selected ||
          saved.trackIds.length !== suggestion.trackIds.length ||
          saved.trackIds.some((id, index) => id !== suggestion.trackIds[index])
        );
      })
      .map((suggestion) => suggestion.id),
  );
  useEffect(() => {
    if (run) currentRevisionRef.current = run.revision;
  }, [run]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function change(id: string, patch: Partial<Suggestion>) {
    if (!draft) setDraftRevision(run?.revision ?? null);
    setDraft(suggestions.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function saveSuggestions(next: Suggestion[]) {
    if (!run) return;
    const runId = run.id;
    if (nextRevisionRef.current === null)
      nextRevisionRef.current = draftRevision ?? currentRevisionRef.current;
    latestDraftRef.current = next;
    setDraft(next);
    setSavingEdits(true);
    setError("");
    saveQueueRef.current = saveQueueRef.current
      .then(async () => {
        const revision = nextRevisionRef.current;
        if (revision === null) return;
        await api(`/api/runs/${runId}`, {
          action: "edit",
          revision,
          suggestions: next,
        });
        nextRevisionRef.current = revision + 1;
        currentRevisionRef.current = revision + 1;
      })
      .then(async () => {
        if (latestDraftRef.current !== next) return;
        await refresh();
        if (latestDraftRef.current !== next) return;
        latestDraftRef.current = null;
        nextRevisionRef.current = null;
        setDraft(null);
        setDraftRevision(null);
        setSavingEdits(false);
      })
      .catch((cause) => {
        latestDraftRef.current = null;
        nextRevisionRef.current = null;
        setDraft(null);
        setDraftRevision(null);
        setSavingEdits(false);
        setError((cause as Error).message);
        void refresh();
      });
  }
  useEffect(() => {
    const dialog = dialogRef.current;
    if (openPlaylist && dialog && !dialog.open) dialog.showModal();
    if (!openPlaylist && dialog?.open) dialog.close();
  }, [openPlaylist]);
  async function command(action: string) {
    if (!run) return;
    await api(`/api/runs/${run.id}`, { action, revision: run.revision });
  }
  async function importPlaylists(ids: string[]) {
    if (!run) return;
    await saveQueueRef.current;
    await api(`/api/runs/${run.id}`, {
      action: "import",
      revision: currentRevisionRef.current,
      suggestionIds: ids,
    });
  }
  return (
    <main>
      <header>
        <Link className="wordmark" href="/" aria-label="Sortify home">
          <Brand />
        </Link>
        <div className="header-right">
          <span className="beta">BETA</span>
          {state.user && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api("/api/spotify/disconnect", {});
                  setSources([]);
                  setDraft(null);
                  setDraftRevision(null);
                })
              }
            >
              Disconnect
            </button>
          )}
        </div>
      </header>
      {error && (
        <div role="alert" className="error">
          {error} <button onClick={() => act(refresh)}>Try again</button>{" "}
          <a href="/api/spotify/connect">Reconnect Spotify</a>
        </div>
      )}
      {!state.user ? (
        <section className="landing">
          <div className="intro">
            <p className="eyebrow">YOUR MUSIC, BACK IN YOUR LIFE</p>
            <h1>
              You already found
              <br />
              <em>the music.</em>
            </h1>
            <p className="lede">
              Let’s find it again. Give the favorites buried in your Liked Songs
              another turn, with playlists made from the music you saved.
            </p>
            <a className="button primary" href="/api/spotify/connect">
              Connect Spotify <span>↗</span>
            </a>
            <p className="small">
              {loaded
                ? "Your Liked Songs stays just as it is."
                : "Getting things ready…"}
              <br />
              Review the new playlists and choose what to add to Spotify.
            </p>
          </div>
          <div
            className="record-scene"
            aria-label="Illustration of saved favorites brought together into playlists"
          >
            <div className="orbit" />
            <div className="vinyl">
              <div className="label">
                <span>
                  SORTIFY
                  <br />
                  SIDE A
                </span>
                <i />
              </div>
            </div>
            <div className="mini-playlist card-one">
              <span>01 / SLOW MORNINGS</span>
              <strong>A softer start.</strong>
              <div className="wave">▂ ▄ ▆ ▃ █ ▄ ▂ ▅ ▃</div>
            </div>
            <div className="mini-playlist card-two">
              <span>02 / FIND YOUR RHYTHM</span>
              <strong>A little momentum.</strong>
              <div className="swatches">
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <span className="scene-note">
              Your favorites. Back in rotation.
            </span>
          </div>
        </section>
      ) : (
        <>
          <div className="workspace-intro">
            <p className="eyebrow">YOUR MUSIC, BACK IN YOUR LIFE</p>
            <h1>
              Your favorites,
              <br />
              <em>worth another listen.</em>
            </h1>
            <p>
              Hi {state.user.name}. Let’s find something you forgot you loved.
            </p>
          </div>
          <nav className="steps" aria-label="Rediscovery progress">
            {["Choose music", "Find your playlists", "Make it yours"].map(
              (s, i) => (
                <span
                  key={s}
                  className={
                    (publishing || run?.status === "complete"
                      ? 2
                      : run?.status === "ready"
                        ? 2
                        : working
                          ? 1
                          : 0) === i
                      ? "current"
                      : ""
                  }
                >
                  <b>0{i + 1}</b>
                  {s}
                </span>
              ),
            )}
          </nav>
          {!run ? (
            <section className="source-layout">
              <div>
                <div className="section-heading">
                  <h2>Where should we look?</h2>
                  <p>
                    Start with Liked Songs, or choose playlists you’d love to
                    hear again.
                  </p>
                </div>
                <div className="source-list">
                  {!sources.length && <p>Loading your music…</p>}
                  {sources.map((s) => (
                    <label className="source" key={s.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(s.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, s.id]
                              : selected.filter((x) => x !== s.id),
                          )
                        }
                      />
                      <span
                        className={`cover ${s.id === "liked" ? "liked" : ""}`}
                      >
                        {s.id === "liked" ? "♥" : "♫"}
                      </span>
                      <span>
                        <strong>{s.name}</strong>
                        <small>
                          {s.count} {s.count === 1 ? "song" : "songs"}
                        </small>
                      </span>
                      <span className="source-arrow">↗</span>
                    </label>
                  ))}
                </div>
              </div>
              <aside>
                <p className="eyebrow">FROM SAVED TO PLAYED</p>
                <h2>There’s good music in there.</h2>
                <p className="small">
                  You chose the songs. Sortify brings them together into
                  playlists you’ll want to play.
                </p>
                <button
                  className="button primary full"
                  disabled={!selected.length || busy}
                  onClick={() =>
                    act(async () => {
                      await api("/api/runs", { sources: selected });
                      setNewRun(false);
                      setDraft(null);
                      setDraftRevision(null);
                    })
                  }
                >
                  Rediscover my music <span>→</span>
                </button>
                <p className="small">
                  {selected.length}{" "}
                  {selected.length === 1 ? "collection" : "collections"}{" "}
                  selected. Your Liked Songs and existing playlists stay as they
                  are.
                </p>
              </aside>
            </section>
          ) : working ? (
            <section className="progress-panel">
              <div className="progress-icon">≋</div>
              <p className="eyebrow">GIVING YOUR FAVORITES ANOTHER TURN</p>
              <h2>
                {run.status === "importing"
                  ? "Gathering your favorites."
                  : run.status === "enriching"
                    ? "Getting to know your music."
                    : run.status === "analyzing"
                      ? "Bringing your playlists together."
                      : "Getting ready to rediscover your music."}
              </h2>
              <ol className="music-progress" aria-label="Your music's progress">
                {[
                  "Gather songs",
                  "Get to know them",
                  "Put playlists together",
                ].map((label, index) => {
                  const current =
                    run.status === "queued" || run.status === "importing"
                      ? 0
                      : run.status === "enriching"
                        ? 1
                        : 2;
                  return (
                    <li
                      key={label}
                      className={
                        index === current
                          ? "current"
                          : index < current
                            ? "done"
                            : ""
                      }
                      aria-current={index === current ? "step" : undefined}
                    >
                      <span aria-hidden="true">
                        {index < current ? "✓" : index + 1}
                      </span>
                      {label}
                    </li>
                  );
                })}
              </ol>
              <progress
                aria-label={
                  run.status === "enriching"
                    ? "Songs analyzed"
                    : "Working on your music"
                }
                max={Math.max(1, run.data.tracks.length)}
                value={
                  run.status === "enriching"
                    ? Math.min(run.data.enriched, run.data.tracks.length)
                    : undefined
                }
              />
              <div
                className="song-progress"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <p>
                  {run.status === "queued" ? (
                    "Getting ready…"
                  ) : run.status === "importing" ? (
                    <>
                      <strong>{run.data.tracks.length.toLocaleString()}</strong>{" "}
                      songs gathered
                    </>
                  ) : run.status === "enriching" ? (
                    <>
                      <strong>
                        {Math.max(
                          0,
                          run.data.tracks.length - run.data.enriched,
                        ).toLocaleString()}
                      </strong>{" "}
                      {run.data.tracks.length - run.data.enriched === 1
                        ? "song"
                        : "songs"}{" "}
                      left
                    </>
                  ) : (
                    <>
                      <strong>{run.data.tracks.length.toLocaleString()}</strong>{" "}
                      songs checked
                    </>
                  )}
                </p>
              </div>
              <p className="small">
                Your playlists take shape here. You can leave and come back
                while Sortify works.
              </p>
              <div className="actions">
                {run.status === "queued" && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => act(() => command("resume"))}
                  >
                    Retry start
                  </button>
                )}
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => act(() => command("cancel"))}
                >
                  Cancel
                </button>
              </div>
              {(run.status === "enriching" || run.status === "analyzing") && (
                <LivePlaylistPreview key={run.id} run={run} />
              )}
            </section>
          ) : ["ready", "complete", "publishing", "publish_failed"].includes(
              run.status,
            ) ? (
            <section>
              <div className="review-heading">
                <div>
                  <h2>Find your next listen.</h2>
                  <p>
                    Spot an old favorite? Rename a playlist, move songs, and
                    keep what feels right.
                  </p>
                </div>
                <span>
                  {run.data.tracks.length} songs · {suggestions.length}{" "}
                  playlists
                </span>
              </div>
              {run.status === "publish_failed" && (
                <div className="inline-publish-error" role="alert">
                  <span>
                    {run.error ?? "Spotify could not finish adding a playlist."}
                  </span>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => act(() => command("resume"))}
                  >
                    Try again
                  </button>
                </div>
              )}
              <div className="review-toolbar">
                <span className="small">
                  {pendingSelection.length} ready to add
                </span>
                <div className="review-actions">
                  <button
                    className="button"
                    disabled={busy || !!draft || !pendingSelection.length}
                    onClick={() => {
                      void act(async () => {
                        await api(`/api/runs/${run.id}`, {
                          action: "recluster",
                          revision: run.revision,
                          mode: "blend",
                        });
                        setDraft(null);
                        setDraftRevision(null);
                      });
                    }}
                  >
                    <span aria-hidden="true">↻</span> Try another mix
                  </button>
                  <button
                    className="button"
                    disabled={busy || !!draft}
                    onClick={() =>
                      void act(async () => {
                        await api(`/api/runs/${run.id}`, {
                          action: "recluster",
                          revision: run.revision,
                          mode: "artist",
                        });
                        setDraft(null);
                        setDraftRevision(null);
                      })
                    }
                  >
                    Group by artist
                  </button>
                  <button
                    className="button"
                    disabled={busy || !!draft}
                    onClick={() =>
                      void act(async () => {
                        await api(`/api/runs/${run.id}`, {
                          action: "recluster",
                          revision: run.revision,
                          mode: "activity",
                        });
                        setDraft(null);
                        setDraftRevision(null);
                      })
                    }
                  >
                    Group by listening mood
                  </button>
                  <button
                    className="button"
                    disabled={busy || !!draft || !pendingSelection.length}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Add all ${pendingSelection.length} playlists to Spotify? Your Liked Songs and existing playlists will stay as they are.`,
                        )
                      )
                        void act(() =>
                          importPlaylists(pendingSelection.map((s) => s.id)),
                        );
                    }}
                  >
                    Add all to Spotify
                  </button>
                </div>
              </div>
              {!suggestions.length && (
                <div>
                  <p>
                    We couldn’t find any songs in that selection. Choose another
                    playlist or try your Liked Songs.
                  </p>
                  <button
                    className="button"
                    onClick={() => {
                      setNewRun(true);
                      setDraft(null);
                      setDraftRevision(null);
                    }}
                  >
                    Choose music
                  </button>
                </div>
              )}
              <div className="suggestions">
                {suggestions.map((s, i) => (
                  <article className="suggestion" key={s.id}>
                    <div className={`playlist-art art-${i % 4}`}>
                      <span>0{i + 1}</span>
                      <div className="art-ring" />
                      <strong>{s.name}</strong>
                    </div>
                    <fieldset className="playlist-edit">
                      <div className="playlist-title">
                        <input
                          aria-label={`Playlist ${i + 1} name`}
                          maxLength={100}
                          value={s.name}
                          disabled={
                            busy ||
                            imported.some((p) => p.suggestionId === s.id)
                          }
                          onChange={(e) =>
                            change(s.id, { name: e.target.value })
                          }
                          onBlur={() => {
                            if (draft) saveSuggestions(draft);
                          }}
                        />
                        <span>{s.trackIds.length}</span>
                        <button
                          type="button"
                          className="playlist-edit-button"
                          aria-label={`Edit ${s.name} playlist`}
                          onClick={() => setOpenPlaylist(s.id)}
                        >
                          <svg viewBox="0 0 20 20" aria-hidden="true">
                            <path d="M13.9 3.6a1.8 1.8 0 0 1 2.5 2.5L7.2 15.3l-3.4.9.9-3.4 9.2-9.2Z" />
                            <path d="m12.6 4.9 2.5 2.5" />
                          </svg>
                          <span>Edit</span>
                        </button>
                      </div>
                      <div className="track-list track-list-preview">
                        {s.trackIds.map((id) => {
                          const t = run.data.tracks.find((t) => t.id === id);
                          if (!t) return null;
                          return (
                            <div className="track" key={id}>
                              {t.image ? (
                                <Image
                                  className="album-art"
                                  src={t.image}
                                  alt={`Album artwork for ${t.album.name}`}
                                  width={34}
                                  height={34}
                                  sizes="34px"
                                />
                              ) : (
                                <span
                                  className="album-art-placeholder"
                                  aria-hidden="true"
                                >
                                  ♫
                                </span>
                              )}
                              <div>
                                <a
                                  href={`https://open.spotify.com/track/${t.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {t.name} ↗
                                </a>
                                <small>
                                  {t.artists.map((a) => a.name).join(", ")} ·{" "}
                                  {t.album.name}
                                </small>
                              </div>
                              <select
                                aria-label={`Move ${t.name}`}
                                value=""
                                disabled={
                                  busy ||
                                  imported.some((p) => p.suggestionId === s.id)
                                }
                                onChange={(e) => {
                                  const to = e.target.value;
                                  if (!to) return;
                                  saveSuggestions(
                                    suggestions.map((g) =>
                                      g.id === s.id
                                        ? {
                                            ...g,
                                            trackIds: g.trackIds.filter(
                                              (x) => x !== id,
                                            ),
                                          }
                                        : g.id === to
                                          ? {
                                              ...g,
                                              trackIds: [
                                                ...new Set([...g.trackIds, id]),
                                              ],
                                            }
                                          : g,
                                    ),
                                  );
                                }}
                              >
                                <option value="">Move</option>
                                {suggestions
                                  .filter(
                                    (g) =>
                                      g.id !== s.id &&
                                      !imported.some(
                                        (p) => p.suggestionId === g.id,
                                      ),
                                  )
                                  .map((g) => (
                                    <option key={g.id} value={g.id}>
                                      {g.name}
                                    </option>
                                  ))}
                              </select>
                              <button
                                className="remove"
                                disabled={
                                  busy ||
                                  imported.some((p) => p.suggestionId === s.id)
                                }
                                aria-label={`Remove ${t.name} from ${s.name}`}
                                onClick={() =>
                                  saveSuggestions(
                                    suggestions.map((group) =>
                                      group.id === s.id
                                        ? {
                                            ...group,
                                            trackIds: group.trackIds.filter(
                                              (trackId) => trackId !== id,
                                            ),
                                          }
                                        : group,
                                    ),
                                  )
                                }
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                    <div className="playlist-import">
                      {imported.some((p) => p.suggestionId === s.id) ? (
                        <>
                          <small className="spotify-confirmation" role="status">
                            {imported.find((p) => p.suggestionId === s.id)
                              ?.status === "complete"
                              ? "✓ Added to Spotify"
                              : "Adding to Spotify…"}
                          </small>
                          {imported.find((p) => p.suggestionId === s.id)
                            ?.status === "complete" &&
                            imported.find((p) => p.suggestionId === s.id)
                              ?.playlistId && (
                              <a
                                target="_blank"
                                rel="noreferrer"
                                href={`https://open.spotify.com/playlist/${imported.find((p) => p.suggestionId === s.id)?.playlistId}`}
                              >
                                Open in Spotify ↗
                              </a>
                            )}
                        </>
                      ) : (
                        <button
                          className="button primary"
                          aria-label={`Add ${s.name} to Spotify`}
                          disabled={
                            busy ||
                            editingPlaylistIds.has(s.id) ||
                            !s.trackIds.length
                          }
                          onClick={() => act(() => importPlaylists([s.id]))}
                        >
                          Add to Spotify ↗
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <dialog
                ref={dialogRef}
                className="playlist-modal"
                onClose={() => setOpenPlaylist(null)}
                onCancel={() => setOpenPlaylist(null)}
              >
                {(() => {
                  const playlist = suggestions.find(
                    (item) => item.id === openPlaylist,
                  );
                  if (!playlist) return null;
                  const index = suggestions.findIndex(
                    (item) => item.id === playlist.id,
                  );
                  const locked =
                    busy ||
                    imported.some((p) => p.suggestionId === playlist.id);
                  return (
                    <div className="playlist-modal-shell">
                      <div
                        className={`playlist-modal-header art-${Math.max(0, index) % 4}`}
                      >
                        <div className="modal-cover" aria-hidden="true">
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <div className="modal-cover-disc">
                            <i />
                          </div>
                        </div>
                        <div className="modal-heading-copy">
                          <span className="eyebrow">EDIT PLAYLIST</span>
                          <label className="modal-title-field">
                            <span className="sr-only">Playlist name</span>
                            <input
                              aria-label="Playlist name"
                              maxLength={100}
                              value={playlist.name}
                              disabled={locked}
                              onChange={(event) =>
                                change(playlist.id, {
                                  name: event.target.value,
                                })
                              }
                              onBlur={() => {
                                if (draft) saveSuggestions(draft);
                              }}
                            />
                            {!locked && (
                              <svg viewBox="0 0 20 20" aria-hidden="true">
                                <path d="M13.9 3.6a1.8 1.8 0 0 1 2.5 2.5L7.2 15.3l-3.4.9.9-3.4 9.2-9.2Z" />
                                <path d="m12.6 4.9 2.5 2.5" />
                              </svg>
                            )}
                          </label>
                          <p>
                            {playlist.trackIds.length} song
                            {playlist.trackIds.length === 1 ? "" : "s"}
                            <span aria-hidden="true"> · </span>
                            <span>Private playlist</span>
                          </p>
                        </div>
                        <button
                          className="modal-close"
                          aria-label="Close playlist"
                          onClick={() => setOpenPlaylist(null)}
                        >
                          ×
                        </button>
                      </div>
                      <div className="modal-track-heading" aria-hidden="true">
                        <span>#</span>
                        <span>Song</span>
                        <span>Move to</span>
                        <span />
                      </div>
                      <div className="modal-track-list">
                        {playlist.trackIds.map((id, trackIndex) => {
                          const track = run.data.tracks.find(
                            (item) => item.id === id,
                          );
                          if (!track) return null;
                          return (
                            <div className="modal-track" key={id}>
                              <span className="track-number">
                                {String(trackIndex + 1).padStart(2, "0")}
                              </span>
                              {track.image ? (
                                <Image
                                  className="album-art"
                                  src={track.image}
                                  alt={`Album artwork for ${track.album.name}`}
                                  width={44}
                                  height={44}
                                  sizes="44px"
                                />
                              ) : (
                                <span
                                  className="album-art-placeholder"
                                  aria-hidden="true"
                                >
                                  ♫
                                </span>
                              )}
                              <div>
                                <a
                                  href={`https://open.spotify.com/track/${track.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {track.name} ↗
                                </a>
                                <small>
                                  {track.artists
                                    .map((artist) => artist.name)
                                    .join(", ")}{" "}
                                  · {track.album.name}
                                </small>
                              </div>
                              <select
                                aria-label={`Move ${track.name}`}
                                value=""
                                disabled={locked}
                                onChange={(event) => {
                                  const destination = event.target.value;
                                  if (!destination) return;
                                  saveSuggestions(
                                    suggestions.map((group) =>
                                      group.id === playlist.id
                                        ? {
                                            ...group,
                                            trackIds: group.trackIds.filter(
                                              (trackId) => trackId !== id,
                                            ),
                                          }
                                        : group.id === destination
                                          ? {
                                              ...group,
                                              trackIds: [
                                                ...new Set([
                                                  ...group.trackIds,
                                                  id,
                                                ]),
                                              ],
                                            }
                                          : group,
                                    ),
                                  );
                                }}
                              >
                                <option value="">Choose playlist…</option>
                                {suggestions
                                  .filter(
                                    (group) =>
                                      group.id !== playlist.id &&
                                      !imported.some(
                                        (p) => p.suggestionId === group.id,
                                      ),
                                  )
                                  .map((group) => (
                                    <option key={group.id} value={group.id}>
                                      {group.name}
                                    </option>
                                  ))}
                              </select>
                              <button
                                className="remove"
                                disabled={locked}
                                aria-label={`Remove ${track.name} from ${playlist.name}`}
                                onClick={() =>
                                  saveSuggestions(
                                    suggestions.map((group) =>
                                      group.id === playlist.id
                                        ? {
                                            ...group,
                                            trackIds: group.trackIds.filter(
                                              (trackId) => trackId !== id,
                                            ),
                                          }
                                        : group,
                                    ),
                                  )
                                }
                              >
                                <svg viewBox="0 0 20 20" aria-hidden="true">
                                  <path d="M4 6h12M8 6V4h4v2m3 0-1 10H6L5 6m3 3v4m4-4v4" />
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="playlist-modal-footer">
                        <span
                          className={
                            savingEdits
                              ? "modal-status changed"
                              : "modal-status"
                          }
                        >
                          <i aria-hidden="true" />
                          {savingEdits
                            ? "Saving changes…"
                            : locked
                              ? "Already added to Spotify"
                              : "Changes save automatically"}
                        </span>
                        <button
                          className="button primary"
                          onClick={() => setOpenPlaylist(null)}
                        >
                          Done reviewing <span aria-hidden="true">→</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </dialog>
              <button
                className="button"
                disabled={busy || run.status === "publishing"}
                onClick={() => {
                  setNewRun(true);
                  setDraft(null);
                  setDraftRevision(null);
                }}
              >
                {run.status === "publishing"
                  ? "Finish adding playlists first"
                  : "Rediscover more music"}
              </button>
            </section>
          ) : (
            <section className="progress-panel">
              <h2>
                {run.status === "cancelled"
                  ? "Ready for another listen?"
                  : "Let’s try that again."}
              </h2>
              <p>{run.error ?? "Choose your music whenever you’re ready."}</p>
              {run.status === "failed" && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => act(() => command("resume"))}
                >
                  Try again
                </button>
              )}
              <button
                className="button"
                onClick={() => {
                  setNewRun(true);
                  setDraft(null);
                  setDraftRevision(null);
                }}
              >
                Choose music
              </button>
            </section>
          )}
        </>
      )}
      <footer>
        <span>You already found the music. Find it again.</span>
        <span>YOUR MUSIC. BACK IN YOUR LIFE.</span>
      </footer>
    </main>
  );
}
