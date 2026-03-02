import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { healthHandler } from "./health.ts";

describe("healthHandler", () => {
  it("returns 200 with HTML content", async () => {
    const response = healthHandler();
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Content-Type"), "text/html; charset=utf-8");
    const body = await response.text();
    assert(body.includes("StreamRecorder"));
    assert(body.includes("/ws-stream"));
    assert(body.includes("BACKEND_URL"));
  });
});
