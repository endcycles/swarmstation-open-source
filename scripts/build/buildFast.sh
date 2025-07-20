#!/bin/bash

# Fast build script for development
# Skips DMG creation and uses minimal compression

echo "🚀 Fast Build for macOS Development"
echo "==================================="

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf release/mac-arm64

# Build React
echo "⚛️  Building React application..."
npm run build:prod

# Create electron-builder config for fast builds
cat > electron-builder-fast.yml << EOF
extends: ./electron-builder.yml
mac:
  target:
    - target: dir  # Just create .app directory, no DMG or ZIP
      arch:
        - arm64
compression: store  # No compression
npmRebuild: false   # Skip npm rebuild if dependencies haven't changed
EOF

# Build with electron-builder
echo "🍎 Building macOS app (fast mode)..."
npx electron-builder --config electron-builder-fast.yml --mac

# Cleanup temp config
rm electron-builder-fast.yml

echo "✅ Fast build complete!"
echo "📁 App location: release/mac-arm64/SwarmStation.app"
echo ""
echo "To test: open release/mac-arm64/SwarmStation.app"