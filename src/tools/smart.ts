import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SubsonicClient } from "../subsonic/client.js";
import type { Song } from "../subsonic/types.js";
import { toolResult } from "./helpers.js";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function attempt<T>(fn: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function registerSmartTools(server: McpServer, client: SubsonicClient): void {
  server.tool(
    "get_music_profile",
    "One-call summary of the user's taste and recent listening, for prompts like " +
      "\"make a playlist from my recent listens and preferences\". Aggregates: most-played albums, " +
      "starred songs/albums/artists, highest-rated albums, what's playing now, and the saved play queue.",
    {
      albumCount: z.number().int().min(1).max(50).optional().describe("Albums per list (default 8)."),
      starredSongCount: z.number().int().min(1).max(100).optional().describe("Max starred songs (default 30)."),
    },
    async ({ albumCount, starredSongCount }) => {
      const n = albumCount ?? 8;
      const s = starredSongCount ?? 30;

      const [frequent, highest, starred, nowPlaying, playQueue] = await Promise.all([
        attempt(client.getAlbumList("frequent", { size: n })),
        attempt(client.getAlbumList("highest", { size: n })),
        attempt(client.getStarred()),
        attempt(client.getNowPlaying()),
        attempt(client.getPlayQueue()),
      ]);

      return toolResult({
        mostPlayedAlbums: frequent.ok ? frequent.value.map((a) => client.normalizeAlbum(a)) : frequent.error,
        highestRatedAlbums: highest.ok ? highest.value.map((a) => client.normalizeAlbum(a)) : highest.error,
        starred:
          starred.ok
            ? {
                artists: starred.value.artist?.map((a) => client.normalizeArtist(a)),
                albums: starred.value.album?.map((a) => client.normalizeAlbum(a)),
                songs: starred.value.song?.slice(0, s).map((x) => client.normalizeSong(x)),
              }
            : starred.error,
        nowPlaying: nowPlaying.ok
          ? nowPlaying.value.map((e) => ({
              username: e.username,
              minutesAgo: e.minutesAgo,
              song: client.normalizeSong(e.song ?? {}),
            }))
          : nowPlaying.error,
        lastPlayQueue: playQueue.ok
          ? {
              current: playQueue.value.current,
              songs: playQueue.value.entry?.map((x) => client.normalizeSong(x)),
            }
          : playQueue.error,
      });
    }
  );

  server.tool(
    "recommend_similar_songs",
    "Given one or more seed song IDs, return a merged, deduplicated pool of similar songs. " +
      "Calls get_similar_songs for each seed and combines the results. This is the key tool for " +
      "extending a playlist with more tracks in the same mood/genre. Then use update_playlist to add them.",
    {
      seedIds: z
        .array(z.string())
        .describe("Song IDs to use as musical seeds (e.g. the tracks already in the playlist)."),
      count: z.number().int().min(1).max(200).optional().describe("Target number of recommendations (default 20)."),
      perSeed: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Similar songs requested per seed (default: count / number of seeds, minimum 5)."),
    },
    async ({ seedIds, count, perSeed }) => {
      const target = count ?? 20;
      if (seedIds.length === 0) {
        return toolResult({ error: "seedIds must not be empty." });
      }
      const per = Math.max(perSeed ?? Math.ceil(target / seedIds.length), 5);

      const results = await Promise.all(
        seedIds.slice(0, 20).map(async (seed) => {
          try {
            const songs = await client.getSimilarSongs(seed, per);
            return { seed, songs, error: undefined };
          } catch (err) {
            return { seed, songs: [] as Song[], error: err instanceof Error ? err.message : String(err) };
          }
        })
      );

      const seen = new Set<string>();
      const songs: Record<string, unknown>[] = [];
      for (const result of results) {
        for (const s of result.songs) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          songs.push({ ...client.normalizeSong(s), similarTo: result.seed });
        }
        if (songs.length >= target) break;
      }

      return toolResult({
        requested: target,
        returned: songs.length,
        perSeed: per,
        failures: results.filter((r) => r.error).map((r) => ({ seed: r.seed, error: r.error })),
        songs,
      });
    }
  );
}