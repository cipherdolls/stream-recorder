# StreamRecorder

WebSocket audio streaming microservice. Accepts raw WAV audio via WebSocket, converts to MP3 with ffmpeg, and forwards to the backend API.

## How It Works

1. Client connects via WebSocket to `/ws-stream` with auth token and chat ID
2. Client streams raw audio data (WAV) as binary messages
3. Client closes the WebSocket when recording is done
4. Server converts WAV to MP3 in-memory via ffmpeg and forwards to backend API

## Routes

| Route        | Description                          |
| ------------ | ------------------------------------ |
| `GET /`      | Health page with API documentation   |
| `GET /ws-stream?auth=<token>&chatId=<id>` | WebSocket endpoint |

### WebSocket Parameters

- **auth** — JWT token (required), sent as Bearer token to backend
- **chatId** — Chat identifier (required), alphanumeric/hyphens/underscores, max 128 chars

### WebSocket Close Codes

- `1000` — Normal close or idle timeout
- `1009` — Stream exceeded maximum size

## Configuration

| Variable          | Default                      | Description                                  |
| ----------------- | ---------------------------- | -------------------------------------------- |
| `BACKEND_URL`     | `http://api:4000/messages`   | Backend API endpoint                         |
| `MAX_FILE_SIZE`   | `10000000`                   | Max input size for ffmpeg conversion (bytes) |
| `MAX_STREAM_BYTES`| `10000000`                   | Max bytes accepted per WebSocket stream      |
| `CHUNK_TIMEOUT_MS`| `2000`                       | Idle timeout between chunks before auto-close|
| `FETCH_TIMEOUT_MS`| `30000`                      | Timeout for backend API request              |
| `MP3_BITRATE`     | `64k`                        | FFmpeg MP3 encoding bitrate                  |

## Development

```bash
# Run with watch mode
deno task dev

# Run tests
deno task test
```

## Docker

```bash
docker build -t stream-recorder .
docker run -p 8000:8000 -e BACKEND_URL=http://api:4000/messages stream-recorder
```

## Client Example

```javascript
const ws = new WebSocket(
  'ws://localhost:8000/ws-stream?auth=YOUR_TOKEN&chatId=YOUR_CHAT_ID'
);
ws.binaryType = 'arraybuffer';

const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

recorder.ondataavailable = (e) => {
  if (ws.readyState === WebSocket.OPEN) {
    e.data.arrayBuffer().then((buf) => ws.send(buf));
  }
};

recorder.start(250); // send chunks every 250ms

// Stop recording
recorder.stop();
ws.close();
```
