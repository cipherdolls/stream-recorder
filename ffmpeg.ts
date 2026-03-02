import { join } from "@std/path";
import * as log from "@std/log";
import { validateFile, safeRemoveFile } from "./file.ts";
import type { Config } from "./config.ts";

export type CommandRunner = (
  cmd: string,
  args: string[],
) => Promise<{ success: boolean; stderr: Uint8Array }>;

export const defaultCommandRunner: CommandRunner = async (cmd, args) => {
  const command = new Deno.Command(cmd, {
    args,
    stdin: "null",
    stdout: "null",
    stderr: "piped",
  });
  return await command.output();
};

export async function checkFfmpegAvailable(
  runner: CommandRunner = defaultCommandRunner,
): Promise<void> {
  try {
    const { success } = await runner("ffmpeg", ["-version"]);
    if (!success) throw new Error("ffmpeg exited with failure");
  } catch (err) {
    throw new Error(`ffmpeg not available: ${err}`);
  }
}

export const convertWavToMp3 = async (
  fileId: string,
  config: Config,
  runner: CommandRunner = defaultCommandRunner,
): Promise<boolean> => {
  const inputFilePath = join(config.UPLOADS_DIR, `${fileId}.wav`);
  const outputFilePath = join(config.UPLOADS_DIR, `${fileId}.mp3`);

  try {
    await validateFile(inputFilePath, config.MAX_FILE_SIZE);

    const { success, stderr } = await runner("ffmpeg", [
      "-i",
      inputFilePath,
      "-b:a",
      config.MP3_BITRATE,
      "-map_metadata",
      "-1",
      outputFilePath,
    ]);

    if (!success) {
      const errorMessage = new TextDecoder().decode(stderr);
      throw new Error(`Conversion failed: ${errorMessage}`);
    }

    await safeRemoveFile(inputFilePath);
    return true;
  } catch (error) {
    log.error("WAV to MP3 conversion error", error, { fileId });
    throw error;
  }
};
