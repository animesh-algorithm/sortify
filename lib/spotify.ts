import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "../db/schema";
import { resolveToken } from "./tokens";
import { request, ProviderError } from "./request";
import type { Source, Track } from "./model";
export const scopes =
  "user-library-read playlist-read-private playlist-read-collaborative playlist-modify-private";
export async function tokenExchange(params: URLSearchParams) {
  const r = await request(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
          ).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
    true,
  );
  return (await r.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}
async function token(userId: string, force = false) {
  return db().transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u) throw new Error("Reconnect Spotify");
    return resolveToken(
      u,
      force,
      (refresh) =>
        tokenExchange(
          new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refresh,
          }),
        ),
      (tokens) => tx.update(users).set(tokens).where(eq(users.id, userId)),
    );
  });
}
export async function spotify(
  userId: string,
  path: string,
  init: RequestInit = {},
) {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Invalid Spotify path");
  const call = async (force: boolean) =>
    request(
      "https://api.spotify.com/v1" + path,
      {
        ...init,
        headers: {
          Authorization: "Bearer " + (await token(userId, force)),
          "Content-Type": "application/json",
          ...init.headers,
        },
      },
      !!init.method && init.method !== "GET",
    );
  try {
    return await (await call(false)).json();
  } catch (e) {
    if (e instanceof ProviderError && e.status === 401)
      return await (await call(true)).json();
    throw e;
  }
}
export async function pages<T>(
  userId: string,
  path: string,
  call: typeof spotify = spotify,
): Promise<T[]> {
  const all: T[] = [];
  let next: string | null = path;
  const seen = new Set<string>();
  while (next) {
    if (seen.has(next)) throw new Error("Repeated pagination");
    seen.add(next);
    const p = (await call(userId, next)) as { items: T[]; next: string | null };
    if (!Array.isArray(p.items)) throw new Error("Invalid Spotify page");
    all.push(...p.items);
    if (p.next) {
      const u = new URL(p.next);
      if (
        u.origin !== "https://api.spotify.com" ||
        !u.pathname.startsWith("/v1/")
      )
        throw new Error("Invalid pagination origin");
      next = u.pathname.slice(3) + u.search;
    } else next = null;
  }
  return all;
}
type Playlist = {
  id: string;
  name: string;
  owner: { id: string };
  collaborative: boolean;
  items?: { total: number };
  images?: { url: string }[];
  description?: string;
  public?: boolean;
};
export async function sources(userId: string): Promise<Source[]> {
  const p = await pages<Playlist>(userId, "/me/playlists?limit=50");
  const liked = await spotify(userId, "/me/tracks?limit=1");
  return [
    { id: "liked", name: "Liked Songs", count: liked.total },
    ...p
      .filter((x) => x.owner?.id === userId || x.collaborative)
      .map((x) => ({
        id: x.id,
        name: x.name,
        count: x.items?.total ?? 0,
        image: x.images?.[0]?.url,
      })),
  ];
}
export function parseTrack(value: unknown, source: string): Track | null {
  const t = value as {
    id?: string;
    type?: string;
    is_local?: boolean;
    is_playable?: boolean;
    name?: string;
    artists?: Track["artists"];
    album?: Track["album"] & { images?: { url: string }[] };
  } | null;
  if (
    !t ||
    t.type !== "track" ||
    t.is_local ||
    t.is_playable === false ||
    !t.id ||
    !t.name ||
    !t.album ||
    !Array.isArray(t.artists)
  )
    return null;
  return {
    id: t.id,
    name: t.name,
    artists: t.artists.map((a) => ({ id: a.id, name: a.name })),
    album: { id: t.album.id, name: t.album.name },
    image: t.album.images?.[0]?.url,
    sources: [source],
  };
}
export function mergeTracks(tracks: Track[]) {
  const m = new Map<string, Track>();
  for (const t of tracks) {
    const old = m.get(t.id);
    if (old) old.sources = [...new Set([...old.sources, ...t.sources])];
    else m.set(t.id, { ...t, sources: [...t.sources] });
  }
  return [...m.values()].sort((a, b) => a.id.localeCompare(b.id));
}
export async function importSource(userId: string, id: string) {
  if (id !== "liked") {
    const p = (await spotify(userId, `/playlists/${id}`)) as Playlist;
    if (p.owner?.id !== userId && !p.collaborative)
      throw new Error("Source is no longer accessible");
  }
  const items = await pages<{
    track?: unknown;
    item?: unknown;
    is_local?: boolean;
  }>(
    userId,
    id === "liked" ? "/me/tracks?limit=50" : `/playlists/${id}/items?limit=50`,
  );
  const tracks = items
    .map((x) =>
      x.is_local ? null : parseTrack(id === "liked" ? x.track : x.item, id),
    )
    .filter((x): x is Track => !!x);
  return { tracks, skipped: items.length - tracks.length };
}
export function sourcePath(id: string) {
  return id === "liked"
    ? "/me/tracks?limit=50"
    : `/playlists/${id}/items?limit=50`;
}
export async function importPage(userId: string, id: string, path: string) {
  const p = (await spotify(userId, path)) as {
    items: { track?: unknown; item?: unknown; is_local?: boolean }[];
    next: string | null;
  };
  if (!Array.isArray(p.items)) throw new Error("Invalid Spotify page");
  const tracks = p.items
    .map((x) =>
      x.is_local ? null : parseTrack(id === "liked" ? x.track : x.item, id),
    )
    .filter((x): x is Track => !!x);
  let next: string | null = null;
  if (p.next) {
    const u = new URL(p.next);
    if (
      u.origin !== "https://api.spotify.com" ||
      !u.pathname.startsWith("/v1/")
    )
      throw new Error("Invalid pagination origin");
    next = u.pathname.slice(3) + u.search;
    if (next === path) throw new Error("Repeated pagination");
  }
  return { tracks, skipped: p.items.length - tracks.length, next };
}
