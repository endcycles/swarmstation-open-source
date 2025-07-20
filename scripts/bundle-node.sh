#!/bin/bash

# Script to download and bundle Node.js with the Electron app
# This ensures the Claude SDK can spawn Node processes in production

NODE_VERSION="v20.11.0"
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map architecture names
if [ "$ARCH" = "x86_64" ]; then
  ARCH="x64"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  ARCH="arm64"
fi

# Map platform names for Node.js downloads
if [ "$PLATFORM" = "darwin" ]; then
  NODE_PLATFORM="darwin"
  NODE_BINARY="node"
elif [ "$PLATFORM" = "linux" ]; then
  NODE_PLATFORM="linux"
  NODE_BINARY="node"
elif [[ "$PLATFORM" == *"mingw"* ]] || [[ "$PLATFORM" == *"msys"* ]]; then
  NODE_PLATFORM="win"
  NODE_BINARY="node.exe"
fi

echo "🚀 Bundling Node.js for $NODE_PLATFORM-$ARCH"

# Create bin directory
mkdir -p bin

# Download Node.js binary
NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${NODE_PLATFORM}-${ARCH}.tar.gz"

if [ "$NODE_PLATFORM" = "win" ]; then
  NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-${ARCH}.zip"
fi

echo "📥 Downloading Node.js from: $NODE_URL"

# Download and extract
if [ "$NODE_PLATFORM" = "win" ]; then
  curl -L "$NODE_URL" -o node.zip
  unzip -j node.zip "*/node.exe" -d bin/
  rm node.zip
else
  curl -L "$NODE_URL" | tar xz --strip-components=2 -C bin/ "*/bin/node"
fi

# Make executable
chmod +x "bin/$NODE_BINARY"

echo "✅ Node.js bundled successfully at: bin/$NODE_BINARY"
echo ""
echo "📝 To include in your Electron build, update electron-builder.yml:"
echo "extraResources:"
echo "  - from: bin/"
echo "    to: bin/"
echo "    filter:"
echo "      - node*"