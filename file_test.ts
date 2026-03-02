import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { validateFile, safeRemoveFile } from "./file.ts";

describe("validateFile", () => {
  it("passes for file under maxSize", async () => {
    const tmpFile = await Deno.makeTempFile();
    try {
      await Deno.writeFile(tmpFile, new Uint8Array(50));
      await validateFile(tmpFile, 100);
    } finally {
      await Deno.remove(tmpFile).catch(() => {});
    }
  });

  it("passes for file exactly at maxSize", async () => {
    const tmpFile = await Deno.makeTempFile();
    try {
      await Deno.writeFile(tmpFile, new Uint8Array(100));
      await validateFile(tmpFile, 100);
    } finally {
      await Deno.remove(tmpFile).catch(() => {});
    }
  });

  it("throws for file over maxSize", async () => {
    const tmpFile = await Deno.makeTempFile();
    try {
      await Deno.writeFile(tmpFile, new Uint8Array(100));
      await assertRejects(
        () => validateFile(tmpFile, 50),
        Error,
        "File exceeds maximum size",
      );
    } finally {
      await Deno.remove(tmpFile).catch(() => {});
    }
  });

  it("throws for nonexistent file", async () => {
    await assertRejects(() => validateFile("/nonexistent/file.wav", 1000));
  });
});

describe("safeRemoveFile", () => {
  it("removes an existing file", async () => {
    const tmpFile = await Deno.makeTempFile();
    await safeRemoveFile(tmpFile);

    let exists = true;
    try {
      await Deno.stat(tmpFile);
    } catch {
      exists = false;
    }
    assertEquals(exists, false);
  });

  it("does not throw for nonexistent file", async () => {
    await safeRemoveFile("/nonexistent/file.wav");
  });
});
