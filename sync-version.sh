#!/bin/bash
# Sync version from pom.xml to all project files
# Usage: ./sync-version.sh [REPO_DIR]
# If no REPO_DIR provided, uses current directory

REPO_DIR="${1:-.}"

# Extract version from pom.xml (get the version after sgen-backend artifactId)
VERSION=$(grep -A1 '<artifactId>sgen-backend</artifactId>' "$REPO_DIR/backend/pom.xml" | grep -oP '(?<=<version>)[^<]+')
echo "Syncing version: $VERSION"

# Convert to a strictly increasing versionCode: major*10000 + minor*100 + patch
IFS='.' read -r VERSION_MAJOR VERSION_MINOR VERSION_PATCH <<< "$VERSION"
VERSION_PATCH="${VERSION_PATCH%%[!0-9]*}"
VERSION_CODE=$(( ${VERSION_MAJOR:-0} * 10000 + ${VERSION_MINOR:-0} * 100 + ${VERSION_PATCH:-0} ))

# Update Android build.gradle
sed -i "s/versionCode [0-9]*/versionCode $VERSION_CODE/" "$REPO_DIR/frontend/android/app/build.gradle"
sed -i "s/versionName \"[^\"]*\"/versionName \"$VERSION\"/" "$REPO_DIR/frontend/android/app/build.gradle"

# Update frontend package.json
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$REPO_DIR/frontend/package.json"

echo "Version synced to:"
echo "  - Android: versionCode=$VERSION_CODE, versionName=$VERSION"
echo "  - Frontend package.json: $VERSION"
echo "  - Backend pom.xml: $VERSION (source)"
echo "Done!"
