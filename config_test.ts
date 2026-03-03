import { assertEquals, assertThrows } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { loadConfig } from "./config.ts";

const ENV_KEYS = [
  "BACKEND_URL",
  "MAX_FILE_SIZE",
  "CHUNK_TIMEOUT_MS",
  "MP3_BITRATE",
  "FETCH_TIMEOUT_MS",
  "MAX_STREAM_BYTES",
  "IDLE_TIMEOUT_MS",
];

describe("loadConfig", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = Deno.env.get(key);
      Deno.env.delete(key);
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] !== undefined) {
        Deno.env.set(key, saved[key]!);
      } else {
        Deno.env.delete(key);
      }
    }
  });

  it("returns valid defaults when no env vars set", () => {
    const config = loadConfig();
    assertEquals(config.BACKEND_URL, "http://api:4000/messages");
    assertEquals(config.MAX_FILE_SIZE, 10_000_000);
    assertEquals(config.CHUNK_TIMEOUT_MS, 2000);
    assertEquals(config.MP3_BITRATE, "64k");
    assertEquals(config.FETCH_TIMEOUT_MS, 30_000);
    assertEquals(config.MAX_STREAM_BYTES, 10_000_000);
    assertEquals(config.IDLE_TIMEOUT_MS, 300_000);
  });

  it("accepts valid custom values", () => {
    Deno.env.set("BACKEND_URL", "http://localhost:3000/api");
    Deno.env.set("MAX_FILE_SIZE", "5000000");
    Deno.env.set("CHUNK_TIMEOUT_MS", "5000");
    Deno.env.set("MP3_BITRATE", "128k");
    Deno.env.set("FETCH_TIMEOUT_MS", "60000");
    Deno.env.set("MAX_STREAM_BYTES", "20000000");

    const config = loadConfig();
    assertEquals(config.BACKEND_URL, "http://localhost:3000/api");
    assertEquals(config.MAX_FILE_SIZE, 5_000_000);
    assertEquals(config.CHUNK_TIMEOUT_MS, 5000);
    assertEquals(config.MP3_BITRATE, "128k");
    assertEquals(config.FETCH_TIMEOUT_MS, 60_000);
    assertEquals(config.MAX_STREAM_BYTES, 20_000_000);
  });

  it("throws on NaN MAX_FILE_SIZE", () => {
    Deno.env.set("MAX_FILE_SIZE", "abc");
    assertThrows(() => loadConfig(), Error, "Invalid numeric config value");
  });

  it("throws on negative CHUNK_TIMEOUT_MS", () => {
    Deno.env.set("CHUNK_TIMEOUT_MS", "-1");
    assertThrows(() => loadConfig(), Error, "Invalid numeric config value");
  });

  it("throws on zero FETCH_TIMEOUT_MS", () => {
    Deno.env.set("FETCH_TIMEOUT_MS", "0");
    assertThrows(() => loadConfig(), Error, "Invalid numeric config value");
  });

  it("throws on invalid BACKEND_URL", () => {
    Deno.env.set("BACKEND_URL", "not a url");
    assertThrows(() => loadConfig(), Error, "Invalid BACKEND_URL");
  });

  it("throws on invalid MP3_BITRATE format", () => {
    Deno.env.set("MP3_BITRATE", "abc");
    assertThrows(() => loadConfig(), Error, "Invalid MP3_BITRATE");
  });
});
