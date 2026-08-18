import { z } from "zod";

export const id = z.string().describe("Server-side ID of the song/album/artist/playlist.");

export const count = z
  .number()
  .int()
  .min(1)
  .max(500)
  .describe("Number of items to return.");

export const genre = z.string().describe("Genre name (e.g. \"shoegaze\", \"dream pop\", \"indie rock\").");

export const songIds = z
  .array(z.string())
  .describe("List of song IDs. Must be actual song (track) IDs, not album or artist IDs.");

export const toolResult = (data: unknown): { content: { type: "text"; text: string }[] } => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});