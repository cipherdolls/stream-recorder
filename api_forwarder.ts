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
      throw new Error(`API forwarding failed: ${errorText}`);
    }

    log.info("MP3 forwarded to API", { chatId, size: mp3Data.length });
    return response;
  } catch (error) {
    log.error("MP3 forwarding error", error, {
      chatId,
      backendUrl: config.BACKEND_URL,
    });
    throw error;
  }
};
