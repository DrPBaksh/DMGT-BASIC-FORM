#!/bin/bash

# DMGT Basic Form - Fix Dependencies Script
# This script fixes npm dependency issues for Node.js v18

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo "🔧 DMGT Basic Form - Fix Dependencies Script"
echo "=============================================="

cd "$FRONTEND_DIR"

echo "📁 Working directory: $(pwd)"
echo "📊 Node.js version: $(node --version)"
echo "📦 npm version: $(npm --version)"

echo ""
echo "🧹 Step 1: Cleaning npm cache and removing old dependencies..."
rm -rf node_modules package-lock.json
npm cache clean --force

echo ""
echo "⚙️ Step 2: Creating .npmrc for compatibility..."
cat > .npmrc << EOF
legacy-peer-deps=true
fund=false
audit=false
progress=false
save-exact=true
engine-strict=false
EOF

echo ""
echo "📥 Step 3: Installing dependencies with legacy peer deps..."
npm install --legacy-peer-deps --no-audit --no-fund

echo ""
echo "🧪 Step 4: Testing build process..."
if npm run build; then
    echo ""
    echo "✅ SUCCESS: Dependencies fixed and build working!"
    echo "📱 You can now run the deployment script"
    echo ""
    echo "Next steps:"
    echo "  ./deploy.sh --environment=dev --frontend-only"
    echo "  ./deploy.sh --environment=dev --verbose"
else
    echo ""
    echo "❌ ERROR: Build still failing. Check the error messages above."
    exit 1
fi