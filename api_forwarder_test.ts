import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, describe, it } from "@std/testing/bdd";
import { forwardMp3ToApi } from "./api_forwarder.ts";
import type { Config } from "./config.ts";

function makeTestConfig(uploadsDir: string): Config {
  return {
    UPLOADS_DIR: uploadsDir,
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
  it("sends correct request to backend and removes file on success", async () => {
    const tmpDir = await Deno.makeTempDir();
    const fileId = "test-forward";
    const mp3Path = `${tmpDir}/${fileId}.mp3`;
    await Deno.writeFile(mp3Path, new Uint8Array([0xff, 0xfb, 0x90, 0x00]));

    let capturedUrl = "";
    let capturedAuth = "";
    let capturedFormData: FormData | null = null;

    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      capturedUrl = url;
      capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? "";
      capturedFormData = init?.body as unknown as FormData;
      return new Response("ok", { status: 200 });
    };

    const config = makeTestConfig(tmpDir);
    const response = await forwardMp3ToApi(fileId, "chat-123", "Bearer tok", config);

    assertEquals(response.status, 200);
    assertEquals(capturedUrl, "http://localhost:9999/messages");
    assertEquals(capturedAuth, "Bearer tok");

    // File should be removed after successful forward
    let fileExists = true;
    try {
      await Deno.stat(mp3Path);
    } catch {
      fileExists = false;
    }
    assertEquals(fileExists, false);

    await Deno.remove(tmpDir, { recursive: true }).catch(() => {});
  });

  it("throws on non-OK response", async () => {
    const tmpDir = await Deno.makeTempDir();
    const fileId = "test-fail";
    const mp3Path = `${tmpDir}/${fileId}.mp3`;
    await Deno.writeFile(mp3Path, new Uint8Array([0xff, 0xfb]));

    globalThis.fetch = async () => new Response("server error", { status: 500 });

    const config = makeTestConfig(tmpDir);
    await assertRejects(
      () => forwardMp3ToApi(fileId, "chat-123", "Bearer tok", config),
      Error,
      "API forwarding failed",
    );

    await Deno.remove(tmpDir, { recursive: true }).catch(() => {});
  });

  it("throws when mp3 file does not exist", async () => {
    const tmpDir = await Deno.makeTempDir();

    globalThis.fetch = async () => new Response("ok", { status: 200 });

    const config = makeTestConfig(tmpDir);
    await assertRejects(() =>
      forwardMp3ToApi("nonexistent", "chat-123", "Bearer tok", config),
    );

    await Deno.remove(tmpDir, { recursive: true }).catch(() => {});
  });

  it("throws when mp3 file exceeds max size", async () => {
    const tmpDir = await Deno.makeTempDir();
    const fileId = "too-large";
    const mp3Path = `${tmpDir}/${fileId}.mp3`;
    await Deno.writeFile(mp3Path, new Uint8Array(200));

    globalThis.fetch = async () => new Response("ok", { status: 200 });

    const config = makeTestConfig(tmpDir);
    config.MAX_FILE_SIZE = 100;

    await assertRejects(
      () => forwardMp3ToApi(fileId, "chat-123", "Bearer tok", config),
      Error,
      "File exceeds maximum size",
    );

    await Deno.remove(tmpDir, { recursive: true }).catch(() => {});
  });

  it("uses AbortSignal timeout on fetch", async () => {
    const tmpDir = await Deno.makeTempDir();
    const fileId = "test-timeout";
    const mp3Path = `${tmpDir}/${fileId}.mp3`;
    await Deno.writeFile(mp3Path, new Uint8Array([0xff, 0xfb]));

    let capturedSignal: AbortSignal | undefined;

    globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Response("ok", { status: 200 });
    };

    const config = makeTestConfig(tmpDir);
    await forwardMp3ToApi(fileId, "chat-123", "Bearer tok", config);

    assertEquals(capturedSignal !== undefined, true);

    await Deno.remove(tmpDir, { recursive: true }).catch(() => {});
  });
});
