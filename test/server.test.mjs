import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startMockServer } from "./mock-server.mjs";

const distIndex = fileURLToPath(new URL("../dist/index.js", import.meta.url));

async function connect(mock) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [distIndex],
    env: {
      SUBSONIC_URL: mock.baseUrl,
      SUBSONIC_USER: "alice",
      SUBSONIC_PASSWORD: "secret",
      ...process.env,
    },
  });
  const client = new Client({ name: "navidrome-mcp-test", version: "0.0.0" });
  await client.connect(transport);
  return { client, transport };
}

test("server exposes expected tools over stdio", async () => {
  const mock = await startMockServer();
  try {
    const { client, transport } = await connect(mock);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    for (const expected of [
      "ping",
      "search",
      "get_song",
      "get_album",
      "get_genres",
      "get_similar_songs",
      "get_music_profile",
      "recommend_similar_songs",
      "get_playlists",
      "get_playlist",
      "create_playlist",
      "update_playlist",
      "set_rating",
      "scrobble",
    ]) {
      assert.ok(names.includes(expected), `missing tool ${expected}`);
    }
    assert.ok(names.includes("get_music_profile"));
    await client.close();
    await transport.close();
  } finally {
    await mock.close();
  }
});

test("get_playlist tool returns playlist songs as JSON", async () => {
  const mock = await startMockServer();
  try {
    const { client, transport } = await connect(mock);
    const res = await client.callTool({ name: "get_playlist", arguments: { id: "p1" } });
    const text = res.content.find((c) => c.type === "text")?.text ?? "";
    const data = JSON.parse(text);
    assert.equal(data.name, "Shoegaze vibes");
    assert.equal(data.songs.length, 2);
    assert.equal(data.songs[0].genre, "Shoegaze");
    await client.close();
    await transport.close();
  } finally {
    await mock.close();
  }
});

test("recommend_similar_songs merges and dedupes results", async () => {
  const mock = await startMockServer();
  try {
    const { client, transport } = await connect(mock);
    const res = await client.callTool({
      name: "recommend_similar_songs",
      arguments: { seedIds: ["s1", "s3"], count: 10 },
    });
    const text = res.content.find((c) => c.type === "text")?.text ?? "";
    const data = JSON.parse(text);
    // both seeds return [s2, s4]; merged set is {s2, s4}
    assert.equal(data.returned, 2);
    const ids = data.songs.map((s) => s.id).sort();
    assert.deepEqual(ids, ["s2", "s4"]);
    await client.close();
    await transport.close();
  } finally {
    await mock.close();
  }
});

test("create_playlist tool creates a playlist on the server", async () => {
  const mock = await startMockServer();
  try {
    const { client, transport } = await connect(mock);
    const res = await client.callTool({
      name: "create_playlist",
      arguments: { name: "Dream mix", songIds: ["s3"] },
    });
    const text = res.content.find((c) => c.type === "text")?.text ?? "";
    const data = JSON.parse(text);
    assert.equal(data.name, "Dream mix");
    assert.equal(data.songCount, 1);
    assert.ok(mock.state.playlist[data.id]);
    await client.close();
    await transport.close();
  } finally {
    await mock.close();
  }
});

test("full playlist-extension flow: get_playlist -> recommend -> update", async () => {
  const mock = await startMockServer();
  try {
    const { client, transport } = await connect(mock);

    // 1. LLM inspects the existing "shoegaze" playlist
    const pl = JSON.parse(
      (await client.callTool({ name: "get_playlist", arguments: { id: "p1" } })).content[0].text
    );
    const seedIds = pl.songs.map((s) => s.id);
    assert.deepEqual(seedIds, ["s1", "s3"]);

    // 2. LLM gets similar songs for the seeds
    const recs = JSON.parse(
      (
        await client.callTool({
          name: "recommend_similar_songs",
          arguments: { seedIds, count: 8 },
        })
      ).content[0].text
    );
    const newIds = recs.songs.map((s) => s.id);
    assert.deepEqual(newIds.sort(), ["s2", "s4"]);

    // 3. LLM appends them to reach 10
    await client.callTool({
      name: "update_playlist",
      arguments: { playlistId: "p1", songIdsToAdd: newIds },
    });
    assert.equal(mock.state.playlist.p1.songCount, 4);
    assert.deepEqual(mock.state.playlist.p1.entry.map((s) => s.id), ["s1", "s3", "s2", "s4"]);

    await client.close();
    await transport.close();
  } finally {
    await mock.close();
  }
});