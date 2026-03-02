import { route, type Route } from "@std/http/unstable-route";
import { join, extname } from "@std/path";
import { ensureDir } from "@std/fs";
import { crypto } from "@std/crypto/crypto";
import * as log from "@std/log";

log.setup({
  handlers: {
    default: new log.ConsoleHandler("DEBUG", {
      formatter: log.formatters.jsonFormatter,
      useColors: false,
    }),
  },
});

// Configuration with environment variable support
const config = {
  UPLOADS_DIR: Deno.env.get('UPLOADS_DIR') || '/app/uploads',
  BACKEND_URL: Deno.env.get('BACKEND_URL') || 'http://api:4000/messages',
  MAX_FILE_SIZE: parseInt(Deno.env.get('MAX_FILE_SIZE') || '10000000', 10), // 10MB default
  CHUNK_TIMEOUT_MS: parseInt(Deno.env.get('CHUNK_TIMEOUT_MS') || '2000', 10),
  MP3_BITRATE: Deno.env.get('MP3_BITRATE') || '64k',
  ALLOWED_EXTENSIONS: ['.wav', '.mp3'] // Add .mp3 to allowed extensions
};

// Custom error for validation
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}


// Validate file extension and size
const validateFile = (filePath: string, maxSize: number) => {
  // Optional: Only check extension for input files
  if (filePath.endsWith('.wav')) {
    const ext = extname(filePath).toLowerCase();
    if (!config.ALLOWED_EXTENSIONS.includes(ext)) {
      throw new ValidationError(`Invalid file type. Allowed: ${config.ALLOWED_EXTENSIONS.join(', ')}`);
    }
  }

  const fileInfo = Deno.statSync(filePath);
  if (fileInfo.size > maxSize) {
    throw new ValidationError(`File exceeds maximum size of ${maxSize} bytes`);
  }
};

// Safely remove file with error handling
const safeRemoveFile = (filePath: string) => {
  try {
    Deno.removeSync(filePath);
    log.info(`File removed: ${filePath}`);
  } catch (error) {
    log.error('Error removing file', error, { filePath });
  }
};

