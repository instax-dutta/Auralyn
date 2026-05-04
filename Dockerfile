FROM node:20-alpine

# Install Java for Lavalink and other required packages
RUN apk add --no-cache \
    openjdk17 \
    curl \
    ffmpeg \
    bash \
    tzdata

# Set timezone
ENV TZ=UTC
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install Node.js dependencies
RUN npm ci --only=production || npm install --only=production

# Copy application source
COPY src ./src
COPY lavalink ./lavalink
COPY scripts ./scripts

# Copy environment template
COPY .env.docker .env

# Make scripts executable
RUN chmod +x scripts/*.sh

# Create required directories
RUN mkdir -p logs lavalink/logs data

# Expose ports (Lavalink HTTP + WebSocket)
EXPOSE 2333

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:2333/v4/info || exit 1

# Start script
CMD ["/app/scripts/start.sh"]