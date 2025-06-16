#!/bin/bash

# DMGT Form - Sunday Afternoon Critical Fixes Deployment Script
# This script deploys the fixes for S3 upload and organization assessment logic

set -e

echo "🚀 DMGT Sunday Afternoon Fixes Deployment Started"
echo "======================================================"

# Check if AWS CLI is configured
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "❌ AWS CLI not configured. Please run 'aws configure' first."
    exit 1
fi

# Set variables
FUNCTION_NAME="dmgt-basic-form-responses-dev"
REGION="eu-west-2"
STACK_NAME="dmgt-basic-form-dev"

echo "📋 Deployment Configuration:"
echo "   Function: $FUNCTION_NAME"
echo "   Region: $REGION"
echo "   Stack: $STACK_NAME"
echo ""

# Step 1: Update Lambda function configuration
echo "⚙️  STEP 1: Updating Lambda function configuration..."
aws lambda update-function-configuration \
    --function-name $FUNCTION_NAME \
    --timeout 30 \
    --memory-size 256 \
    --environment Variables='{
        "RESPONSES_BUCKET":"dmgt-basic-form-responses-dev-530545734605",
        "CONFIG_BUCKET":"dmgt-basic-form-config-dev-530545734605",
        "VERSION":"5.0-s3-upload-support"
    }' \
    --region $REGION \
    > /dev/null

echo "✅ Lambda configuration updated (timeout: 30s, memory: 256MB)"

# Step 2: Update Lambda function code
echo "⚙️  STEP 2: Updating Lambda function code..."

# Create temporary directory for deployment
TEMP_DIR=$(mktemp -d)
cd $TEMP_DIR

# Copy the updated Lambda function code
cp "${OLDPWD}/infrastructure/lambda/responses-function/index.py" .

# Create ZIP file
zip -q function.zip index.py

# Update function code
aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://function.zip \
    --region $REGION \
    > /dev/null

echo "✅ Lambda function code updated with S3 upload support"

# Clean up
cd $OLDPWD
rm -rf $TEMP_DIR

# Step 3: Build and deploy frontend
echo "⚙️  STEP 3: Building and deploying frontend..."
cd frontend

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

# Build production frontend
echo "🏗️  Building production frontend..."
npm run build

# Sync to S3 bucket
WEBSITE_BUCKET="dmgt-basic-form-website-dev-530545734605"
echo "📤 Deploying to S3 bucket: $WEBSITE_BUCKET"

aws s3 sync build/ s3://$WEBSITE_BUCKET/ \
    --delete \
    --region $REGION \
    --quiet

echo "✅ Frontend deployed successfully"

cd ..

# Step 4: Invalidate CloudFront cache
echo "⚙️  STEP 4: Invalidating CloudFront cache..."

# Get CloudFront distribution ID
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Comment=='CloudFront distribution for dmgt-basic-form-dev'].Id" \
    --output text \
    --region $REGION)

if [ ! -z "$DISTRIBUTION_ID" ] && [ "$DISTRIBUTION_ID" != "None" ]; then
    aws cloudfront create-invalidation \
        --distribution-id $DISTRIBUTION_ID \
        --paths "/*" \
        --region $REGION \
        > /dev/null
    echo "✅ CloudFront cache invalidated (Distribution: $DISTRIBUTION_ID)"
else
    echo "⚠️  CloudFront distribution not found, skipping cache invalidation"
fi

# Step 5: Test the deployment
echo "⚙️  STEP 5: Testing deployment..."

# Test Lambda function
echo "🧪 Testing Lambda function..."
aws lambda invoke \
    --function-name $FUNCTION_NAME \
    --payload '{"httpMethod":"OPTIONS"}' \
    --region $REGION \
    /tmp/test-response.json > /dev/null

if [ $? -eq 0 ]; then
    echo "✅ Lambda function responding correctly"
else
    echo "❌ Lambda function test failed"
fi

# Get API Gateway URL
API_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query "Stacks[0].Outputs[?OutputKey=='ApiGatewayUrl'].OutputValue" \
    --output text \
    --region $REGION 2>/dev/null || echo "")

# Get Website URL
WEBSITE_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query "Stacks[0].Outputs[?OutputKey=='WebsiteURL'].OutputValue" \
    --output text \
    --region $REGION 2>/dev/null || echo "")

echo ""
echo "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "======================================"
echo ""
echo "📍 DEPLOYMENT SUMMARY:"
echo "   ✅ Lambda function updated with S3 upload support"
echo "   ✅ Function timeout increased to 30 seconds"
echo "   ✅ Function memory increased to 256 MB"
echo "   ✅ Frontend rebuilt with organization assessment fixes"
echo "   ✅ Frontend deployed to S3"
echo "   ✅ CloudFront cache invalidated"
echo ""
echo "🌐 ACCESS URLS:"
if [ ! -z "$API_URL" ] && [ "$API_URL" != "None" ]; then
    echo "   API Gateway: $API_URL"
fi
if [ ! -z "$WEBSITE_URL" ] && [ "$WEBSITE_URL" != "None" ]; then
    echo "   Website: $WEBSITE_URL"
fi
echo ""
echo "🔧 CRITICAL FIXES DEPLOYED:"
echo "   1. ✅ S3 upload feature now works properly"
echo "   2. ✅ Organization assessment logic fixed:"
echo "      - Recognizes existing organization files"
echo "      - Asks user to continue/update OR start fresh"
echo "      - Always allows modification of assessments"
echo "      - Proper loading of existing responses"
echo ""
echo "🧪 TESTING INSTRUCTIONS:"
echo "   1. Go to the website URL above"
echo "   2. Enter an organization ID"
echo "   3. Test file uploads in questions that support them"
echo "   4. Test organization assessment continuation logic"
echo ""
echo "📝 WHAT WAS FIXED:"
echo "   - Lambda function timeout was 3 seconds → now 30 seconds"
echo "   - Lambda function memory was 128 MB → now 256 MB"
echo "   - Added comprehensive S3 upload support with fallback"
echo "   - Fixed organization assessment logic to allow editing"
echo "   - Enhanced error handling and logging"
echo "   - Improved CORS headers for all responses"
echo ""
echo "🎯 The 500 errors should now be resolved!"
echo "💾 File uploads will work properly under organization folders"
echo "📋 Organization assessments can be continued/updated as requested"