// Forward MP3 to API with improved error handling
const forwardMp3ToApi = async (
  fileId: string, 
  chatId: string, 
  authHeader: string
): Promise<Response> => {
  const mp3FileName = `${fileId}.mp3`;
  const mp3FilePath = join(config.UPLOADS_DIR, mp3FileName);

  try {
    // Validate file before processing
    validateFile(mp3FilePath, config.MAX_FILE_SIZE);

    const mp3File = await Deno.readFile(mp3FilePath);

    const formData = new FormData();
    const fileBlob = new Blob([mp3File], { type: "audio/mpeg" });
    formData.append("file", fileBlob, mp3FileName);
    formData.append("chatId", chatId);
    formData.append("content", "Voice message");

    const response = await fetch(config.BACKEND_URL, {
      method: "POST",
      headers: { Authorization: authHeader },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API forwarding failed: ${errorText}`);
    }

    // Optionally remove file after successful forwarding
    safeRemoveFile(mp3FilePath);

    return response;
  } catch (error) {
    log.error('MP3 forwarding error', error, { 
      fileId, 
      chatId, 
      backendUrl: config.BACKEND_URL 
    });
    throw error;
  }
};

// Convert WAV to MP3 with improved error handling
const convertWavToMp3 = async (fileId: string): Promise<boolean> => {
  const inputFilePath = join(config.UPLOADS_DIR, `${fileId}.wav`);
  const outputFilePath = join(config.UPLOADS_DIR, `${fileId}.mp3`);

  try {
    // Validate input file before conversion
    validateFile(inputFilePath, config.MAX_FILE_SIZE);

    const command = new Deno.Command("ffmpeg", {
      args: [
        "-i", inputFilePath, 
        "-b:a", config.MP3_BITRATE, 
        "-map_metadata", "-1", // Remove metadata to reduce file size
        outputFilePath
      ],
      stdin: "null",
      stdout: "null",
      stderr: "piped"
    });
  
    const { success, stderr } = await command.output();
  
    if (!success) {
      const errorMessage = new TextDecoder().decode(stderr);
      throw new Error(`Conversion failed: ${errorMessage}`);
    }

    // Remove original WAV file after successful conversion
    safeRemoveFile(inputFilePath);

    return true;
  } catch (error) {
    log.error('WAV to MP3 conversion error', error, { fileId });
    throw error;
  }
};

// Routes configuration
const routes: Route[] = [
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/" }),
    handler: () => new Response("StreamRecorder is Running!", { 
      headers: { 'Content-Type': 'text/plain' } 
    }),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/ws-stream" }),
    handler: async (req: Request) => {
      const url = new URL(req.url);
      const chatId = url.searchParams.get("chatId");
      const authorization = url.searchParams.get("auth");

      if (!authorization) {
        return new Response("Missing auth query parameter", { status: 401 });
      }
      if (!chatId) {
        return new Response("Missing chatId query parameter", { status: 400 });
      }

      const upgrade = req.headers.get("upgrade") || "";
      if (upgrade.toLowerCase() !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const { socket, response } = Deno.upgradeWebSocket(req);

      await ensureDir(config.UPLOADS_DIR);
      const fileId = crypto.randomUUID();
      const wavFilePath = join(config.UPLOADS_DIR, `${fileId}.wav`);
      const mp3FilePath = join(config.UPLOADS_DIR, `${fileId}.mp3`);

      let file: Deno.FsFile | null = null;
      let totalBytes = 0;
      let chunkCount = 0;
      let timeoutId: number | null = null;

      const resetTimeout = () => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          log.warn('WS stream timeout', { fileId, totalBytes });
          socket.close(1000, 'timeout');
        }, config.CHUNK_TIMEOUT_MS);
      };

      socket.binaryType = "arraybuffer";

      socket.onopen = async () => {
        log.info('WS stream opened', { fileId, chatId });
        file = await Deno.open(wavFilePath, {
          create: true, write: true, truncate: true, mode: 0o600
        });
        resetTimeout();
      };

      socket.onmessage = async (event) => {
        if (!file) return;
        const data = event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : typeof event.data === "string"
            ? new TextEncoder().encode(event.data)
            : new Uint8Array(event.data);

        chunkCount++;
        totalBytes += data.length;
        resetTimeout();

        try {
          await file.write(data);
        } catch (err) {
          log.error('WS file write error', err, { fileId });
          socket.close(1011, 'write error');
        }
      };

      socket.onclose = async () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (file) {
          file.close();
          file = null;
        }

        log.info('WS stream closed', { fileId, totalBytes, chunkCount });

        if (totalBytes === 0) {
          safeRemoveFile(wavFilePath);
          return;
        }

        try {
          await convertWavToMp3(fileId);
          await forwardMp3ToApi(fileId, chatId!, `Bearer ${authorization}`);
          log.info('WS stream processed OK', { fileId, chatId });
        } catch (err) {
          log.error('WS audio processing error', err, { fileId, chatId });
          safeRemoveFile(wavFilePath);
          safeRemoveFile(mp3FilePath);
        }
      };

      socket.onerror = (event) => {
        log.error('WS error', { fileId, message: String(event) });
      };

      return response;
    }
  },
  {
    method: ["POST", "HEAD"],
    pattern: new URLPattern({ pathname: "/stream" }),
    handler: async (req: Request) => {
      const url = new URL(req.url);
      const chatId = url.searchParams.get("chatId");
      const authorization = req.headers.get("Authorization");

      // Validation checks
      if (!authorization) {
        return new Response("Missing Authorization header", { status: 401 });
      }
      if (!chatId) {
        return new Response("Missing chatId query parameter", { status: 400 });
      }

      // Ensure uploads directory exists
      await ensureDir(config.UPLOADS_DIR);

      const fileId = crypto.randomUUID();
      const wavFileName = `${fileId}.wav`;
      const wavFilePath = join(config.UPLOADS_DIR, wavFileName);
      
      const mp3FileName = `${fileId}.mp3`;
      const mp3FilePath = join(config.UPLOADS_DIR, mp3FileName);

      let file: Deno.FsFile | null = null;
      
      try {
        // Safely create file with proper permissions
        file = await Deno.open(wavFilePath, { 
          create: true, 
          write: true, 
          truncate: true,
          mode: 0o600 // Restrict file permissions
        });

        let totalBytes = 0;
        let chunkCount = 0;
        let timeoutId: number | null = null;

        // More robust timeout and chunk handling
        const chunkLoggerStream = new TransformStream({
          start(controller) {
            timeoutId = setTimeout(() => {
              log.warn('Stream timeout: No chunks received', { fileId });
              controller.terminate();
            }, config.CHUNK_TIMEOUT_MS);
          },
          transform(chunk, controller) {
            if (!(chunk instanceof Uint8Array)) {
              log.warn('Received non-Uint8Array chunk', { type: typeof chunk, fileId});
              return;
            }
            

            log.info('Chunk received', {
              fileId,
              chunkNumber: chunkCount + 1,
              chunkSize: chunk.length,
              chunkBytes: Array.from(chunk.slice(0, 10)), // First 10 bytes for inspection
              totalBytesReceived: totalBytes + chunk.length
            });

            chunkCount++;
            totalBytes += chunk.length;
            
            // Optional: Add a hard limit on total file size
            if (totalBytes > config.MAX_FILE_SIZE) {
              controller.terminate();
              throw new ValidationError('Maximum file size exceeded');
            }
            
            controller.enqueue(chunk);
            
            // Reset timeout on each valid chunk
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
              log.warn('Stream timeout between chunks', { fileId });
              controller.terminate();
            }, config.CHUNK_TIMEOUT_MS);
          },
          flush() {
            if (timeoutId) clearTimeout(timeoutId);
            
            log.info('Stream receipt completed', { 
              totalChunks: chunkCount, 
              totalBytes,
              fileId 
            });
          }
        });

        // Robust stream handling
        if (req.body) {
          await req.body
            .pipeThrough(chunkLoggerStream)
            .pipeTo(file.writable, {
              preventClose: false,
              preventAbort: false,
              preventCancel: false
            });
        }

        // Convert and forward with comprehensive error handling
        try {
          await convertWavToMp3(fileId);
          await forwardMp3ToApi(fileId, chatId, authorization);
        } catch (processingError) {

          log.error('Audio processing error', processingError, { 
            fileId, 
            chatId 
          });

          // Remove incomplete files in case of processing errors
          safeRemoveFile(wavFilePath);
          safeRemoveFile(mp3FilePath);
          
          return new Response('Error processing audio', { 
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
          });
        }
        
        return new Response('Stream processed successfully', { 
          status: 200,
          headers: {
            'Content-Type': 'text/plain',
            'X-Chunks-Received': chunkCount.toString(),
            'X-Total-Bytes': totalBytes.toString()
          }
        });
      } catch (err) {
        log.error('Stream processing error', err, { fileId, filePath: wavFilePath});
        
        try {
          if (file) file.close();
          safeRemoveFile(wavFilePath);
        } catch (cleanupError) {
          log.error('Error during error cleanup', cleanupError);
        }

        return new Response('Internal server error', { status: 500 });
      }
    }
  }
];

// Default route handler
function defaultHandler(_req: Request) {
  return new Response("Not found", { 
    status: 404,
    headers: { 'Content-Type': 'text/plain' }
  });
}

// Server configuration with error handling
Deno.serve({
  port: 8000,
  onListen: ({ hostname, port }) => {
    log.info(`Server started on ${hostname}:${port}`, config);
  },
  onError: (error) => {
    log.error('Unhandled server error', error);
    return new Response('Server error', { status: 500 });
  }
}, route(routes, defaultHandler));