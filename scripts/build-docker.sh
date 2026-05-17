#!/bin/bash

# Auralyn Docker Build Script

echo "=========================================="
echo "  Building Auralyn Docker Image"
echo "=========================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed"
    exit 1
fi

# Get image name from argument or use default
IMAGE_NAME=${1:-auralyn:latest}
REGISTRY=${2:-ghcr.io/instax-dutta}

echo "Building image: $IMAGE_NAME"

# Build the image
docker build -t "$IMAGE_NAME" .

echo ""
echo "=========================================="
echo "  Image built successfully!"
echo "=========================================="
echo ""
echo "To run locally with docker-compose:"
echo "  cp .env.docker .env"
echo "  # Edit .env with your values"
echo "  docker-compose up -d"
echo ""
echo "To push to registry:"
echo "  docker tag $IMAGE_NAME $REGISTRY/auralyn:latest"
echo "  docker push $REGISTRY/auralyn:latest"
echo ""