import * as log from "@std/log";

export interface Config {
  UPLOADS_DIR: string;
  BACKEND_URL: string;
  MAX_FILE_SIZE: number;
  CHUNK_TIMEOUT_MS: number;
  MP3_BITRATE: string;
  FETCH_TIMEOUT_MS: number;
  MAX_STREAM_BYTES: number;
}

function parseIntStrict(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric config value: "${value}"`);
  }
  return parsed;
}

function validateConfig(config: Config): void {
  if (!config.UPLOADS_DIR) {
    throw new Error("UPLOADS_DIR must not be empty");
  }
  try {
    new URL(config.BACKEND_URL);
  } catch {
    throw new Error(`Invalid BACKEND_URL: "${config.BACKEND_URL}"`);
  }
  if (!/^\d+k$/.test(config.MP3_BITRATE)) {
    throw new Error(`Invalid MP3_BITRATE: "${config.MP3_BITRATE}" (expected format like "64k")`);
  }
}

export function loadConfig(): Config {
  const config: Config = {
    UPLOADS_DIR: Deno.env.get("UPLOADS_DIR") || "/app/uploads",
    BACKEND_URL: Deno.env.get("BACKEND_URL") || "http://api:4000/messages",
    MAX_FILE_SIZE: parseIntStrict(Deno.env.get("MAX_FILE_SIZE"), 10_000_000),
    CHUNK_TIMEOUT_MS: parseIntStrict(Deno.env.get("CHUNK_TIMEOUT_MS"), 2000),
    MP3_BITRATE: Deno.env.get("MP3_BITRATE") || "64k",
    FETCH_TIMEOUT_MS: parseIntStrict(Deno.env.get("FETCH_TIMEOUT_MS"), 30_000),
    MAX_STREAM_BYTES: parseIntStrict(Deno.env.get("MAX_STREAM_BYTES"), 10_000_000),
  };
  validateConfig(config);
  log.info("Config loaded", config);
  return config;
}
