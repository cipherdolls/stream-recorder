FROM node:21.5.0-alpine3.19

RUN apk add --upgrade --no-cache \
    libc6-compat \
    vips-dev \
    git \
    lame \
    ffmpeg \
    build-base \
    --repository https://alpine.global.ssl.fastly.net/alpine/v3.19/community/

WORKDIR /app
COPY package.json /app
RUN npm install
COPY . /app
EXPOSE 4100
CMD ["node","index.js"]