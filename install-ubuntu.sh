#!/bin/bash
set -e

echo "========================================"
echo "Installing dependencies for SGEN"
echo "Statistics Generator - Ubuntu Setup"
echo "========================================"
echo ""

# Update package list
echo "[1/8] Updating package list..."
sudo apt update

# Install required system tools and MySQL Server
echo ""
echo "[2/8] Installing system tools (git, curl, unzip)..."
sudo apt install -y git curl unzip

echo ""
echo "[3/8] Installing MySQL Server..."
sudo apt install -y mysql-server
sudo systemctl enable --now mysql

# Verify installations
echo ""
echo "Git version:"
git --version
echo "Curl version:"
curl --version | head -1
echo "Unzip version:"
unzip -v | head -1

# Install Java 21
echo ""
echo "[4/8] Installing Java 21 JDK..."
sudo apt install -y openjdk-21-jdk

# Verify Java installation
echo ""
echo "Java version:"
java -version

# Install Maven
echo ""
echo "[5/8] Installing Maven..."
sudo apt install -y maven

# Verify Maven installation
echo ""
echo "Maven version:"
mvn -version

# Install Node.js 20
echo ""
echo "[6/8] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
echo ""
echo "Node.js version:"
node -v
echo "npm version:"
npm -v

# Install additional build essentials
echo ""
echo "[7/8] Installing build essentials..."
sudo apt install -y build-essential

# Verify sudo access for systemd (needed for deploy-to-server.sh)
echo ""
echo "[8/8] Verifying sudo access..."
if sudo -n true 2>/dev/null; then
    echo "✅ Sudo access verified"
else
    echo "⚠️  Note: You will need sudo access to manage systemd services"
fi

echo ""
echo "========================================"
echo "Installation complete!"
echo "========================================"
echo ""
echo "You can now run the application with:"
echo "  ./rebuild-and-start.sh          # Local development"
echo "  ./deploy-to-server.sh           # Deploy to production"
echo ""
echo "Available scripts:"
echo "  - ./rebuild-and-start.sh  : Build and start locally"
echo "  - ./deploy-to-server.sh   : Deploy to production server"
echo "  - ./sync-version.sh       : Sync version numbers"
echo ""

