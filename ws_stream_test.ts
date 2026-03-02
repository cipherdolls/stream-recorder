import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { wsStreamHandler } from "./ws_stream.ts";
import type { Config } from "./config.ts";

function makeTestConfig(): Config {
  return {
    UPLOADS_DIR: "/tmp/test-uploads",
    BACKEND_URL: "http://localhost:4000/messages",
    MAX_FILE_SIZE: 10_000_000,
    CHUNK_TIMEOUT_MS: 2000,
    MP3_BITRATE: "64k",
    FETCH_TIMEOUT_MS: 30_000,
    MAX_STREAM_BYTES: 10_000_000,
  };
}

describe("wsStreamHandler", () => {
  it("returns 401 when auth is missing", () => {
    const req = new Request("http://localhost:8000/ws-stream?chatId=abc123");
    const response = wsStreamHandler(req, makeTestConfig());
    assertEquals(response.status, 401);
  });

  it("returns 400 when chatId is missing", () => {
    const req = new Request("http://localhost:8000/ws-stream?auth=token123");
    const response = wsStreamHandler(req, makeTestConfig());
    assertEquals(response.status, 400);
  });

  it("returns 400 when chatId is invalid", () => {
    const req = new Request("http://localhost:8000/ws-stream?auth=token123&chatId=../../../etc/passwd");
    const response = wsStreamHandler(req, makeTestConfig());
    assertEquals(response.status, 400);
  });

  it("returns 400 when chatId has special characters", () => {
    const req = new Request("http://localhost:8000/ws-stream?auth=token123&chatId=chat<script>");
    const response = wsStreamHandler(req, makeTestConfig());
    assertEquals(response.status, 400);
  });

  it("returns 426 when upgrade header is missing", () => {
    const req = new Request("http://localhost:8000/ws-stream?auth=token123&chatId=abc123");
    const response = wsStreamHandler(req, makeTestConfig());
    assertEquals(response.status, 426);
  });

  it("returns 426 when upgrade header is not websocket", () => {
    const req = new Request("http://localhost:8000/ws-stream?auth=token123&chatId=abc123", {
      headers: { upgrade: "h2c" },
    });
    const response = wsStreamHandler(req, makeTestConfig());
    assertEquals(response.status, 426);
  });
});
