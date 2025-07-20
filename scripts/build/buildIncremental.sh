#!/bin/bash

# Incremental build - only rebuilds changed files
# Much faster for iterative development

echo "🔄 Incremental Build for macOS"
echo "=============================="

# Check if app directory exists
if [ ! -d "app" ]; then
    echo "❌ App directory not found. Run full build first."
    exit 1
fi

# Only rebuild React if source changed
if [ "src" -nt "dist/mvp.*.js" ] || [ ! -f dist/index.html ]; then
    echo "⚛️  Rebuilding React (source changed)..."
    npm run build:prod
else
    echo "✅ React build is up to date"
fi

# Only rebuild TypeScript if changed
if [ "core/claude-service.ts" -nt "core/claude-service.js" ]; then
    echo "📦 Rebuilding TypeScript..."
    npm run build:core
else
    echo "✅ TypeScript build is up to date"
fi

# Copy only changed files to app directory
echo "📋 Syncing files to app directory..."
rsync -av --delete \
    --include="index.html" \
    --include="mvp.*.js" \
    --include="mvp.*.css" \
    --include="core/**" \
    --exclude="node_modules" \
    dist/ app/

# Quick package without rebuilding deps
echo "🍎 Packaging app..."
npx electron-builder --mac --dir -c.npmRebuild=false -c.compression=store

echo "✅ Incremental build complete!"
echo "📁 App: release/mac-arm64/SwarmStation.app"