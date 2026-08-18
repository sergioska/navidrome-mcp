import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SubsonicClient } from "../subsonic/client.js";
import { toolResult } from "./helpers.js";

export function registerAnnotationTools(server: McpServer, client: SubsonicClient): void {
  server.tool(
    "set_rating",
    "Rate a song, album or artist from 1 to 5. Ratings feed the \"highest\" album list.",
    {
      id: z.string().describe("ID of the song, album or artist."),
      rating: z.number().int().min(1).max(5).describe("Rating 1-5."),
    },
    async ({ id, rating }) => {
      await client.setRating(id, rating);
      return toolResult({ ok: true, id, rating });
    }
  );

  server.tool(
    "star",
    "Add songs, albums or artists to the user's favorites.",
    {
      ids: z.array(z.string()).describe("IDs of songs, albums or artists."),
    },
    async ({ ids }) => {
      await client.star(ids);
      return toolResult({ ok: true, starred: ids });
    }
  );

  server.tool(
    "unstar",
    "Remove songs, albums or artists from the user's favorites.",
    {
      ids: z.array(z.string()).describe("IDs of songs, albums or artists."),
    },
    async ({ ids }) => {
      await client.unstar(ids);
      return toolResult({ ok: true, unstarred: ids });
    }
  );

  server.tool(
    "scrobble",
    "Report a play (scrobble) to the server, updating play counts and now-playing info. " +
      "Pass submission=false to just mark a track as now playing.",
    {
      ids: z.array(z.string()).describe("Song IDs played."),
      submission: z.boolean().optional().describe("true = completed play (default), false = now playing."),
      times: z
        .array(z.number().int())
        .optional()
        .describe("Unix timestamps (ms) per played track, same length as ids (optional)."),
    },
    async ({ ids, submission, times }) => {
      await client.scrobble(ids, submission, times);
      return toolResult({ ok: true, ids, submission });
    }
  );
}