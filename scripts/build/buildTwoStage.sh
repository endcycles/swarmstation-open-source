#!/bin/bash

# Two-stage build: Fast .app first, then DMG
# Allows testing while DMG builds in background

echo "🎯 Two-Stage Production Build"
echo "============================"

# Stage 1: Build .app quickly
echo "📦 Stage 1: Building .app directory..."
npm run build:prod
npx electron-builder --mac --arm64 --dir -c.compression=store -c.npmRebuild=false

echo "✅ Stage 1 complete!"
echo "🧪 You can now test: open release/mac-arm64/SwarmStation.app"
echo ""

# Stage 2: Create DMG in background
echo "💿 Stage 2: Creating DMG (running in background)..."
(
    npx electron-builder --mac --arm64 \
        -c.mac.target=dmg \
        -c.directories.output=release \
        -c.directories.app=release/mac-arm64/SwarmStation.app \
        --prepackaged release/mac-arm64/SwarmStation.app
    
    echo ""
    echo "✅ DMG creation complete!"
    echo "📦 DMG location: release/SwarmStation-*.dmg"
    
    # Notify when done (macOS only)
    if command -v osascript &> /dev/null; then
        osascript -e 'display notification "DMG build complete!" with title "SwarmStation Build"'
    fi
) &

DMG_PID=$!
echo "🔄 DMG building in background (PID: $DMG_PID)"
echo "📋 Check progress with: ps -p $DMG_PID"