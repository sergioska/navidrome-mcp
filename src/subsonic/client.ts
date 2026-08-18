import { createHash, randomBytes } from "node:crypto";
import { loadConfig, type Config } from "../config.js";
import type {
  Album,
  Artist,
  Genre,
  MusicDirectory,
  NowPlayingEntry,
  PlayQueueEntry,
  Playlist,
  PlaylistWithSongs,
  SearchResult,
  Song,
  Starred,
  SubsonicResponse,
  UserInfo,
} from "./types.js";

export class SubsonicError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly statusCode?: number
  ) {
    super(message);
    this.name = "SubsonicError";
  }
}

export interface RequestOptions {
  endpoint: string;
  params?: Record<string, string | number | boolean | string[] | number[] | undefined>;
}

interface SongLike {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  duration?: number;
  playCount?: number;
  userRating?: number;
  starred?: string;
  albumId?: string;
  artistId?: string;
  year?: number;
  track?: number;
  coverArt?: string;
  path?: string;
}

export class SubsonicClient {
  readonly config: Config;
  private readonly baseParams: Record<string, string>;

  constructor(config: Config = loadConfig()) {
    this.config = config;

    const base: Record<string, string> = {
      u: config.username,
      v: config.version,
      c: config.client,
      f: "json",
    };

    if (config.token && config.salt) {
      base.t = config.token;
      base.s = config.salt;
    } else if (config.password) {
      base.p = config.password;
    }
    this.baseParams = base;
  }

  /**
   * Build a token + salt pair from a password, for servers that require
   * token-based auth (token = md5(password + salt)).
   */
  static makeToken(password: string, salt = randomBytes(8).toString("hex")): { token: string; salt: string } {
    return { token: createHash("md5").update(password + salt).digest("hex"), salt };
  }

