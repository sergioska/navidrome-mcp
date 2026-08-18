import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { SubsonicClient, SubsonicError } from "./subsonic/client.js";
import { registerAnnotationTools } from "./tools/annotation.js";
import { registerCoreTools } from "./tools/core.js";
import { registerPlaylistTools } from "./tools/playlists.js";
import { registerSmartTools } from "./tools/smart.js";

const SERVER_NAME = "navidrome-mcp";
const SERVER_VERSION = "0.1.0";

export async function main(args: string[] = process.argv): Promise<void> {
  if (args.includes("--smoke")) {
    await smokeTest();
    return;
  }
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      [
        "navidrome-mcp — MCP server for Navidrome (Subsonic API).",
        "",
        "Configuration (environment variables):",
        "  SUBSONIC_URL / NAVIDROME_URL   Server base URL, e.g. http://localhost:4533",
        "  SUBSONIC_USER / NAVIDROME_USER Username",
        "  SUBSONIC_PASSWORD              Password (or prefixed with enc: for hex-encoded)",
        "  SUBSONIC_TOKEN + SUBSONIC_SALT Token auth instead of password",
        "  SUBSONIC_CLIENT                Client name (default: navidrome-mcp)",
        "  SUBSONIC_VERSION               API version (default: 1.16.1)",
        "",
        "Run --smoke to verify connectivity against a live server.",
      ].join("\n")
    );
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    process.stderr.write(`[navidrome-mcp] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const client = new SubsonicClient(config);
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerCoreTools(server, client);
  registerPlaylistTools(server, client);
  registerAnnotationTools(server, client);
  registerSmartTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function smokeTest(): Promise<void> {
  const config = loadConfig();
  const client = new SubsonicClient(config);
  try {
    const res = await client.ping();
    process.stdout.write(
      `Connected to ${config.baseUrl} as ${config.username} (server API version ${res.version})\n`
    );
  } catch (err) {
    if (err instanceof SubsonicError) {
      process.stderr.write(`FAILED: ${err.message} (code=${err.code ?? "n/a"})\n`);
    } else {
      process.stderr.write(`FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`[navidrome-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}