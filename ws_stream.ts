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

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let chunkCount = 0;
  let timeoutId: number | null = null;

  const resetTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      log.warn(`[${chatId}] Stream idle timeout — ${(totalBytes / 1024).toFixed(1)} KB`);
      socket.close(1000, "timeout");
    }, config.CHUNK_TIMEOUT_MS);
  };

  socket.binaryType = "arraybuffer";

  const startTime = Date.now();

  socket.onopen = () => {
    log.info(`[${chatId}] Stream opened`);
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
      log.warn(`[${chatId}] Stream exceeded max size — ${(totalBytes / 1024).toFixed(0)} KB > ${(config.MAX_STREAM_BYTES / 1024).toFixed(0)} KB`);
      socket.close(1009, "message too big");
      return;
    }

    resetTimeout();
    chunks.push(data);
  };

  socket.onclose = async () => {
    if (timeoutId) clearTimeout(timeoutId);
    const streamDurationMs = Date.now() - startTime;
    const streamDurationS = (streamDurationMs / 1000).toFixed(1);
    const sizeKB = (totalBytes / 1024).toFixed(1);

    log.info(`[${chatId}] Stream closed — ${sizeKB} KB in ${streamDurationS}s (${chunkCount} chunks)`);

    if (totalBytes === 0) {
      log.warn(`[${chatId}] Stream empty, skipping`);
      return;
    }

    try {
      const wavData = concatChunks(chunks, totalBytes);

      const t0 = Date.now();
      const mp3Data = await convertWavToMp3(wavData, config);
      const convertMs = Date.now() - t0;

      const t1 = Date.now();
      await forwardMp3ToApi(mp3Data, chatId, `Bearer ${authorization}`, config);
      const forwardMs = Date.now() - t1;

      const totalMs = Date.now() - startTime;
      const ratio = ((mp3Data.length / totalBytes) * 100).toFixed(0);
      log.info(`[${chatId}] Pipeline complete — WAV ${sizeKB} KB -> MP3 ${(mp3Data.length / 1024).toFixed(1)} KB (${ratio}%) | convert ${convertMs}ms, forward ${forwardMs}ms, total ${totalMs}ms`);
    } catch (err) {
      log.error(`[${chatId}] Pipeline failed — ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  socket.onerror = (event) => {
    log.error(`[${chatId}] Stream error — ${String(event)}`);
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
