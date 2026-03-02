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
      throw new Error(`Conversion failed: ${errorMessage}`);
    }

    log.info("WAV to MP3 conversion complete", { inputSize: wavData.length, outputSize: stdout.length });
    return stdout;
  } catch (error) {
    log.error("WAV to MP3 conversion error", error);
    throw error;
  }
};
