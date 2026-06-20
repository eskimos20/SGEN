#!/bin/bash

# =============================================================================
# SGEN - Deploy to Server with Android App Build
# =============================================================================
#
# CONFIGURATION - EDIT THESE VALUES BEFORE RUNNING
# =============================================================================

# Required: Your domain or IP (e.g., your-domain.ddns.net or 192.168.1.100)
SGEN_DDNS_OR_IP=""

# Required: Git branch to deploy (e.g., main, develop)
SGEN_BRANCH="main"

# Protocol: http or https (use https if behind stunnel/reverse proxy)
SGEN_PROTOCOL="http"

# Backend port - the port your Spring Boot server actually runs on (default: 8084)
SGEN_BACKEND_PORT="8084"

# External port - the port clients use to connect (e.g., stunnel/reverse proxy port)
# If using stunnel: set this to the external port (e.g., 50505), BACKEND_PORT to internal (8084)
# If no proxy: set both to the same value (e.g., 8084)
SGEN_EXTERNAL_PORT="8084"

# Server directories
SERVER_DIR="/home/eskimos/SERVER/SGEN"
REPO_DIR="/home/eskimos/SGEN"

# GitHub repository URL
GITHUB_REPO="https://github.com/eskimos20/SGEN.git"

# JWT Secret (change for production!)
JWT_SECRET="${JWT_SECRET:-default-local-secret-key-do-not-use-in-production}"

# CORS Origins - will auto-include your domain below
CORS_BASE_ORIGINS="http://localhost:3000,http://localhost:5173,http://localhost:8084,capacitor://localhost,file://"

# =============================================================================
# VALIDATION - DO NOT EDIT BELOW THIS LINE
# =============================================================================

if [[ -z "$SGEN_DDNS_OR_IP" ]]; then
    echo "❌ ERROR: SGEN_DDNS_OR_IP is not set!"
    echo "   Edit this script and set: SGEN_DDNS_OR_IP=your-domain.ddns.net"
    exit 1
fi

DDNS_OR_IP="$SGEN_DDNS_OR_IP"
BRANCH="$SGEN_BRANCH"
PROTOCOL="$SGEN_PROTOCOL"
BACKEND_PORT="$SGEN_BACKEND_PORT"
EXTERNAL_PORT="$SGEN_EXTERNAL_PORT"

# Build CORS origins - use EXTERNAL_PORT (what clients actually connect to)
if [[ "$PROTOCOL" == "https" ]]; then
    CORS_ORIGINS="${CORS_BASE_ORIGINS},https://${DDNS_OR_IP}:${EXTERNAL_PORT}"
else
    CORS_ORIGINS="${CORS_BASE_ORIGINS},http://${DDNS_OR_IP}:${EXTERNAL_PORT}"
fi

echo "========================================"
echo "  SGEN - Deploy to Server + Android"
echo "========================================"
echo ""
echo "Backend internal URL: ${PROTOCOL}://${DDNS_OR_IP}:${BACKEND_PORT}"
echo "Android API URL (external): ${PROTOCOL}://${DDNS_OR_IP}:${EXTERNAL_PORT}/api"
echo "CORS Origin: ${PROTOCOL}://${DDNS_OR_IP}:${EXTERNAL_PORT}"
echo "Branch: $BRANCH"
echo ""

DATE=$(date +%Y-%m-%d_%H-%M-%S)

# Android SDK installation (same as rebuild-and-start.sh)
ANDROID_SDK_INSTALL_DIR="$HOME/android-sdk"

