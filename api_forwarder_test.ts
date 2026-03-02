import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, describe, it } from "@std/testing/bdd";
import { forwardMp3ToApi } from "./api_forwarder.ts";
import type { Config } from "./config.ts";

function makeTestConfig(): Config {
  return {
    BACKEND_URL: "http://localhost:9999/messages",
    MAX_FILE_SIZE: 10_000_000,
    CHUNK_TIMEOUT_MS: 2000,
    MP3_BITRATE: "64k",
    FETCH_TIMEOUT_MS: 30_000,
    MAX_STREAM_BYTES: 10_000_000,
  };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("forwardMp3ToApi", () => {
  it("sends correct request to backend", async () => {
    const mp3Data = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);

    let capturedUrl = "";
    let capturedAuth = "";

    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      capturedUrl = url;
      capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? "";
      return new Response("ok", { status: 200 });
    };

    const config = makeTestConfig();
    const response = await forwardMp3ToApi(mp3Data, "chat-123", "Bearer tok", config);

    assertEquals(response.status, 200);
    assertEquals(capturedUrl, "http://localhost:9999/messages");
    assertEquals(capturedAuth, "Bearer tok");
  });

  it("throws on non-OK response", async () => {
    globalThis.fetch = async () => new Response("server error", { status: 500 });

    const config = makeTestConfig();
    await assertRejects(
      () => forwardMp3ToApi(new Uint8Array([0xff]), "chat-123", "Bearer tok", config),
      Error,
      "API forwarding failed",
    );
  });

  it("uses AbortSignal timeout on fetch", async () => {
    let capturedSignal: AbortSignal | undefined;

    globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Response("ok", { status: 200 });
    };

    const config = makeTestConfig();
    await forwardMp3ToApi(new Uint8Array([0xff]), "chat-123", "Bearer tok", config);

    assertEquals(capturedSignal !== undefined, true);
  });
});
