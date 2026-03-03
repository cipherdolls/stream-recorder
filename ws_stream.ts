import * as log from "@std/log";
import type { Config } from "./config.ts";
import { convertWavToMp3 } from "./ffmpeg.ts";
import { forwardMp3ToApi } from "./api_forwarder.ts";
import { sanitizeChatId } from "./sanitize.ts";

interface RecordingState {
  chunks: Uint8Array[];
  totalBytes: number;
  chunkCount: number;
  startTime: number;
}

export function wsStreamHandler(
  req: Request,
  config: Config,
): Response {
  const url = new URL(req.url);
  const authorization = url.searchParams.get("auth");

  if (!authorization) {
    return new Response("Missing auth query parameter", { status: 401 });
  }

  let chatId: string;
  try {
    chatId = sanitizeChatId(url.searchParams.get("chatId"));
  } catch {
    return new Response("Invalid or missing chatId query parameter", {
      status: 400,
    });
  }

  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  socket.binaryType = "arraybuffer";

  let recording: RecordingState | null = null;
  let idleTimeoutId: number | null = null;

  const resetIdleTimeout = () => {
    if (idleTimeoutId) clearTimeout(idleTimeoutId);
    idleTimeoutId = setTimeout(() => {
      log.warn(`[${chatId}] Idle timeout — closing`);
      socket.close(1000, "idle timeout");
    }, config.IDLE_TIMEOUT_MS);
  };

  const safeSendText = (data: string): void => {
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    } catch (err) {
      log.error(
        `[${chatId}] Failed to send text: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  socket.onopen = () => {
    log.info(`[${chatId}] Connection opened`);
    resetIdleTimeout();
  };

  socket.onmessage = (event) => {
    resetIdleTimeout();

    if (typeof event.data === "string") {
      // JSON control frame
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "recording_start":
            recording = {
              chunks: [],
              totalBytes: 0,
              chunkCount: 0,
              startTime: Date.now(),
            };
            log.info(`[${chatId}] Recording started`);
            break;
          case "recording_end":
            if (recording && recording.totalBytes > 0) {
              finalizeRecording(chatId, recording, authorization, config);
            }
            recording = null;
            break;
          default:
            log.warn(`[${chatId}] Unknown control message: ${msg.type}`);
        }
      } catch (err) {
        log.error(
          `[${chatId}] Failed to parse control message: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      // Binary data — recording chunk
      if (!recording) {
        // Backward compat: if no recording_start was sent, auto-start
        recording = {
          chunks: [],
          totalBytes: 0,
          chunkCount: 0,
          startTime: Date.now(),
        };
      }
      const data = new Uint8Array(event.data as ArrayBuffer);
      recording.chunks.push(data);
      recording.totalBytes += data.length;
      recording.chunkCount++;

      if (recording.totalBytes > config.MAX_STREAM_BYTES) {
        log.warn(
          `[${chatId}] Recording exceeded max size — ${(recording.totalBytes / 1024).toFixed(0)} KB`
        );
        safeSendText(
          JSON.stringify({ type: "error", message: "Recording too large" })
        );
        recording = null;
      }
    }
  };

  socket.onclose = () => {
    if (idleTimeoutId) clearTimeout(idleTimeoutId);

    // Fallback: if recording was in progress, finalize it
    if (recording && recording.totalBytes > 0) {
      finalizeRecording(chatId, recording, authorization, config);
    }
    recording = null;

    log.info(`[${chatId}] Connection closed`);
  };

  socket.onerror = (event) => {
    log.error(`[${chatId}] Connection error — ${String(event)}`);
  };

  return response;
}

async function finalizeRecording(
  chatId: string,
  recording: RecordingState,
  authorization: string,
  config: Config
): Promise<void> {
  const sizeKB = (recording.totalBytes / 1024).toFixed(1);
  const durationS = ((Date.now() - recording.startTime) / 1000).toFixed(1);
  log.info(
    `[${chatId}] Recording ended — ${sizeKB} KB in ${durationS}s (${recording.chunkCount} chunks)`
  );

  try {
    const wavData = concatChunks(recording.chunks, recording.totalBytes);

    const t0 = Date.now();
    const mp3Data = await convertWavToMp3(wavData, config);
    const convertMs = Date.now() - t0;

    const t1 = Date.now();
    await forwardMp3ToApi(
      mp3Data,
      chatId,
      `Bearer ${authorization}`,
      config
    );
    const forwardMs = Date.now() - t1;

    const ratio = ((mp3Data.length / recording.totalBytes) * 100).toFixed(0);
    log.info(
      `[${chatId}] Recording pipeline complete — WAV ${sizeKB} KB -> MP3 ${(mp3Data.length / 1024).toFixed(1)} KB (${ratio}%) | convert ${convertMs}ms, forward ${forwardMs}ms`
    );
  } catch (err) {
    log.error(
      `[${chatId}] Recording pipeline failed — ${err instanceof Error ? err.message : String(err)}`
    );
  }
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
