import { route, type Route } from "@std/http/unstable-route";
import type { Config } from "./config.ts";
import { healthHandler } from "./health.ts";
import { wsStreamHandler } from "./ws_stream.ts";

export function createRouter(config: Config) {
  const routes: Route[] = [
    {
      method: "GET",
      pattern: new URLPattern({ pathname: "/" }),
      handler: () => healthHandler(),
    },
    {
      method: "GET",
      pattern: new URLPattern({ pathname: "/ws-stream" }),
      handler: (req: Request) => wsStreamHandler(req, config),
    },
  ];

  function defaultHandler(_req: Request): Response {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return route(routes, defaultHandler);
}
