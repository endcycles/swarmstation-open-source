#!/bin/bash

# SwarmStation Unified Build Script
# Usage: ./build.sh [options]
#
# Options:
#   --platform, -p    Platform to build for (mac|win|linux|all) [default: mac]
#   --arch, -a        Architecture (x64|arm64|universal|all) [default: arm64]
#   --optimization    Optimization level (standard|minimal|ultra-minimal) [default: standard]
#   --output-dir      Output directory [default: release]
#   --type            Build type (dev|prod) [default: prod]
#   --help, -h        Show this help message

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
PLATFORM="mac"
ARCH="arm64"
OPTIMIZATION="standard"
OUTPUT_DIR="release"
BUILD_TYPE="prod"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --platform|-p)
            PLATFORM="$2"
            shift 2
            ;;
        --arch|-a)
            ARCH="$2"
            shift 2
            ;;
        --optimization)
            OPTIMIZATION="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --type)
            BUILD_TYPE="$2"
            shift 2
            ;;
        --help|-h)
            head -n 12 "$0" | tail -n 11 | sed 's/^# //'
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}🚀 SwarmStation Build System${NC}"
echo -e "${BLUE}===========================${NC}"
echo "Platform:      $PLATFORM"
echo "Architecture:  $ARCH"
echo "Optimization:  $OPTIMIZATION"
echo "Output:        $OUTPUT_DIR"
echo "Build Type:    $BUILD_TYPE"
echo ""

# Validate inputs
validate_inputs() {
    case $PLATFORM in
        mac|win|linux|all) ;;
        *) echo -e "${RED}Invalid platform: $PLATFORM${NC}"; exit 1 ;;
    esac
    
    case $ARCH in
        x64|arm64|universal|all) ;;
        *) echo -e "${RED}Invalid architecture: $ARCH${NC}"; exit 1 ;;
    esac
    
    case $OPTIMIZATION in
        standard|minimal|ultra-minimal) ;;
        *) echo -e "${RED}Invalid optimization level: $OPTIMIZATION${NC}"; exit 1 ;;
    esac
    
    case $BUILD_TYPE in
        dev|prod) ;;
        *) echo -e "${RED}Invalid build type: $BUILD_TYPE${NC}"; exit 1 ;;
    esac
}

# Clean previous builds
clean_builds() {
    echo -e "${YELLOW}🧹 Cleaning previous builds...${NC}"
    rm -rf "$OUTPUT_DIR"
    rm -rf dist
    rm -rf app
    rm -rf prod-build
    rm -rf minimal-build
    
    # Clean root directory artifacts
    rm -f mvp.*.js mvp.*.css
    rm -f index.html
}

# Build React application
build_react() {
    echo -e "${YELLOW}⚛️  Building React application...${NC}"
    
    # Build Tailwind CSS
    npm run build:tailwind
    
    if [ "$BUILD_TYPE" = "prod" ]; then
        npm run build:prod
    else
        npm run build
    fi
}

