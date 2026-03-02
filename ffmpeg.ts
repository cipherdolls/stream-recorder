import * as log from "@std/log";
import type { Config } from "./config.ts";

export type PipeRunner = (
  cmd: string,
  args: string[],
  stdin: Uint8Array,
) => Promise<{ success: boolean; stdout: Uint8Array; stderr: Uint8Array }>;

export const defaultPipeRunner: PipeRunner = async (cmd, args, stdin) => {
  const command = new Deno.Command(cmd, {
    args,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const process = command.spawn();

  const writer = process.stdin.getWriter();
  await writer.write(stdin);
  await writer.close();

  const { success, stdout, stderr } = await process.output();
  return { success, stdout, stderr };
};

export async function checkFfmpegAvailable(
  runner: PipeRunner = defaultPipeRunner,
): Promise<void> {
  try {
    const { success } = await runner("ffmpeg", ["-version"], new Uint8Array());
    if (!success) throw new Error("ffmpeg exited with failure");
  } catch (err) {
    throw new Error(`ffmpeg not available: ${err}`);
  }
}

export const convertWavToMp3 = async (
  wavData: Uint8Array,
  config: Config,
  runner: PipeRunner = defaultPipeRunner,
): Promise<Uint8Array> => {
  if (wavData.length > config.MAX_FILE_SIZE) {
    throw new Error(`Input exceeds maximum size of ${config.MAX_FILE_SIZE} bytes`);
  }

  try {
    const { success, stdout, stderr } = await runner(
      "ffmpeg",
      ["-i", "pipe:0", "-b:a", config.MP3_BITRATE, "-map_metadata", "-1", "-f", "mp3", "pipe:1"],
      wavData,
    );

    if (!success) {
      const errorMessage = new TextDecoder().decode(stderr);
      throw new Error(`ffmpeg failed: ${errorMessage.slice(0, 500)}`);
    }

    const ratio = ((stdout.length / wavData.length) * 100).toFixed(0);
    log.info(
      `WAV -> MP3 — ${(wavData.length / 1024).toFixed(1)} KB -> ${(stdout.length / 1024).toFixed(1)} KB (${ratio}%) @ ${config.MP3_BITRATE}`,
      { inputBytes: wavData.length, outputBytes: stdout.length, bitrate: config.MP3_BITRATE },
    );
    return stdout;
  } catch (error) {
    log.error(`WAV -> MP3 failed — ${error instanceof Error ? error.message : String(error)}`, {
      inputBytes: wavData.length, error: String(error),
    });
    throw error;
  }
};
