FROM node:20-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:20-alpine

ARG YOUTUBE_PLUGIN_VERSION=1.18.1
ARG LAVASRC_PLUGIN_VERSION=4.8.2

RUN apk add --no-cache \
    bash \
    curl \
    ffmpeg \
    openjdk17-jre-headless \
    tini

ENV NODE_ENV=production
ENV TZ=UTC
ENV APP_DIR=/app
ENV LAVALINK_DIR=/app/lavalink
ENV LAVALINK_HOST=127.0.0.1
ENV LAVALINK_PORT=2333
ENV LAVALINK_SECURE=false
WORKDIR /app

RUN addgroup -g 1001 -S nodegroup && adduser -S nodeuser -u 1001 -G nodegroup

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src ./src
COPY scripts ./scripts
COPY lavalink/Lavalink.jar ./lavalink/Lavalink.jar
COPY lavalink/application.yml ./lavalink/application.yml

RUN mkdir -p /app/logs /app/data /app/lavalink/logs /app/lavalink/plugins \
  && curl --fail --silent --show-error --location \
    "https://maven.lavalink.dev/releases/dev/lavalink/youtube/youtube-plugin/${YOUTUBE_PLUGIN_VERSION}/youtube-plugin-${YOUTUBE_PLUGIN_VERSION}.jar" \
    --output "/app/lavalink/plugins/youtube-plugin-${YOUTUBE_PLUGIN_VERSION}.jar" \
  && curl --fail --silent --show-error --location \
    "https://maven.lavalink.dev/releases/com/github/topi314/lavasrc/lavasrc-plugin/${LAVASRC_PLUGIN_VERSION}/lavasrc-plugin-${LAVASRC_PLUGIN_VERSION}.jar" \
    --output "/app/lavalink/plugins/lavasrc-plugin-${LAVASRC_PLUGIN_VERSION}.jar" \
  && chmod +x scripts/*.sh \
  && chown -R nodeuser:nodegroup /app

USER nodeuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD curl --fail --silent --header "Authorization: ${LAVALINK_PASSWORD}" http://127.0.0.1:${LAVALINK_PORT:-2333}/v4/info > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/scripts/start.sh"]
