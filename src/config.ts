export interface Config {
  baseUrl: string;
  username: string;
  password?: string;
  token?: string;
  salt?: string;
  client: string;
  version: string;
  timeoutMs: number;
}

function first(...values: (string | undefined)[]): string | undefined {
  for (const v of values) {
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const baseUrl = first(env.SUBSONIC_URL, env.NAVIDROME_URL, env.SUB_MUSIC_URL);
  if (!baseUrl) {
    throw new Error(
      "Missing server URL. Set SUBSONIC_URL (or NAVIDROME_URL). Example: SUBSONIC_URL=http://localhost:4533"
    );
  }
  const username = first(env.SUBSONIC_USER, env.NAVIDROME_USER, env.SUB_MUSIC_USER);
  if (!username) {
    throw new Error("Missing username. Set SUBSONIC_USER (or NAVIDROME_USER).");
  }

  const password = first(env.SUBSONIC_PASSWORD, env.NAVIDROME_PASSWORD, env.SUB_MUSIC_PASSWORD);
  const token = first(env.SUBSONIC_TOKEN, env.NAVIDROME_TOKEN);
  const salt = first(env.SUBSONIC_SALT, env.NAVIDROME_SALT);

  if (!password && !(token && salt)) {
    throw new Error(
      "Missing credentials. Set SUBSONIC_PASSWORD (or NAVIDROME_PASSWORD), or SUBSONIC_TOKEN + SUBSONIC_SALT."
    );
  }
  if (token && !salt) {
    throw new Error("SUBSONIC_TOKEN set but SUBSONIC_SALT is missing.");
  }
  if (!token && salt) {
    throw new Error("SUBSONIC_SALT set but SUBSONIC_TOKEN is missing.");
  }

  const rawTimeout = Number(first(env.SUBSONIC_TIMEOUT, env.SUB_MUSIC_TIMEOUT) ?? 30000);
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 30000;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    username,
    password,
    token,
    salt,
    client: first(env.SUBSONIC_CLIENT, env.SUB_MUSIC_CLIENT) ?? "navidrome-mcp",
    version: first(env.SUBSONIC_VERSION, env.SUB_MUSIC_VERSION) ?? "1.16.1",
    timeoutMs,
  };
}