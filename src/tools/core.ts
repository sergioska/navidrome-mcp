import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SubsonicClient } from "../subsonic/client.js";
import { toolResult } from "./helpers.js";

export const ALBUM_LIST_TYPES = [
  "frequent",
  "highest",
  "starred",
  "newest",
  "recent",
  "random",
  "alphabeticalByName",
  "alphabeticalByArtist",
  "byGenre",
  "byYear",
] as const;

export function registerCoreTools(server: McpServer, client: SubsonicClient): void {
  server.tool(
    "ping",
    "Check that the Subsonic/Navidrome server is reachable and credentials work.",
    {},
    async () => {
      const res = await client.ping();
      return toolResult({ ok: true, version: res.version });
    }
  );

  server.tool(
    "get_user",
    "Return the current user's profile, including which Subsonic roles they have (e.g. playlistRole, streamRole).",
    {},
    async () => {
      const res = await client.getUser();
      const { email, ...profile } = res.user;
      return toolResult(profile);
    }
  );

  server.tool(
    "search",
    "Search the library by keyword. Returns matching artists, albums and songs. Use it to resolve a title/artist into server IDs.",
    {
      query: z.string().describe("Free text query, e.g. an artist, album or song title."),
      artistCount: z.number().int().min(0).max(50).optional().describe("Max artists (default 10)."),
      albumCount: z.number().int().min(0).max(50).optional().describe("Max albums (default 10)."),
      songCount: z.number().int().min(0).max(100).optional().describe("Max songs (default 20)."),
    },
    async ({ query, artistCount, albumCount, songCount }) => {
      const res = await client.search(query, { artistCount, albumCount, songCount });
      return toolResult({
        artists: (res.artist ?? []).map((a) => client.normalizeArtist(a)),
        albums: (res.album ?? []).map((a) => client.normalizeAlbum(a)),
        songs: (res.song ?? []).map((s) => client.normalizeSong(s)),
      });
    }
  );

  server.tool(
    "get_song",
    "Get details for a single song: title, artist, album, genre, year, duration, playCount, userRating, starred.",
    { id: z.string().describe("Song ID.") },
    async ({ id }) => {
      const song = await client.getSong(id);
      if (!song) return toolResult({ found: false });
      return toolResult(client.normalizeSong(song));
    }
  );

  server.tool(
    "get_album",
    "Get an album and its full track list. Useful to resolve an album ID into song IDs.",
    { id: z.string().describe("Album ID.") },
    async ({ id }) => {
      const res = await client.getAlbum(id);
      const album = res.album;
      return toolResult({
        id: album.id,
        name: album.name,
        artist: album.artist,
        genre: album.genre,
        year: album.year,
        songCount: album.songCount,
        songs: (album.song ?? []).map((s) => client.normalizeSong(s)),
      });
    }
  );

  server.tool(
    "get_artist",
    "Get an artist and their albums. Useful to resolve an artist ID into album/song IDs.",
    { id: z.string().describe("Artist ID.") },
    async ({ id }) => {
      const res = await client.getArtist(id);
      const artist = res.artist;
      return toolResult({
        id: artist.id,
        name: artist.name,
        albumCount: artist.albumCount,
        albums: (artist.album ?? []).map((a) => client.normalizeAlbum(a)),
      });
    }
  );

  server.tool(
    "get_genres",
    "List all genres present in the library with their song and album counts.",
    {},
    async () => {
      const genres = await client.getGenres();
      return toolResult(genres);
    }
  );

  server.tool(
    "get_music_directory",
    "Return the contents of a directory: children of an artist or an album. " +
      "A directory child can be an album (isDir=true) or a song (isDir=false).",
    { id: z.string().describe("Artist or album directory ID.") },
    async ({ id }) => {
      const dir = await client.getMusicDirectory(id);
      const children = (dir.child ?? []).map((c) => {
        if ("isDir" in c && (c as { isDir?: boolean }).isDir) {
          return client.normalizeAlbum(c as Parameters<SubsonicClient["normalizeAlbum"]>[0]);
        }
        return client.normalizeSong(c as Parameters<SubsonicClient["normalizeSong"]>[0]);
      });
      return toolResult({
        id: dir.id,
        name: dir.name,
        genre: dir.genre,
        year: dir.year,
        songCount: dir.songCount,
        children,
      });
    }
  );

  server.tool(
    "get_top_songs",
    "Get the most popular songs for an artist by name (uses external metadata, e.g. Last.fm).",
    {
      artist: z.string().describe("Artist name, e.g. \"My Bloody Valentine\"."),
      count: z.number().int().min(1).max(50).optional().describe("Max songs (default 20)."),
    },
    async ({ artist, count }) => {
      const songs = await client.getTopSongs(artist, count);
      return toolResult(songs.map((s) => client.normalizeSong(s)));
    }
  );

  server.tool(
    "get_similar_songs",
    "Given a song (or artist) ID, return songs similar to it from the library. " +
      "Based on similar-artist metadata (Last.fm/ListenBrainz). This is the key tool for " +
      "extending a playlist with tracks in the same vein: feed it the IDs of the seed songs.",
    {
      id: z.string().describe("Song ID (or artist ID) used as the musical seed."),
      count: z.number().int().min(1).max(100).optional().describe("Max similar songs (default 20)."),
    },
    async ({ id, count }) => {
      const songs = await client.getSimilarSongs(id, count);
      return toolResult(songs.map((s) => client.normalizeSong(s)));
    }
  );

  server.tool(
    "get_now_playing",
    "List what is currently being played across all users (useful recent-listening context).",
    {},
    async () => {
      const entries = await client.getNowPlaying();
      return toolResult(
        entries.map((e) => ({
          username: e.username,
          minutesAgo: e.minutesAgo,
          playerName: e.playerName,
          ...client.normalizeSong(e.song ?? ({} as Parameters<SubsonicClient["normalizeSong"]>[0])),
        }))
      );
    }
  );

  server.tool(
    "get_play_queue",
    "Return the user's saved play queue (the last listening session), including the current track.",
    {},
    async () => {
      const q = await client.getPlayQueue();
      return toolResult({
        current: q.current,
        position: q.position,
        changed: q.changed,
        songs: (q.entry ?? []).map((s) => client.normalizeSong(s)),
      });
    }
  );

  server.tool(
    "get_starred",
    "Return the user's starred (favorite) songs, albums and artists. Strong signal of musical preference.",
    {},
    async () => {
      const res = await client.getStarred();
      return toolResult({
        artists: (res.artist ?? []).map((a) => client.normalizeArtist(a)),
        albums: (res.album ?? []).map((a) => client.normalizeAlbum(a)),
        songs: (res.song ?? []).map((s) => client.normalizeSong(s)),
      });
    }
  );

  server.tool(
    "get_random_songs",
    "Return random songs from the library, optionally filtered by genre and year range.",
    {
      size: z.number().int().min(1).max(500).optional().describe("Number of songs (default 10)."),
      genre: z.string().optional().describe("Filter by genre."),
      fromYear: z.number().int().optional().describe("Earliest year."),
      toYear: z.number().int().optional().describe("Latest year."),
    },
    async ({ size, genre, fromYear, toYear }) => {
      const songs = await client.getRandomSongs({ size, genre, fromYear, toYear });
      return toolResult(songs.map((s) => client.normalizeSong(s)));
    }
  );

  server.tool(
    "get_songs_by_genre",
    "Return songs matching a genre. Use this to pull candidates when the user asks for a specific genre/mood.",
    {
      genre: z.string().describe("Genre name, e.g. \"shoegaze\"."),
      count: z.number().int().min(1).max(500).optional().describe("Max songs (default 20)."),
      offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)."),
    },
    async ({ genre, count, offset }) => {
      const songs = await client.getSongsByGenre(genre, { count, offset });
      return toolResult(songs.map((s) => client.normalizeSong(s)));
    }
  );

  server.tool(
    "get_album_list",
    "Return albums sorted by a predefined list type. Types:\n" +
      '- "frequent" = most played albums (reflects the user\'s taste)\n' +
      '- "highest" = highest rated albums\n' +
      '- "starred" = favorited albums\n' +
      '- "newest" = most recently added to the library\n' +
      '- "recent" = recently added (NOT recently played)\n' +
      '- "random" = random albums\n' +
      '- "byGenre"/"byYear" = filter by genre or year range',
    {
      type: z.enum(ALBUM_LIST_TYPES).describe("The album list type."),
      size: z.number().int().min(1).max(500).optional().describe("Max albums (default 10)."),
      offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)."),
      genre: z.string().optional().describe("Required when type=byGenre."),
      fromYear: z.number().int().optional().describe("Required when type=byYear."),
      toYear: z.number().int().optional().describe("Required when type=byYear."),
    },
    async ({ type, size, offset, genre, fromYear, toYear }) => {
      const albums = await client.getAlbumList(type, { size, offset, genre, fromYear, toYear });
      return toolResult(albums.map((a) => client.normalizeAlbum(a)));
    }
  );
}