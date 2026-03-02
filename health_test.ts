import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { healthHandler } from "./health.ts";

describe("healthHandler", () => {
  it("returns 200 with expected body", async () => {
    const response = healthHandler();
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Content-Type"), "text/plain");
    assertEquals(await response.text(), "StreamRecorder is Running!");
  });
});
