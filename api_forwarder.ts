import * as log from "@std/log";
import type { Config } from "./config.ts";

export const forwardMp3ToApi = async (
  mp3Data: Uint8Array,
  chatId: string,
  authHeader: string,
  config: Config,
): Promise<Response> => {
  try {
    const formData = new FormData();
    const fileBlob = new Blob([mp3Data.slice()], { type: "audio/mpeg" });
    formData.append("file", fileBlob, "recording.mp3");
    formData.append("chatId", chatId);

    log.info(
      `[${chatId}] Forwarding MP3 to ${config.BACKEND_URL} — ${(mp3Data.length / 1024).toFixed(1)} KB, timeout=${config.FETCH_TIMEOUT_MS}ms`
    );

    const response = await fetch(config.BACKEND_URL, {
      method: "POST",
      headers: { Authorization: authHeader },
      body: formData,
      signal: AbortSignal.timeout(config.FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error(
        `[${chatId}] Backend responded with ${response.status} from ${config.BACKEND_URL}: ${errorText.slice(0, 300)}`
      );
      throw new Error(`Backend ${response.status}: ${errorText.slice(0, 300)}`);
    }

    log.info(`[${chatId}] Forwarded MP3 to ${config.BACKEND_URL} — ${(mp3Data.length / 1024).toFixed(1)} KB -> ${response.status}`);
    return response;
  } catch (error) {
    log.error(`[${chatId}] Forward to ${config.BACKEND_URL} failed — ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};
