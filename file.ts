import * as log from "@std/log";

export const validateFile = async (filePath: string, maxSize: number): Promise<void> => {
  const fileInfo = await Deno.stat(filePath);
  if (fileInfo.size > maxSize) {
    throw new Error(`File exceeds maximum size of ${maxSize} bytes`);
  }
};

export const safeRemoveFile = async (filePath: string): Promise<void> => {
  try {
    await Deno.remove(filePath);
    log.info(`File removed: ${filePath}`);
  } catch (error) {
    log.error("Error removing file", error, { filePath });
  }
};
