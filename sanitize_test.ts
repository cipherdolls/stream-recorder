import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { sanitizeChatId } from "./sanitize.ts";

describe("sanitizeChatId", () => {
  it("accepts a valid UUID", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    assertEquals(sanitizeChatId(id), id);
  });

  it("accepts a valid CUID-like string", () => {
    const id = "clh1234567890abcdef";
    assertEquals(sanitizeChatId(id), id);
  });

  it("accepts alphanumeric with underscores and hyphens", () => {
    const id = "chat_room-123";
    assertEquals(sanitizeChatId(id), id);
  });

  it("rejects null", () => {
    assertThrows(() => sanitizeChatId(null), Error, "Invalid chatId");
  });

  it("rejects empty string", () => {
    assertThrows(() => sanitizeChatId(""), Error, "Invalid chatId");
  });

  it("rejects path traversal", () => {
    assertThrows(() => sanitizeChatId("../../../etc/passwd"), Error, "Invalid chatId");
  });

  it("rejects special characters", () => {
    assertThrows(() => sanitizeChatId("chat<script>"), Error, "Invalid chatId");
  });

  it("rejects spaces", () => {
    assertThrows(() => sanitizeChatId("chat id"), Error, "Invalid chatId");
  });

  it("rejects strings over 128 chars", () => {
    assertThrows(() => sanitizeChatId("a".repeat(129)), Error, "Invalid chatId");
  });

  it("accepts exactly 128 chars", () => {
    const id = "a".repeat(128);
    assertEquals(sanitizeChatId(id), id);
  });
});
