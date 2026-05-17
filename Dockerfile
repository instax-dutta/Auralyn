FROM node:20-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:20-alpine

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
  && chmod +x scripts/*.sh \
  && chown -R nodeuser:nodegroup /app

USER nodeuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:${LAVALINK_PORT:-2333}/v4/info > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/scripts/start.sh"]