install_android_sdk() {
    echo ""
    echo "📱 Android SDK not found. Installing automatically..."
    echo "   This is a one-time setup and may take a few minutes."
    echo ""
    
    mkdir -p "$ANDROID_SDK_INSTALL_DIR"
    cd "$ANDROID_SDK_INSTALL_DIR"
    
    if [ ! -f "commandlinetools-linux.zip" ]; then
        echo "Downloading Android SDK Command Line Tools..."
        curl -o commandlinetools-linux.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
    fi
    
    echo "Extracting..."
    unzip -q -o commandlinetools-linux.zip
    mkdir -p cmdline-tools/latest
    mv cmdline-tools/* cmdline-tools/latest/ 2>/dev/null || true
    
    export ANDROID_SDK_ROOT="$ANDROID_SDK_INSTALL_DIR"
    export PATH="$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools"
    
    echo "Installing SDK components..."
    export ANDROID_SDK_HOME="$ANDROID_SDK_ROOT"
    yes | "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --licenses 2>&1 || true
    "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "build-tools;34.0.0" "platforms;android-34" "platforms;android-33" "cmdline-tools;latest" --channel=0 2>&1 || true
    
    echo "✅ Android SDK installed!"
    cd - >/dev/null
}

# Check/set Android SDK
if [ -z "$ANDROID_SDK_ROOT" ] && [ -z "$ANDROID_HOME" ]; then
    if [ -d "$ANDROID_SDK_INSTALL_DIR" ]; then
        export ANDROID_SDK_ROOT="$ANDROID_SDK_INSTALL_DIR"
        export ANDROID_SDK_HOME="$ANDROID_SDK_ROOT"
        export PATH="$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools"
        # Accept licenses again to be sure
        echo "Accepting Android SDK licenses..."
        yes | "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --licenses 2>&1 || true
    else
        install_android_sdk
    fi
elif [ -n "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
    export ANDROID_SDK_HOME="$ANDROID_SDK_ROOT"
    export PATH="$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools"
fi

# 1. Stoppa servicen
echo "[1/7] Stopping sgen.service..."
sudo systemctl stop sgen.service 2>/dev/null
echo "✅ Service stopped"
sleep 2

# 2. Backa gamla JAR
echo "[2/7] Backing up old JAR..."
if [ -f "$SERVER_DIR/SGEN.jar" ]; then
    mv "$SERVER_DIR/SGEN.jar" "$SERVER_DIR/SGEN-$DATE.jar"
    echo "✅ Old JAR renamed to SGEN-$DATE.jar"
fi

# 3. Klona repo
echo "[3/7] Re-cloning repository..."
if [ -d "$REPO_DIR" ]; then
    if [[ "$REPO_DIR" == "/home/eskimos/SGEN" ]]; then
        rm -rf "$REPO_DIR"
        echo "✅ Old repo deleted"
    else
        echo "❌ REPO_DIR mismatch! Aborting."
        exit 1
    fi
fi

git clone --branch "$BRANCH" "$GITHUB_REPO" "$REPO_DIR"
if [ $? -ne 0 ]; then
    echo "❌ Git clone failed!"
    exit 1
fi
echo "✅ Repository cloned (branch: $BRANCH)"

# Sync version from pom.xml to Android and frontend
echo "Syncing version..."
"$REPO_DIR/sync-version.sh" "$REPO_DIR"

# 4. Bygg med Android APK
echo "[4/7] Building project with Android APK..."
cd "$REPO_DIR" || exit 1

# Uppdatera network_security_config.xml med rätt domän
echo "Updating Android network security config..."
NETWORK_CONFIG="frontend/android/app/src/main/res/xml/network_security_config.xml"
cat > "$NETWORK_CONFIG" << EOF
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system"/>
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">${DDNS_OR_IP}</domain>
    </domain-config>
</network-security-config>
EOF
echo "✅ Network config updated with: ${DDNS_OR_IP}"

# Sätt miljövariabler för bygget
export JWT_SECRET="$JWT_SECRET"
export CORS_ALLOWED_ORIGINS="$CORS_ORIGINS"

# Strava OAuth redirect URI (for Strava API integration)
export STRAVA_REDIRECT_URI="${PROTOCOL}://${DDNS_OR_IP}:${EXTERNAL_PORT}/api/strava/callback"
echo "🔗 Strava OAuth redirect: $STRAVA_REDIRECT_URI"

# Force HTTPS for Strava callback if using HTTPS protocol
if [[ "$PROTOCOL" == "https" ]]; then
    export FORCE_HTTPS="true"
    echo "🔒 FORCE_HTTPS enabled for Strava callback URL"
fi

# VIKTIGAST: API URL för Android app (use external port)
export VITE_API_URL="${PROTOCOL}://${DDNS_OR_IP}:${EXTERNAL_PORT}/api"
echo "📱 Android app will connect to: $VITE_API_URL"

# Bygg frontend (skapar dist/ med rätt API URL)
echo "Building frontend..."
cd frontend
npm install --legacy-peer-deps
npm run build
cd ..

# Kopiera frontend till backend
cp -r frontend/dist/* backend/src/main/resources/static/

# Bygg APK om SDK finns
if [ -d "$ANDROID_SDK_ROOT" ]; then
    echo "Building Android APK..."
    export ANDROID_SDK_ROOT="$ANDROID_SDK_ROOT"
    export PATH="$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools"
    
    # Accept SDK licenses (required for build to work)
    echo "Accepting Android SDK licenses..."
    export ANDROID_SDK_HOME="$ANDROID_SDK_ROOT"
    yes | "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --licenses 2>&1 || true
    
    # Also install/update the required components explicitly
    echo "Installing/updating SDK components..."
    "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" "platforms;android-34" "build-tools;34.0.0" --channel=0 2>&1 || true
    
    cd frontend
    npx cap sync android
    cd android
    
    # Rensa gammal cache
    rm -rf "$HOME/.gradle/caches/8.0.*" 2>/dev/null || true
    rm -rf "$HOME/.gradle/caches/8.5.*" 2>/dev/null || true
    
    ./gradlew clean
    ./gradlew assembleDebug
    
    if [ $? -eq 0 ]; then
        mkdir -p ../../backend/src/main/resources/static/downloads
        cp app/build/outputs/apk/debug/app-debug.apk ../../backend/src/main/resources/static/downloads/sgen-android.apk
        echo "✅ APK built: backend/src/main/resources/static/downloads/sgen-android.apk"
    else
        echo "⚠️ APK build failed"
    fi
    cd ../..
else
    echo "ℹ️ Android SDK not found, skipping APK build"
fi

# Bygg backend JAR
echo "Building backend..."
cd backend
export JAVA_HOME=$(readlink -f $(which java) | sed 's/bin\/java//')
mvn clean package -DskipTests
cd ..

# Kopiera JAR
cp backend/target/sgen-backend-*.jar SGEN.jar 2>/dev/null || cp backend/target/*.jar SGEN.jar
echo "✅ Build complete"

# 5. Kopiera till server
echo "[5/6] Copying to server..."
cp "$REPO_DIR/SGEN.jar" "$SERVER_DIR/SGEN.jar"
echo "✅ Files copied"

# 6. Starta service
echo "[6/6] Starting service..."
sudo systemctl start sgen.service
sleep 3
if systemctl is-active --quiet sgen.service; then
    echo "✅ Service started successfully"
else
    echo "❌ Service failed to start"
    exit 1
fi

echo ""
echo "========================================"
echo "✅ Deployment completed!"
echo "========================================"
echo ""
echo "Android APK: ${PROTOCOL}://${DDNS_OR_IP}:${EXTERNAL_PORT}/downloads/sgen-android.apk"
echo "Branch: $BRANCH"
echo "Backup: SGEN-$DATE.jar"
echo "========================================"
