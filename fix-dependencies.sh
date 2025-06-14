#!/bin/bash

# NPM Dependency Fix Script
# This script cleans up corrupted npm dependencies and reinstalls everything fresh

echo "🔧 Fixing NPM dependency issues..."
echo "=================================="

# Navigate to frontend directory
cd frontend

echo "1. Removing corrupted node_modules..."
rm -rf node_modules

echo "2. Removing package-lock.json..."
rm -f package-lock.json

echo "3. Clearing npm cache..."
npm cache clean --force

echo "4. Clearing npm cache verify..."
npm cache verify

echo "5. Installing dependencies with clean slate..."
npm install

echo ""
echo "✅ Dependencies should now be fixed!"
echo "🚀 Try running: npm start"
echo ""
echo "If you still have issues, try:"
echo "  - Update Node.js to latest LTS version"
echo "  - Use: npm install --legacy-peer-deps"
echo "  - Or use: yarn install (if you have yarn)"