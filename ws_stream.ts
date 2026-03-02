import { crypto } from "@std/crypto/crypto";
import * as log from "@std/log";
import type { Config } from "./config.ts";
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

  const streamId = crypto.randomUUID();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let chunkCount = 0;
  let timeoutId: number | null = null;

  const resetTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      log.warn("WS stream timeout", { streamId, totalBytes });
      socket.close(1000, "timeout");
    }, config.CHUNK_TIMEOUT_MS);
  };

  socket.binaryType = "arraybuffer";

  socket.onopen = () => {
    log.info("WS stream opened", { streamId, chatId });
    resetTimeout();
  };

  socket.onmessage = (event) => {
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
        streamId,
        totalBytes,
        max: config.MAX_STREAM_BYTES,
      });
      socket.close(1009, "message too big");
      return;
    }

    resetTimeout();
    chunks.push(data);
  };

  socket.onclose = async () => {
    if (timeoutId) clearTimeout(timeoutId);

    log.info("WS stream closed", { streamId, totalBytes, chunkCount });

    if (totalBytes === 0) return;

    try {
      const wavData = concatChunks(chunks, totalBytes);
      const mp3Data = await convertWavToMp3(wavData, config);
      await forwardMp3ToApi(mp3Data, chatId, `Bearer ${authorization}`, config);
      log.info("WS stream processed OK", { streamId, chatId });
    } catch (err) {
      log.error("WS audio processing error", err, { streamId, chatId });
    }
  };

  socket.onerror = (event) => {
    log.error("WS error", { streamId, message: String(event) });
  };

  return response;
}

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
