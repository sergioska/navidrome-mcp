# navidrome-mcp

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/N8M125D6O0)

An [MCP](https://modelcontextprotocol.io) server that exposes your [Navidrome](https://www.navidrome.org) music library to LLM assistants, so you can manage your music with natural language:

> "Visti i miei ultimi ascolti e le mie preferenze musicali, fammi una playlist di 10 brani."

> "Ho fatto questa playlist di brani shoegaze, aggiungi altri brani dello stesso mood e genere per arrivare a 10 brani."

It talks to Navidrome through its **Subsonic-compatible API** (`/rest/*`), which means:

- it works against **any Subsonic server** (Navidrome, Airsonic, Airsonic-Advanced, Gonic, Astiga, …), and
- it only ever uses standard Subsonic endpoints, so the same calls are usable from any Subsonic client (e.g. DSub, Subtracks, Sonixd, Symfonium).

No music-specific ML models are bundled: the server fetches rich, compact data (genres, play counts, ratings, favorites, similar tracks) and the LLM does the curation — picking tracks, ordering a playlist, and writing it back through the same API.

## Features

- **Discover the library**: search, get songs/albums/artists, browse directories, list genres.
- **Understand the user**: one-call `get_music_profile` aggregates most-played albums, highest-rated albums, starred songs/albums/artists, what's playing now and the last saved play queue.
- **Recommend**: `get_similar_songs` (per seed track, based on similar-artist metadata like Last.fm/ListenBrainz) and `recommend_similar_songs` (multi-seed, merged + deduplicated pool).
- **Manage playlists**: list, read (with full track lists), create, update (add/remove/rename), delete.
- **Annotate**: rate, star/unstar, scrobble.
- **Standard auth**: plain password, `enc:` hex password, or token (`t`+`s`).

## Requirements

- Node.js ≥ 18
- A running Navidrome (or other Subsonic server)

## Install & build

```bash
git clone <this repo>
cd navidrome-mcp
npm install
npm run build     # outputs to dist/
npm test          # runs the full suite (client + end-to-end MCP over stdio)
```

## Configuration

The server reads its configuration from environment variables:

| Variable | Description | Required |
| --- | --- | --- |
| `SUBSONIC_URL` (alias `NAVIDROME_URL`) | Base URL, e.g. `http://localhost:4533` | yes |
| `SUBSONIC_USER` (alias `NAVIDROME_USER`) | Username | yes |
| `SUBSONIC_PASSWORD` (alias `NAVIDROME_PASSWORD`) | Password. May be prefixed with `enc:` for hex-encoded. | one of these |
| `SUBSONIC_TOKEN` + `SUBSONIC_SALT` | Token auth (`token = md5(password + salt)`), the secure Subsonic scheme | one of these |
| `SUBSONIC_CLIENT` | Client name sent to the server (default `navidrome-mcp`) | no |
| `SUBSONIC_VERSION` | API version (default `1.16.1`) | no |
| `SUBSONIC_TIMEOUT` | HTTP timeout in ms (default `30000`) | no |

Verify connectivity before wiring it up:

```bash
SUBSONIC_URL=http://localhost:4533 SUBSONIC_USER=me SUBSONIC_PASSWORD=secret node dist/index.js --smoke
# Connected to http://localhost:4533 as me (server API version 1.16.1)
```

## Tools

### Discovery & browsing
| Tool | Subsonic endpoint | Purpose |
| --- | --- | --- |
| `ping` | `ping` | Connectivity check |
| `get_user` | `getUser` | Current user profile & roles |
| `search` | `search3` | Search artists/albums/songs by keyword |
| `get_song` | `getSong` | Song details (genre, playCount, rating, starred, …) |
| `get_album` | `getAlbum` | Album + full track list |
| `get_artist` | `getArtist` | Artist + albums |
| `get_genres` | `getGenres` | All genres with song/album counts |
| `get_music_directory` | `getMusicDirectory` | Directory children (albums or songs) |
| `get_top_songs` | `getTopSongs` | Most popular songs of an artist (external metadata) |
| `get_similar_songs` | `getSimilarSongs2` | Songs similar to a seed song/artist (external metadata) |
| `get_now_playing` | `getNowPlaying` | What's currently playing |
| `get_play_queue` | `getPlayQueue` | Last saved play queue (recent listening context) |
| `get_starred` | `getStarred2` | Starred songs/albums/artists (favorites) |
| `get_random_songs` | `getRandomSongs` | Random songs, optionally by genre/year |
| `get_songs_by_genre` | `getSongsByGenre` | Songs of a given genre |
| `get_album_list` | `getAlbumList2` | Albums by list type (`frequent`, `highest`, `starred`, `newest`, `recent`, `random`, `byGenre`, `byYear`) |

### Smart composites (built on the above)
| Tool | Purpose |
| --- | --- |
| `get_music_profile` | One-call snapshot of taste + recent listening: most-played albums, highest-rated albums, starred, now playing, last play queue. Ideal first call for "make me a playlist from my tastes". |
| `recommend_similar_songs` | Merged + deduplicated pool of similar songs for several seed tracks. Ideal for "extend this playlist with more tracks like these". |

### Playlists
| Tool | Subsonic endpoint | Purpose |
| --- | --- | --- |
| `get_playlists` | `getPlaylists` | List playlists |
| `get_playlist` | `getPlaylist` | Playlist + full track list |
| `create_playlist` | `createPlaylist` | Create playlist (with optional initial songs) |
| `update_playlist` | `updatePlaylist` | Add songs (`songIdsToAdd`), remove by index, rename, set comment/public |
| `delete_playlist` | `deletePlaylist` | Delete a playlist |

### Annotation
| Tool | Subsonic endpoint | Purpose |
| --- | --- | --- |
| `set_rating` | `setRating` | Rate 1–5 |
| `star` / `unstar` | `star` / `unstar` | Toggle favorites |
| `scrobble` | `scrobble` | Report plays / now playing |

## How the example prompts are solved

**"Visti i miei ultimi ascolti e le mie preferenze musicali, fammi una playlist di 10 brani"**

1. LLM calls `get_music_profile` → gets most-played albums, starred tracks, ratings, now playing, last queue.
2. LLM calls `get_similar_songs` / `get_songs_by_genre` / `search` / `get_album` on the interesting seeds to assemble candidate tracks.
3. LLM picks 10 and calls `create_playlist(name, songIds)`.

**"Ho fatto questa playlist di brani shoegaze, aggiungi altri brani dello stesso mood e genere per arrivare a 10 brani"**

1. LLM calls `get_playlist(id)` → sees the tracks (and their genres) already in it.
2. LLM calls `recommend_similar_songs(seedIds=[…tracks in the playlist…])` and/or `get_songs_by_genre(genre="shoegaze")` for candidates.
3. LLM calls `update_playlist(playlistId, songIdsToAdd=[…])` to reach 10.

## Wiring it up

### opencode

Add the server to `opencode.json` (see `opencode.example.json`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "navidrome": {
      "type": "local",
      "command": ["node", "/path/to/navidrome-mcp/dist/index.js"],
      "environment": {
        "SUBSONIC_URL": "http://localhost:4533",
        "SUBSONIC_USER": "your-user",
        "SUBSONIC_PASSWORD": "your-password"
      }
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "navidrome": {
      "command": "node",
      "args": ["/path/to/navidrome-mcp/dist/index.js"],
      "env": {
        "SUBSONIC_URL": "http://localhost:4533",
        "SUBSONIC_USER": "your-user",
        "SUBSONIC_PASSWORD": "your-password"
      }
    }
  }
}
```

### Any other MCP client

Point it at `node /path/to/navidrome-mcp/dist/index.js` (stdio transport) with the environment variables above.

## Subsonic API compatibility

The MCP server is a thin, dependency-light Subsonic client: every tool maps 1:1 to a `/rest/<endpoint>` call using only standard parameters (`u`, `v`, `c`, `f=json`, and `p` or `t`+`s` for auth). Because of this:

- A Subsonic client can reproduce any tool's effect by calling the corresponding endpoint directly.
- The server works against any Subsonic-compatible server, not only Navidrome.

Notes on the endpoints used (as implemented by Navidrome):

- `getSimilarSongs2` / `getTopSongs` rely on external metadata (Last.fm/ListenBrainz/Spotify) — if that isn't configured, they may return empty lists. `recommend_similar_songs` reports per-seed failures so the LLM can fall back to `get_songs_by_genre` / `get_album_list`.
- `getAlbumList2` type `recent` means *recently added*, not *recently played*; recent listening is covered by `getNowPlaying` and `getPlayQueue`.
- Album/song IDs are server-side (Navidrome UUIDs); always fetch IDs via the read tools before writing.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run build       # compile to dist/
npm test            # client unit tests + end-to-end MCP tests over stdio
```

Tests run against an in-memory mock Subsonic server (`test/mock-server.mjs`), no real server needed.

## License

MIT