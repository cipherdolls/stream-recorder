export function healthHandler(): Response {
  return new Response("StreamRecorder is Running!", {
    headers: { "Content-Type": "text/plain" },
  });
}
