import { route, type Route } from "@std/http/unstable-route";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { crypto } from "@std/crypto/crypto";
import { createReadStream } from "node:fs";

const uploadsDir = '/app/uploads';

const forwardMp3ToApi = async (fileId: string, chatId: string, authHeader: string) => {
  console.log("Forwarding MP3 file to API...");

  const mp3FileName = `${fileId}.mp3`;
  const mp3FilePath = join(uploadsDir, mp3FileName);
  const mp3File = await Deno.readFile(mp3FilePath);

  // Create FormData
  const formData = new FormData();
  const fileBlob = new Blob([mp3File], { type: "audio/mpeg" });
  formData.append("file", fileBlob, mp3FileName);
  formData.append("chatId", chatId);
  formData.append("content", "test is love");

  try {
    const response = await fetch("http://backend:4000/messages", {
      method: "POST",
      headers: {
        Authorization: authHeader, // Forward the Authorization header
      },
      body: formData,
    });

    if (!response.ok) {
      console.error("Error forwarding MP3 file:", await response.text());
      throw new Error(`Failed to forward MP3 file. Status: ${response.status}`);
    }

    console.log("MP3 file forwarded successfully!");
  } catch (error) {
    console.error("Error in API forwarding:", error);
    throw error;
  }
};


const convertWavToMp3 = async ( fileId: string) => {
  console.log("Converting WAV to MP3...");
  const inputFile = join(uploadsDir, `${fileId}.wav`);
  const outputFile = join(uploadsDir, `${fileId}.mp3`);
  const bitrate = "64k";

  const command = new Deno.Command("ffmpeg", {
    args: ["-i", inputFile, "-b:a", bitrate, outputFile], // Set bitrate using -b:a
    stdin: "piped", // Optional if FFmpeg needs input from stdin
    stdout: "piped", // Capture FFmpeg's stdout
    stderr: "piped", // Capture FFmpeg's stderr
  });
  
  const child = command.spawn();
  
  // Optionally log the stdout and stderr output
  child.stdout.pipeTo(
    Deno.openSync("stdout.log", { write: true, create: true }).writable,
  );
  
  child.stderr.pipeTo(
    Deno.openSync("stderr.log", { write: true, create: true }).writable,
  );
  
  // Wait for the process to complete and get the status
  const status = await child.status;
  
  if (status.success) {
    console.log("WAV to MP3 conversion successful!");
  } else {
    console.error("FFmpeg error:", status.code);
  }
};



const routes: Route[] = [
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/" }),
    handler: () => new Response("StreamRecorder is Running! stream post wav to /stream"),
  },
  {
    method: ["POST", "HEAD"],
    pattern: new URLPattern({ pathname: "/stream" }),
    handler: async (req: Request) => {
      console.log('Receiving audio stream...');
      console.log('Request headers:', Object.fromEntries(req.headers));
      console.log('Request body:', );

      const url = new URL(req.url);
      const chatId = url.searchParams.get("chatId");
      const authorization = req.headers.get("Authorization");

      if (!authorization) {
        return new Response("Missing Authorization header", { status: 401 });
      }
      if (!chatId) {
        return new Response("Missing chatId query parameter", { status: 400 });
      }


      await ensureDir(uploadsDir);

      const fileId = await crypto.randomUUID()
      const wavFileName = `${fileId}.wav`;
      const wavFilePath = join(uploadsDir, wavFileName);
      let file: Deno.FsFile | null = null;
      
      try {
        // Open a file for writing
        file = await Deno.open(wavFilePath, { 
          create: true, 
          write: true, 
          truncate: true 
        });

        let totalBytes = 0;
        let chunkCount = 0;
        let timeoutId: number;

        // Timeout function to abort the connection
        const resetTimeout = (controller: TransformStreamDefaultController) => {
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
          }
          timeoutId = setTimeout(() => {
            console.warn("No chunks received for 500 milliseconds. Closing connection.");
            controller.terminate();
          }, 500);
        };


        // Custom TransformStream to handle timeout and logging
        const chunkLoggerStream = new TransformStream({
          start(controller) {
            resetTimeout(controller);
          },
          transform(chunk, controller) {
            if (!(chunk instanceof Uint8Array)) {
              console.warn("Received non-Uint8Array chunk:", typeof chunk);
              return;
            }
            chunkCount++;
            totalBytes += chunk.length;
            console.log(`Chunk ${chunkCount}: ${chunk.length} bytes`);
            controller.enqueue(chunk);
            resetTimeout(controller); // Reset timeout on every chunk
          },
          flush() {
            console.log(`Total chunks: ${chunkCount}`);
            console.log(`Total bytes received: ${totalBytes}`);
            clearTimeout(timeoutId); // Clear timeout when flushing
          },
        });

        // Write the incoming request body to the file
        if (req.body) {
          await req.body
            .pipeThrough(chunkLoggerStream)
            .pipeTo(file.writable, {
              preventClose: false,
              preventAbort: false,
              preventCancel: false
            });
        }

        console.log('Audio stream received and saved.', wavFilePath);

        try {
          await convertWavToMp3(fileId);
        }
        catch (error) {
          console.error("Error converting WAV to MP3:", error);
          return new Response("Error converting WAV to MP3", { status: 500 });
        }

        try {
          await forwardMp3ToApi(fileId, chatId, authorization);
        } catch (error) {
          console.error("Error forwarding MP3 to API:", error);
          return new Response("Error forwarding MP3 to API", { status: 500 });
        }

        
        return new Response('Stream received successfully', { 
          status: 200,
          headers: {
            'Content-Type': 'text/plain',
            'X-Chunks-Received': chunkCount.toString(),
            'X-Total-Bytes': totalBytes.toString()
          }
        });
      } catch (err) {
        console.error('Error receiving stream:', {
          errorName: err instanceof Error ? err.name : 'Unknown Error',
          errorMessage: err instanceof Error ? err.message : String(err),
          errorStack: err instanceof Error ? err.stack : undefined
        });
        
        // Safely close the file if it was opened
        try {
          if (file) {
            file.close();
          }
        } catch (closeErr) {
          console.error('Error closing file:', closeErr);
        }

        
        // Attempt to remove the potentially incomplete file
        try {
          Deno.removeSync(wavFilePath);
        } catch (removeErr) {
          console.error('Error removing incomplete file:', removeErr);
        }

        return new Response('Error processing stream', { status: 500 });
      }
    }
  }
];

function defaultHandler(_req: Request) {
  return new Response("Not found", { status: 404 });
}

// Use Deno.serve with the routing function
Deno.serve(route(routes, defaultHandler));