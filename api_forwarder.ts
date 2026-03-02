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

    const response = await fetch(config.BACKEND_URL, {
      method: "POST",
      headers: { Authorization: authHeader },
      body: formData,
      signal: AbortSignal.timeout(config.FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend ${response.status}: ${errorText.slice(0, 300)}`);
    }

    log.info(`Forwarded MP3 to backend — ${(mp3Data.length / 1024).toFixed(1)} KB -> ${response.status}`, {
      chatId, mp3Bytes: mp3Data.length, status: response.status,
    });
    return response;
  } catch (error) {
    log.error(`Forward failed — ${error instanceof Error ? error.message : String(error)}`, {
      chatId, mp3Bytes: mp3Data.length, backendUrl: config.BACKEND_URL, error: String(error),
    });
    throw error;
  }
};
