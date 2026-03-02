FROM denoland/deno:2.7.1
EXPOSE 8000
WORKDIR /app
USER root
RUN apt-get update && apt-get install -y ffmpeg
COPY . .
RUN deno cache main.ts
CMD ["run", "--allow-net", "--allow-run", "--allow-env", "main.ts"]
