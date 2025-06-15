#!/bin/bash

# Local Development Setup Script for DMGT Form Application
# This script helps set up local development environment after backend deployment

echo "🚀 Setting up DMGT Form local development environment..."

# Check if we're in the right directory
if [ ! -f "frontend/package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Get the API Gateway URL from AWS
echo "📡 Getting API Gateway URL from AWS..."
API_URL=$(aws cloudformation describe-stacks \
    --stack-name dmgt-basic-form-dev \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
    --output text \
    --profile dmgt-account \
    --region eu-west-2 2>/dev/null)

if [ -z "$API_URL" ]; then
    echo "⚠️  Warning: Could not retrieve API Gateway URL from AWS"
    echo "   Using default URL. Make sure your AWS credentials are configured."
    API_URL="https://hfrcfsq0v6.execute-api.eu-west-2.amazonaws.com/dev"
fi

echo "🔗 API Gateway URL: $API_URL"

# Create/update .env file for local development
echo "📝 Creating local .env file..."
cat > frontend/.env.local << EOF
# DMGT Form Local Development Environment
# Generated on $(date)

REACT_APP_API_URL=$API_URL
REACT_APP_ENVIRONMENT=local
GENERATE_SOURCEMAP=false
SKIP_PREFLIGHT_CHECK=true
EOF

echo "✅ Created frontend/.env.local"

# Install dependencies if needed
echo "📦 Checking frontend dependencies..."
cd frontend

if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
else
    echo "✅ Frontend dependencies already installed"
fi

# Fix potential permission issues
echo "🔧 Fixing potential permission issues..."
chmod +x ../deploy*.sh 2>/dev/null
chmod +x ../fix-dependencies.sh 2>/dev/null

# Check for common issues
echo "🔍 Checking for common issues..."

# Check Node.js version
NODE_VERSION=$(node --version)
echo "📋 Node.js version: $NODE_VERSION"

# Check if port 3000 is available
if lsof -i :3000 >/dev/null 2>&1; then
    echo "⚠️  Warning: Port 3000 is already in use"
    echo "   You may need to stop other React applications or use a different port"
else
    echo "✅ Port 3000 is available"
fi

# Create start script that handles common issues
echo "📝 Creating enhanced start script..."
cat > start-dev.js << 'EOF'
const { spawn } = require('child_process');
const fs = require('fs');

console.log('🚀 Starting DMGT Form development server...');

// Check if .env.local exists
if (!fs.existsSync('.env.local')) {
    console.log('❌ .env.local not found. Please run setup-local-dev.sh first');
    process.exit(1);
}

// Set environment variables
process.env.SKIP_PREFLIGHT_CHECK = 'true';
process.env.GENERATE_SOURCEMAP = 'false';

// Start the development server
const child = spawn('npm', ['start'], {
    stdio: 'inherit',
    env: { ...process.env },
    shell: true
});

child.on('error', (error) => {
    console.error('❌ Error starting development server:', error.message);
});

child.on('close', (code) => {
    console.log(`Development server exited with code ${code}`);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down development server...');
    child.kill('SIGINT');
});
EOF

echo "✅ Created enhanced start script"

cd ..

echo ""
echo "🎉 Local development environment setup complete!"
echo ""
echo "To start local development:"
echo "  cd frontend"
echo "  npm run dev    (enhanced start script)"
echo "  # OR"
echo "  npm start      (standard start script)"
echo ""
echo "📋 Environment details:"
echo "  - API URL: $API_URL"
echo "  - Local environment file: frontend/.env.local"
echo "  - Enhanced start script: frontend/start-dev.js"
echo ""
echo "🔧 If you encounter issues:"
echo "  1. Make sure AWS credentials are configured (aws configure --profile dmgt-account)"
echo "  2. Ensure the backend is deployed (run deploy.sh)"
echo "  3. Check that Node.js version is 16+ (current: $NODE_VERSION)"
echo "  4. Try clearing node_modules and reinstalling: rm -rf node_modules && npm install"
echo ""