  async request<T extends Record<string, unknown>>(
    endpoint: string,
    params: RequestOptions["params"] = {}
  ): Promise<T> {
    const query = new URLSearchParams(this.baseParams);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) query.append(key, String(item));
      } else {
        query.set(key, String(value));
      }
    }

    const url = `${this.config.baseUrl}/rest/${endpoint}?${query.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (err) {
      throw new SubsonicError(
        `Request to ${endpoint} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new SubsonicError(
        `HTTP ${res.status} ${res.statusText} from ${endpoint}`,
        undefined,
        res.status
      );
    }

    const body = (await res.json()) as SubsonicResponse<T>;
    const root = body["subsonic-response"];
    if (!root) {
      throw new SubsonicError(`Malformed response from ${endpoint}`);
    }
    if (root.status !== "ok") {
      throw new SubsonicError(
        root.error?.message ?? `Subsonic error (code ${root.error?.code ?? "unknown"})`,
        root.error?.code
      );
    }
    return root;
  }

  // ----- Core endpoints -------------------------------------------------

  async ping(): Promise<{ version: string }> {
    return this.request("ping");
  }

  async getLicense(): Promise<Record<string, unknown>> {
    return this.request("getLicense");
  }

  async getUser(): Promise<{ user: UserInfo }> {
    return this.request("getUser");
  }

  async search(
    query: string,
    opts: { artistCount?: number; albumCount?: number; songCount?: number } = {}
  ): Promise<SearchResult> {
    const res = await this.request<{ searchResult3: SearchResult }>("search3", {
      query,
      artistCount: opts.artistCount ?? 10,
      albumCount: opts.albumCount ?? 10,
      songCount: opts.songCount ?? 20,
    });
    return res.searchResult3 ?? {};
  }

  async getSong(id: string): Promise<Song | undefined> {
    const res = await this.request<{ song: Song }>("getSong", { id });
    return res.song;
  }

  async getAlbum(id: string): Promise<{ album: { id: string; name?: string; artist?: string; genre?: string; year?: number; songCount?: number } & { song?: Song[] } }> {
    return this.request("getAlbum", { id });
  }

  async getArtist(id: string): Promise<{ artist: { id: string; name?: string; albumCount?: number } & { album?: Album[] } }> {
    return this.request("getArtist", { id });
  }

  async getGenres(): Promise<Genre[]> {
    const res = await this.request<{ genres: { genre?: Genre[] } }>("getGenres");
    return res.genres?.genre ?? [];
  }

  async getMusicDirectory(id: string): Promise<MusicDirectory> {
    const res = await this.request<{ directory: MusicDirectory }>("getMusicDirectory", { id });
    return res.directory;
  }

  async getTopSongs(artist: string, count = 20): Promise<Song[]> {
    const res = await this.request<{ topSongs: { song?: Song[] } }>("getTopSongs", { artist, count });
    return res.topSongs?.song ?? [];
  }

  async getSimilarSongs(id: string, count = 20): Promise<Song[]> {
    const res = await this.request<{ similarSongs2: { song?: Song[] } }>("getSimilarSongs2", {
      id,
      count,
    });
    return res.similarSongs2?.song ?? [];
  }

  async getNowPlaying(): Promise<NowPlayingEntry[]> {
    const res = await this.request<{ nowPlaying: { entry?: NowPlayingEntry[] } }>("getNowPlaying");
    return res.nowPlaying?.entry ?? [];
  }

  async getPlayQueue(): Promise<PlayQueueEntry> {
    const res = await this.request<{ playQueue: PlayQueueEntry }>("getPlayQueue");
    return res.playQueue ?? {};
  }

  async getStarred(): Promise<Starred> {
    const res = await this.request<{ starred2: Starred }>("getStarred2");
    return res.starred2 ?? {};
  }

  async getRandomSongs(opts: { size?: number; genre?: string; fromYear?: number; toYear?: number } = {}): Promise<Song[]> {
    const res = await this.request<{ randomSongs: { song?: Song[] } }>("getRandomSongs", {
      size: opts.size ?? 10,
      genre: opts.genre,
      fromYear: opts.fromYear,
      toYear: opts.toYear,
    });
    return res.randomSongs?.song ?? [];
  }

  async getSongsByGenre(genre: string, opts: { count?: number; offset?: number } = {}): Promise<Song[]> {
    const res = await this.request<{ songsByGenre: { song?: Song[] } }>("getSongsByGenre", {
      genre,
      count: opts.count ?? 20,
      offset: opts.offset ?? 0,
    });
    return res.songsByGenre?.song ?? [];
  }

  async getAlbumList(
    type: string,
    opts: { size?: number; offset?: number; genre?: string; fromYear?: number; toYear?: number } = {}
  ): Promise<Album[]> {
    const res = await this.request<{ albumList2: { album?: Album[] } }>("getAlbumList2", {
      type,
      size: opts.size ?? 10,
      offset: opts.offset ?? 0,
      genre: opts.genre,
      fromYear: opts.fromYear,
      toYear: opts.toYear,
    });
    return res.albumList2?.album ?? [];
  }

  async getPlaylists(): Promise<Playlist[]> {
    const res = await this.request<{ playlists: { playlist?: Playlist[] } }>("getPlaylists");
    return res.playlists?.playlist ?? [];
  }

  async getPlaylist(id: string): Promise<PlaylistWithSongs> {
    const res = await this.request<{ playlist: PlaylistWithSongs }>("getPlaylist", { id });
    return res.playlist;
  }

  async createPlaylist(name: string, songIds: string[] = [], playlistId?: string): Promise<PlaylistWithSongs> {
    const params: RequestOptions["params"] = { name, songId: songIds };
    if (playlistId) params.playlistId = playlistId;
    const res = await this.request<{ playlist: PlaylistWithSongs }>("createPlaylist", params);
    return res.playlist;
  }

  async updatePlaylist(
    playlistId: string,
    opts: {
      songIdsToAdd?: string[];
      songIndexesToRemove?: number[];
      name?: string;
      comment?: string;
      public?: boolean;
    } = {}
  ): Promise<void> {
    await this.request("updatePlaylist", {
      playlistId,
      songIdToAdd: opts.songIdsToAdd,
      songIndexToRemove: opts.songIndexesToRemove,
      name: opts.name,
      comment: opts.comment,
      public: opts.public,
    });
  }

  async deletePlaylist(id: string): Promise<void> {
    await this.request("deletePlaylist", { id });
  }

  async setRating(id: string, rating: number): Promise<void> {
    await this.request("setRating", { id, rating });
  }

  async star(ids: string[]): Promise<void> {
    await this.request("star", { id: ids });
  }

  async unstar(ids: string[]): Promise<void> {
    await this.request("unstar", { id: ids });
  }

  async scrobble(ids: string[], submission = true, times?: number[]): Promise<void> {
    await this.request("scrobble", { id: ids, submission, time: times });
  }

  // ----- Normalization (compact views for the LLM) ----------------------

  normalizeSong(s: Partial<SongLike>): Record<string, unknown> {
    return {
      id: s.id,
      title: s.title,
      artist: s.artist,
      album: s.album,
      genre: s.genre,
      year: s.year,
      duration: s.duration,
      playCount: s.playCount,
      userRating: s.userRating,
      starred: s.starred ? true : undefined,
      albumId: s.albumId,
      artistId: s.artistId,
      track: s.track,
      coverArt: s.coverArt,
    };
  }

  normalizeAlbum(a: Album): Record<string, unknown> {
    return {
      id: a.id,
      name: a.name ?? a.title,
      artist: a.artist,
      artistId: a.artistId,
      genre: a.genre,
      year: a.year,
      songCount: a.songCount,
      duration: a.duration,
      playCount: a.playCount,
      starred: a.starred ? true : undefined,
      coverArt: a.coverArt,
    };
  }

  normalizeArtist(a: Artist): Record<string, unknown> {
    return {
      id: a.id,
      name: a.name,
      albumCount: a.albumCount,
      starred: a.starred ? true : undefined,
      coverArt: a.coverArt,
    };
  }
}