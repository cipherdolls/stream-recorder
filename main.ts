import * as log from "@std/log";
import { loadConfig } from "./config.ts";
import { checkFfmpegAvailable } from "./ffmpeg.ts";
import { createRouter } from "./routes.ts";

log.setup({
  handlers: {
    default: new log.ConsoleHandler("DEBUG", {
      formatter: log.formatters.jsonFormatter,
      useColors: false,
    }),
  },
});

const config = loadConfig();
await checkFfmpegAvailable();

Deno.serve(
  {
    port: 8000,
    onListen: ({ hostname, port }) => {
      log.info(`Server started on ${hostname}:${port}`, config);
    },
    onError: (error) => {
      log.error("Unhandled server error", error);
      return new Response("Server error", { status: 500 });
    },
  },
  createRouter(config),
);
