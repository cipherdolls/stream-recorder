import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { checkFfmpegAvailable, convertWavToMp3, type PipeRunner } from "./ffmpeg.ts";
import type { Config } from "./config.ts";

function makeTestConfig(): Config {
  return {
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
    const runner: PipeRunner = async () => ({
      success: true,
      stdout: new Uint8Array(),
      stderr: new Uint8Array(),
    });
    await checkFfmpegAvailable(runner);
  });

  it("throws when runner reports failure", async () => {
    const runner: PipeRunner = async () => ({
      success: false,
      stdout: new Uint8Array(),
      stderr: new Uint8Array(),
    });
    await assertRejects(
      () => checkFfmpegAvailable(runner),
      Error,
      "ffmpeg not available",
    );
  });

  it("throws when runner throws", async () => {
    const runner: PipeRunner = async () => {
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
  it("pipes WAV data through ffmpeg and returns MP3 output", async () => {
    const wavData = new Uint8Array(100);
    const fakeMp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);

    let capturedArgs: string[] = [];
    let capturedStdin: Uint8Array = new Uint8Array();

    const runner: PipeRunner = async (_cmd, args, stdin) => {
      capturedArgs = args;
      capturedStdin = stdin;
      return { success: true, stdout: fakeMp3, stderr: new Uint8Array() };
    };

    const config = makeTestConfig();
    const result = await convertWavToMp3(wavData, config, runner);

    assertEquals(result, fakeMp3);
    assertEquals(capturedStdin, wavData);
    assertEquals(capturedArgs, [
      "-i", "pipe:0",
      "-b:a", "64k",
      "-map_metadata", "-1",
      "-f", "mp3",
      "pipe:1",
    ]);
  });

  it("throws on ffmpeg failure", async () => {
    const runner: PipeRunner = async () => ({
      success: false,
      stdout: new Uint8Array(),
      stderr: new TextEncoder().encode("conversion error details"),
    });

    const config = makeTestConfig();
    await assertRejects(
      () => convertWavToMp3(new Uint8Array(100), config, runner),
      Error,
      "Conversion failed: conversion error details",
    );
  });

  it("throws when input exceeds max size", async () => {
    const runner: PipeRunner = async () => ({
      success: true,
      stdout: new Uint8Array(),
      stderr: new Uint8Array(),
    });

    const config = makeTestConfig();
    config.MAX_FILE_SIZE = 50;

    await assertRejects(
      () => convertWavToMp3(new Uint8Array(100), config, runner),
      Error,
      "Input exceeds maximum size",
    );
  });
});
