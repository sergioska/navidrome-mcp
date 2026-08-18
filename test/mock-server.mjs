import { createServer } from "node:http";

export function ok(payload) {
  return { "subsonic-response": { status: "ok", version: "1.16.1", ...payload } };
}

export function fail(message, code = 40) {
  return {
    "subsonic-response": {
      status: "failed",
      version: "1.16.1",
      error: { code, message },
    },
  };
}

/**
 * Starts a mock Subsonic server implementing a small slice of the API,
 * with a per-endpoint handler map that can be overridden by the caller.
 */
export async function startMockServer(handlers = {}) {
  const state = {
    song: {
      s1: { id: "s1", title: "Only Shallow", artist: "My Bloody Valentine", album: "Loveless", genre: "Shoegaze", year: 1991, duration: 205, playCount: 42, userRating: 5, albumId: "a1", artistId: "ar1" },
      s2: { id: "s2", title: "When You Sleep", artist: "My Bloody Valentine", album: "Loveless", genre: "Shoegaze", year: 1991, duration: 251, playCount: 37, albumId: "a1", artistId: "ar1" },
      s3: { id: "s3", title: "Cherry-coloured Funk", artist: "Cocteau Twins", album: "Heaven or Las Vegas", genre: "Dream Pop", year: 1990, duration: 192, playCount: 21, userRating: 4, albumId: "a2", artistId: "ar2" },
      s4: { id: "s4", title: "Crazy for You", artist: "Slowdive", album: "Pygmalion", genre: "Shoegaze", year: 1995, duration: 394, playCount: 9, albumId: "a3", artistId: "ar3" },
    },
    album: {
      a1: { id: "a1", name: "Loveless", artist: "My Bloody Valentine", artistId: "ar1", genre: "Shoegaze", year: 1991, songCount: 2, playCount: 79 },
      a2: { id: "a2", name: "Heaven or Las Vegas", artist: "Cocteau Twins", artistId: "ar2", genre: "Dream Pop", year: 1990, songCount: 1, playCount: 21 },
      a3: { id: "a3", name: "Pygmalion", artist: "Slowdive", artistId: "ar3", genre: "Shoegaze", year: 1995, songCount: 1, playCount: 9 },
    },
    artist: {
      ar1: { id: "ar1", name: "My Bloody Valentine", albumCount: 1 },
      ar2: { id: "ar2", name: "Cocteau Twins", albumCount: 1 },
      ar3: { id: "ar3", name: "Slowdive", albumCount: 1 },
    },
    playlist: {
      p1: {
        id: "p1",
        name: "Shoegaze vibes",
        songCount: 2,
        duration: 456,
        entry: [
          { id: "s1", title: "Only Shallow", artist: "My Bloody Valentine", album: "Loveless", genre: "Shoegaze", albumId: "a1", artistId: "ar1" },
          { id: "s3", title: "Cherry-coloured Funk", artist: "Cocteau Twins", album: "Heaven or Las Vegas", genre: "Dream Pop", albumId: "a2", artistId: "ar2" },
        ],
      },
    },
    authChecks: [],
    requests: [],
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const params = url.searchParams;
    const ep = url.pathname.replace(/^\/rest\//, "").replace(/\.view$/, "");

    // Record auth + request for assertions
    state.requests.push({ ep, params: Object.fromEntries(params) });
    state.authChecks.push({
      u: params.get("u"),
      v: params.get("v"),
      c: params.get("c"),
      f: params.get("f"),
      t: params.get("t"),
      s: params.get("s"),
      p: params.get("p"),
    });

    const custom = handlers[ep];
    if (custom) {
      res.setHeader("content-type", "application/json");
      try {
        res.end(JSON.stringify(custom(params, state)));
      } catch {
        res.statusCode = 500;
        res.end(JSON.stringify({ "subsonic-response": { status: "failed", version: "1.16.1", error: { code: 0, message: "internal mock error" } } }));
      }
      return;
    }

    let body;
    switch (ep) {
      case "ping":
        body = ok({});
        break;
      case "getUser":
        body = ok({ user: { username: params.get("u"), playlistRole: true, streamRole: true } });
        break;
      case "getGenres":
        body = ok({ genres: { genre: [{ name: "Shoegaze", songCount: 2, albumCount: 1 }, { name: "Dream Pop", songCount: 1, albumCount: 1 }] } });
        break;
      case "getSong":
        body = state.song[params.get("id")] ? ok({ song: state.song[params.get("id")] }) : fail("Song not found", 70);
        break;
      case "getAlbum":
        body = state.album[params.get("id")]
          ? ok({
              album: {
                ...state.album[params.get("id")],
                song: Object.values(state.song).filter((s) => s.albumId === params.get("id")),
              },
            })
          : fail("Album not found", 70);
        break;
      case "getArtist":
        body = state.artist[params.get("id")]
          ? ok({
              artist: {
                ...state.artist[params.get("id")],
                album: Object.values(state.album).filter((a) => a.artistId === params.get("id")),
              },
            })
          : fail("Artist not found", 70);
        break;
      case "getMusicDirectory":
        body = ok({ directory: { id: params.get("id"), name: "Loveless", child: Object.values(state.song) } });
        break;
      case "getSimilarSongs2":
        body = ok({ similarSongs2: { song: [state.song.s2, state.song.s4] } });
        break;
      case "getTopSongs":
        body = ok({ topSongs: { song: [state.song.s1, state.song.s2] } });
        break;
      case "getNowPlaying":
        body = ok({ nowPlaying: { entry: [{ username: "alice", minutesAgo: 2, playerName: "mcp-test", song: state.song.s1 }] } });
        break;
      case "getPlayQueue":
        body = ok({ playQueue: { current: "s1", position: 0, entry: [state.song.s1, state.song.s2] } });
        break;
      case "getStarred2":
        body = ok({ starred2: { artist: [state.artist.ar1], album: [state.album.a2], song: [state.song.s3] } });
        break;
      case "getRandomSongs":
        body = ok({ randomSongs: { song: [state.song.s1, state.song.s4] } });
        break;
      case "getSongsByGenre":
        body = ok({ songsByGenre: { song: Object.values(state.song).filter((s) => s.genre.toLowerCase() === params.get("genre").toLowerCase()) } });
        break;
      case "getAlbumList2": {
        const size = Number(params.get("size") ?? 10);
        const albums = Object.values(state.album).slice(0, size);
        body = ok({ albumList2: { album: albums } });
        break;
      }
      case "getPlaylists":
        body = ok({ playlists: { playlist: Object.values(state.playlist) } });
        break;
      case "getPlaylist":
        body = state.playlist[params.get("id")] ? ok({ playlist: state.playlist[params.get("id")] }) : fail("Playlist not found", 70);
        break;
      case "createPlaylist": {
        const pl = { id: `p${Object.keys(state.playlist).length + 1}`, name: params.get("name"), songCount: 0, duration: 0, entry: [] };
        const ids = params.getAll("songId");
        pl.entry = ids.map((id) => state.song[id]).filter(Boolean);
        pl.songCount = pl.entry.length;
        state.playlist[pl.id] = pl;
        body = ok({ playlist: pl });
        break;
      }
      case "updatePlaylist": {
        const pl = state.playlist[params.get("playlistId")];
        if (!pl) {
          body = fail("Playlist not found", 70);
          break;
        }
        const toAdd = params.getAll("songIdToAdd").map((id) => state.song[id]).filter(Boolean);
        pl.entry = [...(pl.entry ?? []), ...toAdd];
        pl.songCount = pl.entry.length;
        pl.duration = pl.entry.reduce((acc, s) => acc + (s.duration ?? 0), 0);
        body = ok({});
        break;
      }
      case "deletePlaylist": {
        delete state.playlist[params.get("id")];
        body = ok({});
        break;
      }
      case "setRating":
      case "star":
      case "unstar":
      case "scrobble":
        body = ok({});
        break;
      case "search3":
        body = ok({
          searchResult3: {
            artist: [state.artist.ar1],
            album: [state.album.a1],
            song: [state.song.s1],
          },
        });
        break;
      default:
        body = fail(`Endpoint ${ep} not mocked`, 40);
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    state,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}