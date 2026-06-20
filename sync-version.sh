#!/bin/bash
# Sync version from pom.xml to all project files
# Usage: ./sync-version.sh [REPO_DIR]
# If no REPO_DIR provided, uses current directory

REPO_DIR="${1:-.}"

# Extract version from pom.xml (get the version after sgen-backend artifactId)
VERSION=$(grep -A1 '<artifactId>sgen-backend</artifactId>' "$REPO_DIR/backend/pom.xml" | grep -oP '(?<=<version>)[^<]+')
echo "Syncing version: $VERSION"

# Convert to versionCode (remove dots, pad if needed)
VERSION_CODE=$(echo $VERSION | tr -d '.')
if [ ${#VERSION_CODE} -eq 3 ]; then
    VERSION_CODE="${VERSION_CODE}0"
fi

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
