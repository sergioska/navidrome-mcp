// Subsonic API response types (subset relevant to this MCP server).
// Mirrors the JSON produced by Navidrome's Subsonic-compatible endpoints.

export interface SubsonicResponse<T> {
  "subsonic-response": {
    status: "ok" | "failed";
    version: string;
    type?: string;
    serverVersion?: string;
    openSubsonic?: boolean;
    error?: { code: number; message: string };
  } & T;
}

export interface Song {
  id: string;
  parent?: string;
  title?: string;
  album?: string;
  artist?: string;
  isDir?: boolean;
  coverArt?: string;
  size?: number;
  contentType?: string;
  suffix?: string;
  duration?: number;
  bitRate?: number;
  path?: string;
  playCount?: number;
  discNumber?: number;
  track?: number;
  year?: number;
  genre?: string;
  created?: string;
  albumId?: string;
  artistId?: string;
  userRating?: number;
  starred?: string;
  type?: string;
}

export interface Album {
  id: string;
  name?: string;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  duration?: number;
  playCount?: number;
  created?: string;
  starred?: string;
  year?: number;
  genre?: string;
  isDir?: boolean;
  album?: string;
  title?: string;
}

export interface Artist {
  id: string;
  name?: string;
  coverArt?: string;
  albumCount?: number;
  starred?: string;
  artistImageUrl?: string;
  userRating?: number;
}

export interface Playlist {
  id: string;
  name?: string;
  comment?: string;
  songCount?: number;
  duration?: number;
  public?: boolean;
  owner?: string;
  created?: string;
  changed?: string;
}

export interface PlaylistWithSongs extends Playlist {
  entry?: Song[];
}

export interface Genre {
  name: string;
  songCount?: number;
  albumCount?: number;
}

export interface NowPlayingEntry {
  username?: string;
  minutesAgo?: number;
  playerId?: number;
  playerName?: string;
  song?: Song;
}

export interface SearchResult {
  artist?: Artist[];
  album?: Album[];
  song?: Song[];
}

export interface PlayQueueEntry {
  entry?: Song[];
  current?: string;
  position?: number;
  username?: string;
  changed?: string;
  changedBy?: string;
}

export interface Starred {
  artist?: Artist[];
  album?: Album[];
  song?: Song[];
}

export interface UserInfo {
  username?: string;
  email?: string;
  scrobblingEnabled?: boolean;
  maxBitRate?: number;
  adminRole?: boolean;
  settingsRole?: boolean;
  downloadRole?: boolean;
  uploadRole?: boolean;
  playlistRole?: boolean;
  coverArtRole?: boolean;
  commentRole?: boolean;
  podcastRole?: boolean;
  streamRole?: boolean;
  jukeboxRole?: boolean;
  shareRole?: boolean;
  videoConversionRole?: boolean;
  folder?: string[];
}

export interface MusicDirectory {
  id: string;
  name?: string;
  parent?: string;
  starred?: string;
  playCount?: number;
  userRating?: number;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  duration?: number;
  created?: string;
  year?: number;
  genre?: string;
  child?: Song[] | Album[];
}

export interface AlbumListData {
  album?: Album[];
}

export interface SongsByGenreData {
  song?: Song[];
}

export interface SimilarSongsData {
  song?: Song[];
}

export interface TopSongsData {
  song?: Song[];
}

export interface GenresData {
  genre?: Genre[];
}

export interface PlaylistsData {
  playlist?: Playlist[];
}

export interface PlaylistsDataEntry {
  playlist?: Playlist[];
}

export interface PlaylistData {
  playlist?: PlaylistWithSongs;
}