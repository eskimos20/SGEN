#!/bin/bash

# =============================================================================
# SGEN - Rebuild and Start Script
# =============================================================================
# 
# Environment Variables:
#   VITE_API_URL      - Backend API URL for Android app (e.g., http://192.168.1.100:8084/api)
#                      If not set, defaults to http://192.168.1.100:8084/api
#                      You MUST update this for the Android app to work!
#
#   ANDROID_SDK_ROOT  - Path to Android SDK (auto-installed if not set)
#   JWT_SECRET        - Secret key for JWT tokens
#   CORS_ALLOWED_ORIGINS - Comma-separated list of allowed CORS origins
#
# Example:
#   VITE_API_URL=http://192.168.1.50:8084/api ./rebuild-and-start.sh
# =============================================================================

# Cleanup function
cleanup() {
    echo ""
    echo "Shutting down..."
}

# Trap Ctrl+C and other exit signals
trap cleanup SIGINT SIGTERM EXIT

echo "========================================"
echo "   SGEN - Rebuild and Start"
echo "========================================"
echo ""

# Build frontend
echo "Building frontend..."
cd frontend
npm run build
cd ..

# Copy to backend static
echo "Copying frontend to backend..."
rm -rf backend/src/main/resources/static/*
cp -r frontend/dist/* backend/src/main/resources/static/

# Clean backend target
echo "Cleaning backend target..."
rm -rf backend/target/classes/static/*

# Android SDK installation and APK build
ANDROID_SDK_INSTALL_DIR="$HOME/android-sdk"

install_android_sdk() {
    echo ""
    echo "📱 Android SDK not found. Installing automatically..."
    echo "   This is a one-time setup and may take a few minutes."
    echo ""
    
    # Create SDK directory
    mkdir -p "$ANDROID_SDK_INSTALL_DIR"
    cd "$ANDROID_SDK_INSTALL_DIR"
    
    # Download command line tools
    echo "Downloading Android SDK Command Line Tools..."
    if [ ! -f "commandlinetools-linux.zip" ]; then
        curl -o commandlinetools-linux.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
    fi
    
    # Extract
    echo "Extracting..."
    unzip -q -o commandlinetools-linux.zip
    mkdir -p cmdline-tools/latest
    mv cmdline-tools/* cmdline-tools/latest/ 2>/dev/null || true
    
    # Set environment variables
    export ANDROID_SDK_ROOT="$ANDROID_SDK_INSTALL_DIR"
    export PATH="$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools"
    
    # Install required SDK components
    echo "Installing SDK components (this may take a few minutes)..."
    yes | sdkmanager --licenses >/dev/null 2>&1
    sdkmanager "platform-tools" "build-tools;34.0.0" "platforms;android-34" "platforms;android-33" "cmdline-tools;latest"
    
    echo "✅ Android SDK installed successfully!"
    cd - >/dev/null
}

# Check if Android SDK exists, install if not
if [ -z "$ANDROID_SDK_ROOT" ] && [ -z "$ANDROID_HOME" ]; then
    if [ -d "$ANDROID_SDK_INSTALL_DIR" ]; then
        export ANDROID_SDK_ROOT="$ANDROID_SDK_INSTALL_DIR"
        export PATH="$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools"
    else
        install_android_sdk
    fi
elif [ -n "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi

# Build Android APK if SDK is available
if [ -d "$ANDROID_SDK_ROOT" ]; then
    echo ""
    echo "Building Android APK..."
    export PATH="$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools"
    
    cd frontend
    
    # Sync web assets to Android
    npx cap sync android
    
    # Build debug APK
    cd android
    
    # Clean old Gradle cache if wrapper changed
    if [ -d "$HOME/.gradle/caches" ]; then
        echo "Cleaning old Gradle cache..."
        rm -rf "$HOME/.gradle/caches/8.0.*" 2>/dev/null || true
        rm -rf "$HOME/.gradle/caches/8.5.*" 2>/dev/null || true
    fi
    
    # Clean and build
    ./gradlew clean
    ./gradlew assembleDebug
    
    if [ $? -eq 0 ]; then
        # Copy APK to backend resources for serving
        mkdir -p ../../backend/src/main/resources/static/downloads
        cp app/build/outputs/apk/debug/app-debug.apk ../../backend/src/main/resources/static/downloads/sgen-android.apk
        echo "✅ APK built: backend/src/main/resources/static/downloads/sgen-android.apk"
    else
        echo "⚠️ APK build failed - Android app will not be available"
    fi
    
    cd ../..
else
    echo ""
    echo "ℹ️ Android SDK installation skipped. APK will not be built."
fi

# Set JAVA_HOME to Java 21
if [ -x "/usr/libexec/java_home" ]; then
    # macOS
    export JAVA_HOME=$(/usr/libexec/java_home -v 21)
elif [ -n "$JAVA_HOME" ]; then
    # Already set
    :
elif [ -d "/usr/lib/jvm/java-21-openjdk-amd64" ]; then
    # Ubuntu/Debian
    export JAVA_HOME="/usr/lib/jvm/java-21-openjdk-amd64"
elif [ -d "/usr/lib/jvm/java-21-openjdk" ]; then
    # Generic
    export JAVA_HOME="/usr/lib/jvm/java-21-openjdk"
else
    # Try to find any Java 21
    export JAVA_HOME=$(readlink -f $(which java) | sed 's/bin\/java//')
fi

# Set required environment variables for local development
# For production builds, these should be set before running build.sh
export JWT_SECRET=${JWT_SECRET:-default-local-secret-key-do-not-use-in-production}
export CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS:-http://localhost:3000,http://localhost:5173,http://localhost:8084}

# Start backend
echo "Starting backend..."
echo ""
echo "   URL: http://localhost:8084"
echo "   Default login: admin / password"
echo "========================================"
echo ""

cd backend
mvn clean spring-boot:run
