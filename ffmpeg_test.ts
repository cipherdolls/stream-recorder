import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { checkFfmpegAvailable, convertWavToMp3, type CommandRunner } from "./ffmpeg.ts";
import type { Config } from "./config.ts";

function makeTestConfig(uploadsDir: string): Config {
  return {
    UPLOADS_DIR: uploadsDir,
    BACKEND_URL: "http://localhost:4000/messages",
    MAX_FILE_SIZE: 10_000_000,
    CHUNK_TIMEOUT_MS: 2000,
    MP3_BITRATE: "64k",
    FETCH_TIMEOUT_MS: 30_000,
    MAX_STREAM_BYTES: 10_000_000,
  };
}

describe("checkFfmpegAvailable", () => {
  it("succeeds with a passing runner", async () => {
    const runner: CommandRunner = async () => ({
      success: true,
      stderr: new Uint8Array(),
    });
    await checkFfmpegAvailable(runner);
  });

  it("throws when runner reports failure", async () => {
    const runner: CommandRunner = async () => ({
      success: false,
      stderr: new Uint8Array(),
    });
    await assertRejects(
      () => checkFfmpegAvailable(runner),
      Error,
      "ffmpeg not available",
    );
  });

  it("throws when runner throws", async () => {
    const runner: CommandRunner = async () => {
      throw new Error("command not found");
    };
    await assertRejects(
      () => checkFfmpegAvailable(runner),
      Error,
      "ffmpeg not available",
    );
  });
});

describe("convertWavToMp3", () => {
  it("calls runner with correct ffmpeg arguments", async () => {
    const tmpDir = await Deno.makeTempDir();
    const fileId = "test-file-id";
    const wavPath = `${tmpDir}/${fileId}.wav`;
    const mp3Path = `${tmpDir}/${fileId}.mp3`;

    // Create a fake WAV file
    await Deno.writeFile(wavPath, new Uint8Array(100));

    const capturedArgs: string[][] = [];
    const runner: CommandRunner = async (_cmd, args) => {
      capturedArgs.push(args);
      // Create fake output file so the function doesn't fail
      await Deno.writeFile(mp3Path, new Uint8Array(50));
      return { success: true, stderr: new Uint8Array() };
    };

    const config = makeTestConfig(tmpDir);
    const result = await convertWavToMp3(fileId, config, runner);

    assertEquals(result, true);
    assertEquals(capturedArgs.length, 1);
    assertEquals(capturedArgs[0], [
      "-i", wavPath,
      "-b:a", "64k",
      "-map_metadata", "-1",
      mp3Path,
    ]);

    // WAV should be removed after conversion
    let wavExists = true;
    try {
      await Deno.stat(wavPath);
    } catch {
      wavExists = false;
    }
    assertEquals(wavExists, false);

    // Cleanup
    await Deno.remove(tmpDir, { recursive: true }).catch(() => {});
  });

  it("throws on ffmpeg failure", async () => {
    const tmpDir = await Deno.makeTempDir();
    const fileId = "test-fail-id";
    const wavPath = `${tmpDir}/${fileId}.wav`;

    await Deno.writeFile(wavPath, new Uint8Array(100));

    const runner: CommandRunner = async () => ({
      success: false,
      stderr: new TextEncoder().encode("conversion error details"),
    });

    const config = makeTestConfig(tmpDir);
    await assertRejects(
      () => convertWavToMp3(fileId, config, runner),
      Error,
      "Conversion failed: conversion error details",
    );

    // Cleanup
    await Deno.remove(tmpDir, { recursive: true }).catch(() => {});
  });

  it("throws when WAV file does not exist", async () => {
    const tmpDir = await Deno.makeTempDir();
    const runner: CommandRunner = async () => ({
      success: true,
      stderr: new Uint8Array(),
    });

    const config = makeTestConfig(tmpDir);
    await assertRejects(() => convertWavToMp3("nonexistent", config, runner));

    await Deno.remove(tmpDir, { recursive: true }).catch(() => {});
  });

  it("throws when WAV file exceeds max size", async () => {
    const tmpDir = await Deno.makeTempDir();
    const fileId = "too-large";
    const wavPath = `${tmpDir}/${fileId}.wav`;

    await Deno.writeFile(wavPath, new Uint8Array(200));

    const runner: CommandRunner = async () => ({
      success: true,
      stderr: new Uint8Array(),
    });

    const config = makeTestConfig(tmpDir);
    config.MAX_FILE_SIZE = 100;

    await assertRejects(
      () => convertWavToMp3(fileId, config, runner),
      Error,
      "File exceeds maximum size",
    );

    await Deno.remove(tmpDir, { recursive: true }).catch(() => {});
  });
});
