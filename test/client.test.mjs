import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { startMockServer, fail } from "./mock-server.mjs";
import { SubsonicClient } from "../dist/subsonic/client.js";
import { loadConfig } from "../dist/config.js";
import { SubsonicError } from "../dist/subsonic/client.js";

async function makeClient(mock) {
  const config = loadConfig({
    SUBSONIC_URL: mock.baseUrl,
    SUBSONIC_USER: "alice",
    SUBSONIC_PASSWORD: "secret",
    SUBSONIC_CLIENT: "navidrome-mcp-test",
  });
  return new SubsonicClient(config);
}

test("ping returns ok", async () => {
  const mock = await startMockServer();
  try {
    const client = await makeClient(mock);
    const res = await client.ping();
    assert.ok(res.version);
  } finally {
    await mock.close();
  }
});

test("request sends auth + required params", async () => {
  const mock = await startMockServer();
  try {
    const client = await makeClient(mock);
    await client.getGenres();
    const a = mock.state.authChecks[0];
    assert.equal(a.u, "alice");
    assert.equal(a.v, "1.16.1");
    assert.equal(a.c, "navidrome-mcp-test");
    assert.equal(a.f, "json");
    assert.equal(a.p, "secret");
  } finally {
    await mock.close();
  }
});

test("token auth is used when configured", async () => {
  const mock = await startMockServer();
  try {
    const config = loadConfig({
      SUBSONIC_URL: mock.baseUrl,
      SUBSONIC_USER: "alice",
      SUBSONIC_TOKEN: "abc123",
      SUBSONIC_SALT: "salt123",
    });
    const client = new SubsonicClient(config);
    await client.ping();
    const a = mock.state.authChecks[0];
    assert.equal(a.t, "abc123");
    assert.equal(a.s, "salt123");
    assert.equal(a.p, null);
  } finally {
    await mock.close();
  }
});

test("search normalizes artists/albums/songs", async () => {
  const mock = await startMockServer();
  try {
    const client = await makeClient(mock);
    const res = await client.search("my bloody");
    assert.equal(res.artist[0].name, "My Bloody Valentine");
    assert.equal(res.album[0].name, "Loveless");
    assert.equal(res.song[0].title, "Only Shallow");
    assert.equal(res.song[0].playCount, 42);
  } finally {
    await mock.close();
  }
});

test("getAlbumList2 returns albums", async () => {
  const mock = await startMockServer();
  try {
    const client = await makeClient(mock);
    const albums = await client.getAlbumList("frequent", { size: 3 });
    assert.equal(albums.length, 3);
    assert.equal(albums[0].name, "Loveless");
  } finally {
    await mock.close();
  }
});

test("getSongsByGenre filters by genre", async () => {
  const mock = await startMockServer();
  try {
    const client = await makeClient(mock);
    const songs = await client.getSongsByGenre("shoegaze");
    assert.ok(songs.every((s) => s.genre.toLowerCase() === "shoegaze"));
  } finally {
    await mock.close();
  }
});

test("createPlaylist returns new playlist with songs", async () => {
  const mock = await startMockServer();
  try {
    const client = await makeClient(mock);
    const pl = await client.createPlaylist("New mix", ["s1", "s2"]);
    assert.equal(pl.name, "New mix");
    assert.equal(pl.songCount, 2);
    assert.equal(pl.entry[0].title, "Only Shallow");
  } finally {
    await mock.close();
  }
});

test("updatePlaylist adds songs", async () => {
  const mock = await startMockServer();
  try {
    const client = await makeClient(mock);
    await client.updatePlaylist("p1", { songIdsToAdd: ["s4"] });
    assert.equal(mock.state.playlist.p1.songCount, 3);
    assert.equal(mock.state.playlist.p1.entry[2].title, "Crazy for You");
  } finally {
    await mock.close();
  }
});

test("updatePlaylist removes songs by index", async () => {
  const mock = await startMockServer();
  try {
    const client = await makeClient(mock);
    await client.updatePlaylist("p1", { songIndexesToRemove: [1] });
    const req = mock.state.requests.find((r) => r.ep === "updatePlaylist");
    assert.ok(req.params.songIndexToRemove.includes("1"));
  } finally {
    await mock.close();
  }
});

test("getSimilarSongs returns songs", async () => {
  const mock = await startMockServer();
  try {
    const client = await makeClient(mock);
    const songs = await client.getSimilarSongs("s1", 5);
    assert.equal(songs.length, 2);
    assert.equal(songs[0].id, "s2");
  } finally {
    await mock.close();
  }
});

test("errors surface as SubsonicError with code", async () => {
  const mock = await startMockServer({
    getSong: () => fail("Song not found", 70),
  });
  try {
    const client = await makeClient(mock);
    await assert.rejects(
      () => client.getSong("missing"),
      (err) => err.name === "SubsonicError" && err.code === 70
    );
  } finally {
    await mock.close();
  }
});

test("server HTTP error surfaces as SubsonicError", async () => {
  // A Subsonic server answering 500 with non-JSON body should yield a
  // SubsonicError rather than crashing.
  const httpMock = await startMockServer({
    ping: () => {
      throw new Error("boom");
    },
  });
  httpMock.state.authChecks = [];
  try {
    // Node's default handler turns a thrown handler error into an HTTP 500
    // with an HTML body.
    const client = await makeClient(httpMock);
    await assert.rejects(
      () => client.ping(),
      (err) => err instanceof SubsonicError
    );
  } finally {
    await httpMock.close();
  }
});

test("loadConfig requires url, user and credentials", () => {
  assert.throws(() => loadConfig({}), /Missing server URL/);
  assert.throws(() => loadConfig({ SUBSONIC_URL: "http://x" }), /Missing username/);
  assert.throws(
    () => loadConfig({ SUBSONIC_URL: "http://x", SUBSONIC_USER: "u" }),
    /Missing credentials/
  );
  assert.throws(
    () => loadConfig({ SUBSONIC_URL: "http://x", SUBSONIC_USER: "u", SUBSONIC_TOKEN: "t" }),
    /SUBSONIC_SALT/
  );
});

test("makeToken produces md5(password+salt)", () => {
  const { token, salt } = SubsonicClient.makeToken("secret", "fixed");
  assert.equal(token, createHash("md5").update("secretfixed").digest("hex"));
});