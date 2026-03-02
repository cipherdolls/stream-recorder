const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StreamRecorder</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; background: #0a0a0a; color: #e0e0e0; line-height: 1.6; padding: 2rem; max-width: 860px; margin: 0 auto; }
    h1 { color: #fff; font-size: 1.8rem; margin-bottom: 0.25rem; }
    .subtitle { color: #888; margin-bottom: 2rem; }
    h2 { color: #ccc; font-size: 1.1rem; margin: 2rem 0 0.75rem; border-bottom: 1px solid #222; padding-bottom: 0.4rem; }
    p, li { color: #aaa; font-size: 0.9rem; }
    ul { padding-left: 1.25rem; }
    li { margin-bottom: 0.3rem; }
    code { background: #1a1a2e; color: #7ec8e3; padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.85rem; }
    pre { background: #111; border: 1px solid #222; border-radius: 6px; padding: 1rem; overflow-x: auto; margin: 0.75rem 0; }
    pre code { background: none; padding: 0; color: #ccc; }
    .status { display: inline-block; background: #0f2e1a; color: #4ade80; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.8rem; margin-bottom: 1.5rem; }
    .step { display: flex; gap: 0.75rem; margin-bottom: 0.5rem; }
    .step-num { color: #555; font-weight: bold; min-width: 1.5rem; }
    .step-text { color: #aaa; font-size: 0.9rem; }
    .param { display: grid; grid-template-columns: 120px 1fr; gap: 0.25rem 1rem; margin-bottom: 0.4rem; font-size: 0.9rem; }
    .param-name { color: #7ec8e3; font-family: monospace; }
    .param-desc { color: #888; }
    table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.85rem; }
    th { text-align: left; color: #888; font-weight: normal; padding: 0.4rem 0.75rem; border-bottom: 1px solid #222; }
    td { padding: 0.4rem 0.75rem; border-bottom: 1px solid #1a1a1a; }
    td:first-child { color: #7ec8e3; font-family: monospace; white-space: nowrap; }
    td:nth-child(2) { color: #aaa; font-family: monospace; }
    td:last-child { color: #666; }
    .comment { color: #555; }
  </style>
</head>
<body>
  <h1>StreamRecorder</h1>
  <p class="subtitle">WebSocket audio streaming microservice</p>
  <span class="status">Running</span>

  <h2>How It Works</h2>
  <div class="step"><span class="step-num">1.</span><span class="step-text">Connect via WebSocket to <code>/ws-stream</code> with auth token and chat ID</span></div>
  <div class="step"><span class="step-num">2.</span><span class="step-text">Stream raw audio data (WAV) as binary WebSocket messages</span></div>
  <div class="step"><span class="step-num">3.</span><span class="step-text">Close the WebSocket when recording is done</span></div>
  <div class="step"><span class="step-num">4.</span><span class="step-text">Server converts WAV to MP3 in-memory via ffmpeg and forwards to backend API</span></div>

  <h2>WebSocket Endpoint</h2>
  <pre><code>GET /ws-stream?auth=&lt;token&gt;&amp;chatId=&lt;id&gt;</code></pre>
  <div class="param"><span class="param-name">auth</span><span class="param-desc">JWT token (required) &mdash; sent as Bearer token to backend</span></div>
  <div class="param"><span class="param-name">chatId</span><span class="param-desc">Chat identifier (required) &mdash; alphanumeric, hyphens, underscores, max 128 chars</span></div>

  <h2>Client Example</h2>
  <pre><code><span class="comment">// Connect to stream recorder</span>
const ws = new WebSocket(
  "ws://localhost:8000/ws-stream?auth=YOUR_TOKEN&chatId=YOUR_CHAT_ID"
);
ws.binaryType = "arraybuffer";

<span class="comment">// Stream audio from MediaRecorder</span>
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

recorder.ondataavailable = (e) =&gt; {
  if (ws.readyState === WebSocket.OPEN) {
    e.data.arrayBuffer().then((buf) =&gt; ws.send(buf));
  }
};

recorder.start(250); <span class="comment">// send chunks every 250ms</span>

<span class="comment">// Stop recording and close</span>
recorder.stop();
ws.close();</code></pre>

  <h2>WebSocket Close Codes</h2>
  <ul>
    <li><code>1000</code> &mdash; Normal close or idle timeout</li>
    <li><code>1009</code> &mdash; Stream exceeded maximum size</li>
    <li><code>1011</code> &mdash; Server error</li>
  </ul>

  <h2>Configuration</h2>
  <table>
    <tr><th>Variable</th><th>Default</th><th>Description</th></tr>
    <tr><td>BACKEND_URL</td><td>http://api:4000/messages</td><td>Backend API endpoint</td></tr>
    <tr><td>MAX_FILE_SIZE</td><td>10000000</td><td>Max input size for ffmpeg conversion (bytes)</td></tr>
    <tr><td>MAX_STREAM_BYTES</td><td>10000000</td><td>Max bytes accepted per WebSocket stream</td></tr>
    <tr><td>CHUNK_TIMEOUT_MS</td><td>2000</td><td>Idle timeout between chunks before auto-close</td></tr>
    <tr><td>FETCH_TIMEOUT_MS</td><td>30000</td><td>Timeout for backend API request</td></tr>
    <tr><td>MP3_BITRATE</td><td>64k</td><td>FFmpeg MP3 encoding bitrate</td></tr>
  </table>
</body>
</html>`;

export function healthHandler(): Response {
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
