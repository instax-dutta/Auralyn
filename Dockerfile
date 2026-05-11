# Builder stage
FROM node:20-alpine AS builder

# Install required packages
RUN apk add --no-cache \
    openjdk17-jre-headless \
    curl \
    ffmpeg \
    bash \
    tzdata \
    tini

# Set timezone
ENV TZ=UTC

# Create app directory
WORKDIR /app

# Lavalink version (hardcoded to latest stable v4.x.x - update as needed)
ENV LAVALINK_VERSION=4.0.0
ENV LAVALINK_DOWNLOAD_URL=https://github.com/lavalink-devs/Lavalink/releases/download/v${LAVALINK_VERSION}/Lavalink.jar

# Download Lavalink.jar
RUN curl -L -o Lavalink.jar ${LAVALINK_DOWNLOAD_URL}

# Create plugins directory and download plugins
RUN mkdir -p plugins
# youtube-source plugin (dev.lavalink.youtube)
RUN curl -L -o plugins/youtube-source.jar https://github.com/lavalink-devs/youtube-source/releases/download/v1.2.0/youtube-source.jar
# LavaSrc plugin
RUN curl -L -o plugins/LavaSrc.jar https://github.com/lavalink-devs/LavaSrc/releases/download/v1.2.0/LavaSrc.jar

# Copy package files
COPY package.json package-lock.json* ./

# Install Node.js dependencies (omit dev dependencies)
RUN npm ci --omit=dev

# Copy application source
COPY src ./src
COPY scripts ./scripts
COPY lavalink ./lavalink
COPY .env.example .env

# Runtime stage
FROM node:20-alpine

# Install runtime-only packages
RUN apk add --no-cache \
    openjdk17-jre-headless \
    ffmpeg \
    tini

# Set timezone
ENV TZ=UTC

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodegroup && adduser -S nodeuser -u 1001 -G nodegroup

# Copy from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/lavalink ./lavalink
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/.env.example .env

# Change ownership to non-root user
RUN chown -R nodeuser:nodegroup /app

# Switch to non-root user
USER nodeuser

# Make scripts executable
RUN chmod +x scripts/*.sh

# Health check (uses localhost, no port exposure needed)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:2333/v4/info || exit 1

# Entrypoint and command
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/scripts/start.sh"]