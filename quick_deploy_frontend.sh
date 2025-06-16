#!/bin/bash

# Quick Frontend Deployment Fix for Node.js 18
# This script handles the Sunday afternoon fixes deployment with proper Node.js 18 compatibility

set -e

echo "🚀 DMGT Basic Form - Quick Frontend Deployment"
echo "=============================================="

# Check if we're in the right directory
if [ ! -f "frontend/package.json" ]; then
    echo "❌ Error: Run this script from the DMGT-BASIC-FORM root directory"
    exit 1
fi

# Get stack outputs for S3 bucket name
echo "📋 Getting CloudFormation stack outputs..."
STACK_NAME="dmgt-basic-form-dev"
REGION="eu-west-2"

WEBSITE_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`WebsiteBucketName`].OutputValue' \
    --output text)

CLOUDFRONT_ID=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -z "$WEBSITE_BUCKET" ]; then
    echo "❌ Error: Could not find website bucket name"
    exit 1
fi

echo "✅ Website bucket: $WEBSITE_BUCKET"

# Navigate to frontend directory
cd frontend

# Clean up any existing node_modules and package-lock.json to avoid conflicts
echo "🧹 Cleaning up existing dependencies..."
rm -rf node_modules package-lock.json

# Create .env file with API URL
echo "⚙️ Creating environment configuration..."
API_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
    --output text)

cat > .env.production << EOF
REACT_APP_API_URL=$API_URL
GENERATE_SOURCEMAP=false
EOF

echo "✅ Environment configured with API URL: $API_URL"

# Install dependencies with npm using force to bypass peer dependency issues
echo "📦 Installing dependencies (Node.js 18 compatible)..."
npm install --force --silent

# Build the application with proper Node.js 18 environment
echo "🔨 Building React application..."

# Try building with different Node.js options for compatibility
echo "Attempting build with standard configuration..."
if ! npm run build; then
    echo "Standard build failed, trying with legacy OpenSSL provider..."
    export NODE_OPTIONS="--openssl-legacy-provider"
    if ! npm run build; then
        echo "Legacy provider build failed, trying with increased memory..."
        export NODE_OPTIONS="--openssl-legacy-provider --max_old_space_size=4096"
        if ! npm run build; then
            echo "❌ All build attempts failed. Let's try a different approach..."
            echo "Clearing cache and trying once more..."
            npm cache clean --force
            rm -rf node_modules package-lock.json
            npm install --force --silent
            export NODE_OPTIONS="--openssl-legacy-provider"
            npm run build
        fi
    fi
fi

echo "✅ Build completed successfully!"

# Deploy to S3
echo "🚀 Deploying to S3..."
aws s3 sync build/ s3://$WEBSITE_BUCKET --delete --region $REGION

# Invalidate CloudFront cache if distribution exists
if [ ! -z "$CLOUDFRONT_ID" ] && [ "$CLOUDFRONT_ID" != "None" ]; then
    echo "🔄 Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id $CLOUDFRONT_ID \
        --paths "/*" \
        --region $REGION > /dev/null
    echo "✅ CloudFront cache invalidated"
else
    echo "ℹ️ No CloudFront distribution found, skipping cache invalidation"
fi

# Get the website URL
WEBSITE_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' \
    --output text)

echo ""
echo "🎉 Deployment completed successfully!"
echo "=============================================="
echo "Website URL: $WEBSITE_URL"
echo ""
echo "✅ Sunday afternoon fixes are now live:"
echo "   • Load Previous Survey functionality"
echo "   • Professional layout improvements"  
echo "   • British English terminology"
echo ""
echo "🧪 Test the improvements:"
echo "   1. Enter an organisation ID"
echo "   2. Start a survey and save progress"
echo "   3. Return and verify 'Load Previous Survey' appears"
echo "   4. Check responsive design and professional appearance"
echo ""

cd ..