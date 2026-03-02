import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { crypto } from "@std/crypto/crypto";
import * as log from "@std/log";
import type { Config } from "./config.ts";
import { safeRemoveFile } from "./file.ts";
import { convertWavToMp3 } from "./ffmpeg.ts";
import { forwardMp3ToApi } from "./api_forwarder.ts";
import { sanitizeChatId } from "./sanitize.ts";

export function wsStreamHandler(req: Request, config: Config): Response {
  const url = new URL(req.url);
  const authorization = url.searchParams.get("auth");

  if (!authorization) {
    return new Response("Missing auth query parameter", { status: 401 });
  }

  let chatId: string;
  try {
    chatId = sanitizeChatId(url.searchParams.get("chatId"));
  } catch {
    return new Response("Invalid or missing chatId query parameter", { status: 400 });
  }

  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  const fileId = crypto.randomUUID();
  const wavFilePath = join(config.UPLOADS_DIR, `${fileId}.wav`);
  const mp3FilePath = join(config.UPLOADS_DIR, `${fileId}.mp3`);

  let file: Deno.FsFile | null = null;
  let totalBytes = 0;
  let chunkCount = 0;
  let timeoutId: number | null = null;

  const resetTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      log.warn("WS stream timeout", { fileId, totalBytes });
      socket.close(1000, "timeout");
    }, config.CHUNK_TIMEOUT_MS);
  };

  socket.binaryType = "arraybuffer";

  socket.onopen = async () => {
    log.info("WS stream opened", { fileId, chatId });
    await ensureDir(config.UPLOADS_DIR);
    file = await Deno.open(wavFilePath, {
      create: true,
      write: true,
      truncate: true,
      mode: 0o600,
    });
    resetTimeout();
  };

  socket.onmessage = async (event) => {
    if (!file) return;
    const data =
      event.data instanceof ArrayBuffer
        ? new Uint8Array(event.data)
        : typeof event.data === "string"
          ? new TextEncoder().encode(event.data)
          : new Uint8Array(event.data);

    chunkCount++;
    totalBytes += data.length;

    if (totalBytes > config.MAX_STREAM_BYTES) {
      log.warn("WS stream exceeded max size", {
        fileId,
        totalBytes,
        max: config.MAX_STREAM_BYTES,
      });
      socket.close(1009, "message too big");
      return;
    }

    resetTimeout();

    try {
      await file.write(data);
    } catch (err) {
      log.error("WS file write error", err, { fileId });
      socket.close(1011, "write error");
    }
  };

  socket.onclose = async () => {
    if (timeoutId) clearTimeout(timeoutId);
    if (file) {
      file.close();
      file = null;
    }

    log.info("WS stream closed", { fileId, totalBytes, chunkCount });

    if (totalBytes === 0) {
      await safeRemoveFile(wavFilePath);
      return;
    }

    try {
      await convertWavToMp3(fileId, config);
      await forwardMp3ToApi(fileId, chatId, `Bearer ${authorization}`, config);
      log.info("WS stream processed OK", { fileId, chatId });
    } catch (err) {
      log.error("WS audio processing error", err, { fileId, chatId });
      await safeRemoveFile(wavFilePath);
      await safeRemoveFile(mp3FilePath);
    }
  };

  socket.onerror = (event) => {
    log.error("WS error", { fileId, message: String(event) });
  };

  return response;
}
