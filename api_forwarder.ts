import { join } from "@std/path";
import * as log from "@std/log";
import { validateFile, safeRemoveFile } from "./file.ts";
import type { Config } from "./config.ts";

export const forwardMp3ToApi = async (
  fileId: string,
  chatId: string,
  authHeader: string,
  config: Config,
): Promise<Response> => {
  const mp3FileName = `${fileId}.mp3`;
  const mp3FilePath = join(config.UPLOADS_DIR, mp3FileName);

  try {
    await validateFile(mp3FilePath, config.MAX_FILE_SIZE);

    const mp3File = await Deno.readFile(mp3FilePath);

    const formData = new FormData();
    const fileBlob = new Blob([mp3File], { type: "audio/mpeg" });
    formData.append("file", fileBlob, mp3FileName);
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

    await safeRemoveFile(mp3FilePath);
    return response;
  } catch (error) {
    log.error("MP3 forwarding error", error, {
      fileId,
      chatId,
      backendUrl: config.BACKEND_URL,
    });
    throw error;
  }
};
