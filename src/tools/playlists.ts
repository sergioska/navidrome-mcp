import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SubsonicClient } from "../subsonic/client.js";
import { toolResult } from "./helpers.js";

export function registerPlaylistTools(server: McpServer, client: SubsonicClient): void {
  server.tool(
    "get_playlists",
    "List all playlists for the current user, with song counts and durations.",
    {},
    async () => {
      const playlists = await client.getPlaylists();
      return toolResult(
        playlists.map((p) => ({
          id: p.id,
          name: p.name,
          songCount: p.songCount,
          duration: p.duration,
          owner: p.owner,
          comment: p.comment,
        }))
      );
    }
  );

  server.tool(
    "get_playlist",
    "Get a playlist and its full track list (IDs, titles, artists, albums, genres). " +
      "Use this before extending a playlist so you know exactly which songs are already in it.",
    { id: z.string().describe("Playlist ID.") },
    async ({ id }) => {
      const pls = await client.getPlaylist(id);
      return toolResult({
        id: pls.id,
        name: pls.name,
        songCount: pls.songCount,
        duration: pls.duration,
        comment: pls.comment,
        songs: (pls.entry ?? []).map((s) => client.normalizeSong(s)),
      });
    }
  );

  server.tool(
    "create_playlist",
    "Create a new playlist with the given name and (optionally) initial song IDs. " +
      "Returns the created playlist with its server ID.",
    {
      name: z.string().describe("Name of the new playlist."),
      songIds: z.array(z.string()).optional().describe("Initial song IDs (optional)."),
    },
    async ({ name, songIds }) => {
      const pls = await client.createPlaylist(name, songIds ?? []);
      return toolResult({
        id: pls.id,
        name: pls.name,
        songCount: pls.songCount,
        songs: (pls.entry ?? []).map((s) => client.normalizeSong(s)),
      });
    }
  );

  server.tool(
    "update_playlist",
    "Modify an existing playlist: add songs, remove songs by index, rename, set comment/public. " +
      "Use this to extend a playlist with new tracks.",
    {
      playlistId: z.string().describe("Playlist ID to modify."),
      songIdsToAdd: z.array(z.string()).optional().describe("Song IDs to append."),
      songIndexesToRemove: z
        .array(z.number().int().min(0))
        .optional()
        .describe("Indexes of songs to remove (0-based, as returned by get_playlist)."),
      name: z.string().optional().describe("New playlist name."),
      comment: z.string().optional().describe("New comment."),
      public: z.boolean().optional().describe("Whether the playlist is public."),
    },
    async ({ playlistId, songIdsToAdd, songIndexesToRemove, name, comment, public: isPublic }) => {
      await client.updatePlaylist(playlistId, {
        songIdsToAdd,
        songIndexesToRemove,
        name,
        comment,
        public: isPublic,
      });
      return toolResult({ ok: true, playlistId });
    }
  );

  server.tool(
    "delete_playlist",
    "Delete a playlist permanently.",
    { id: z.string().describe("Playlist ID.") },
    async ({ id }) => {
      await client.deletePlaylist(id);
      return toolResult({ ok: true, deleted: id });
    }
  );
}