# Prepare app directory based on optimization level
prepare_app_directory() {
    echo -e "${YELLOW}📁 Preparing application directory...${NC}"
    
    case $OPTIMIZATION in
        standard)
            # Standard build - create app directory
            echo "Using standard build (creating app directory)"
            mkdir -p app
            
            # Copy essential files
            cp main.js app/
            cp preload.js app/
            cp -r core app/
            cp -r core-dist app/
            mkdir -p app/src/utils
            cp src/utils/*.js app/src/utils/ 2>/dev/null || true
            cp dist/index.html app/
            cp dist/mvp.*.js app/
            cp dist/mvp.*.css app/
            
            # Fix paths in index.html
            if [ -f scripts/fix-build-paths.js ]; then
                node scripts/fix-build-paths.js
            fi
            
            # Copy package.json and modify for app directory
            cp package.json app/
            # Update main entry point in app/package.json
            sed -i '' 's/"main": "main.js"/"main": "main.js"/' app/package.json 2>/dev/null || \
            sed -i 's/"main": "main.js"/"main": "main.js"/' app/package.json 2>/dev/null || true
            ;;
            
        minimal)
            # Two-package structure
            echo "Creating two-package structure..."
            mkdir -p app
            
            # Copy essential files
            cp preload.js app/
            cp -r core app/
            cp dist/index.html app/
            cp dist/mvp.*.js app/
            cp dist/mvp.*.css app/
            
            # Create minimal package.json
            cat > app/package.json << EOF
{
  "name": "swarmstation",
  "version": "0.1.0",
  "main": "../main.js",
  "dependencies": {
    "@anthropic-ai/claude-code": "^1.0.48",
    "electron-updater": "^6.6.2"
  }
}
EOF
            
            # Install production dependencies only
            cd app
            npm install --omit=dev
            cd ..
            ;;
            
        ultra-minimal)
            # Ultra-minimal with manual dependency selection
            echo "Creating ultra-minimal build..."
            mkdir -p minimal-build
            
            # Copy essential files
            cp main.js minimal-build/
            cp preload.js minimal-build/
            cp -r core minimal-build/
            cp dist/index.html minimal-build/
            cp dist/mvp.*.js minimal-build/
            cp dist/mvp.*.css minimal-build/
            
            # Create minimal package.json
            cat > minimal-build/package.json << EOF
{
  "name": "swarmstation",
  "version": "0.1.0",
  "main": "main.js",
  "dependencies": {
    "@anthropic-ai/claude-code": "^1.0.48",
    "electron-updater": "^6.6.2"
  }
}
EOF
            
            # Manually copy only essential dependencies
            mkdir -p minimal-build/node_modules
            cp -r node_modules/@anthropic-ai minimal-build/node_modules/
            cp -r node_modules/electron-updater minimal-build/node_modules/
            
            # Copy peer dependencies
            for dep in builder-util-runtime builder-util fs-extra lazy-val lodash semver; do
                [ -d "node_modules/$dep" ] && cp -r "node_modules/$dep" minimal-build/node_modules/
            done
            ;;
    esac
}

# Build for macOS
build_mac() {
    local arch_flag=""
    case $ARCH in
        x64) arch_flag="--x64" ;;
        arm64) arch_flag="--arm64" ;;
        universal) arch_flag="--universal" ;;
        all) arch_flag="--x64 --arm64" ;;
    esac
    
    echo -e "${YELLOW}🍎 Building for macOS ${ARCH}...${NC}"
    
    if [ "$OPTIMIZATION" = "minimal" ]; then
        npx electron-builder --mac $arch_flag --config electron-builder.yml
    elif [ "$OPTIMIZATION" = "ultra-minimal" ]; then
        cd minimal-build
        npx electron-builder --mac $arch_flag --config ../electron-builder.yml
        cd ..
    else
        # Standard build uses app directory
        npx electron-builder --mac $arch_flag --config electron-builder.yml
    fi
}

# Build for Windows
build_windows() {
    # Check if we're on macOS and need Wine
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if ! command -v wine &> /dev/null; then
            echo -e "${YELLOW}⚠️  Wine not found. Installing with Homebrew...${NC}"
            brew install --cask wine-stable
        fi
    fi
    
    local arch_flag=""
    case $ARCH in
        x64) arch_flag="--win --x64" ;;
        arm64) arch_flag="--win --arm64" ;;
        all) arch_flag="--win --x64 --arm64" ;;
        *) echo -e "${RED}Invalid architecture for Windows: $ARCH${NC}"; return 1 ;;
    esac
    
    echo -e "${YELLOW}🪟 Building for Windows ${ARCH}...${NC}"
    
    # Ensure app directory exists for Windows builds
    if [ ! -d "app" ] && [ "$OPTIMIZATION" != "ultra-minimal" ]; then
        prepare_app_directory
    fi
    
    if [ "$OPTIMIZATION" = "ultra-minimal" ]; then
        cd minimal-build
        npx electron-builder $arch_flag --config ../electron-builder.yml
        cd ..
    else
        npx electron-builder $arch_flag
    fi
}

# Build for Linux
build_linux() {
    local arch_flag=""
    case $ARCH in
        x64) arch_flag="--linux --x64" ;;
        arm64) arch_flag="--linux --arm64" ;;
        all) arch_flag="--linux --x64 --arm64" ;;
        *) echo -e "${RED}Invalid architecture for Linux: $ARCH${NC}"; return 1 ;;
    esac
    
    echo -e "${YELLOW}🐧 Building for Linux ${ARCH}...${NC}"
    
    if [ "$OPTIMIZATION" = "minimal" ]; then
        npx electron-builder $arch_flag --config electron-builder.yml
    elif [ "$OPTIMIZATION" = "ultra-minimal" ]; then
        cd minimal-build
        npx electron-builder $arch_flag --config ../electron-builder.yml
        cd ..
    else
        npx electron-builder $arch_flag
    fi
}

# Main build function
build_platform() {
    case $PLATFORM in
        mac)
            build_mac
            ;;
        win)
            build_windows
            ;;
        linux)
            build_linux
            ;;
        all)
            build_mac
            build_windows
            build_linux
            ;;
    esac
}

# Post-build actions
post_build() {
    echo -e "${YELLOW}📦 Post-build cleanup...${NC}"
    
    # Clean up app directory after build if needed
    # (No cleanup needed for standard build anymore)
    
    # Rename Windows executables if needed
    if [ "$PLATFORM" = "win" ] || [ "$PLATFORM" = "all" ]; then
        if [ -f "$OUTPUT_DIR/SwarmStation Setup 0.1.0.exe" ]; then
            mv "$OUTPUT_DIR/SwarmStation Setup 0.1.0.exe" "$OUTPUT_DIR/SwarmStation-Setup-0.1.0-x64.exe" 2>/dev/null || true
        fi
        if [ -f "$OUTPUT_DIR/SwarmStation Setup 0.1.0 arm64.exe" ]; then
            mv "$OUTPUT_DIR/SwarmStation Setup 0.1.0 arm64.exe" "$OUTPUT_DIR/SwarmStation-Setup-0.1.0-arm64.exe" 2>/dev/null || true
        fi
    fi
    
    echo -e "${GREEN}✅ Build complete!${NC}"
    echo -e "${GREEN}📁 Output files in: $OUTPUT_DIR${NC}"
    ls -la "$OUTPUT_DIR" 2>/dev/null || echo "No files in output directory yet"
}

# Main execution
main() {
    validate_inputs
    clean_builds
    build_react
    prepare_app_directory
    build_platform
    post_build
}

# Run main function
main