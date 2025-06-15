#!/bin/bash

# Frontend Deployment Script for DMGT Basic Form
# This script builds and deploys the React frontend to S3

set -e

# Configuration
STACK_NAME="dmgt-basic-form-dev"
REGION="us-east-1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== DMGT Basic Form - Frontend Deployment ===${NC}"
echo ""

# Check if we're in the right directory
if [ ! -d "frontend" ]; then
    echo -e "${RED}Error: frontend directory not found. Please run this script from the project root.${NC}"
    exit 1
fi

# Get S3 bucket name from CloudFormation stack
echo -e "${YELLOW}Getting S3 bucket name from CloudFormation stack...${NC}"
BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`WebsiteBucketName`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$BUCKET_NAME" ]; then
    echo -e "${RED}Error: Could not get S3 bucket name from stack $STACK_NAME${NC}"
    echo "Please ensure the infrastructure is deployed first by running: ./deploy_simplified.sh"
    exit 1
fi

echo -e "${GREEN}S3 Bucket: $BUCKET_NAME${NC}"

# Get API Gateway URL
API_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
    --output text 2>/dev/null)

if [ -n "$API_URL" ]; then
    echo -e "${GREEN}API URL: $API_URL${NC}"
    
    # Update environment file
    echo -e "${YELLOW}Updating environment configuration...${NC}"
    cat > frontend/.env.production << EOF
REACT_APP_API_URL=$API_URL
GENERATE_SOURCEMAP=false
EOF
    echo -e "${GREEN}✅ Environment file updated${NC}"
fi

echo ""

# Navigate to frontend directory
cd frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
fi

# Build the React app
echo -e "${YELLOW}Building React application...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build completed successfully${NC}"

# Deploy to S3
echo -e "${YELLOW}Deploying to S3 bucket: $BUCKET_NAME${NC}"

# Sync build folder to S3
aws s3 sync build/ s3://$BUCKET_NAME/ \
    --delete \
    --region $REGION \
    --cache-control "public,max-age=31536000" \
    --exclude "*.html" \
    --exclude "*.json"

# Upload HTML files with no cache
aws s3 sync build/ s3://$BUCKET_NAME/ \
    --delete \
    --region $REGION \
    --cache-control "no-cache,no-store,must-revalidate" \
    --include "*.html" \
    --include "*.json"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Frontend deployed successfully!${NC}"
else
    echo -e "${RED}❌ Frontend deployment failed${NC}"
    exit 1
fi

# Get CloudFront URL
CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' \
    --output text 2>/dev/null)

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo -e "${BLUE}S3 Bucket: ${NC}$BUCKET_NAME"
if [ -n "$API_URL" ]; then
    echo -e "${BLUE}API Gateway: ${NC}$API_URL"
fi
if [ -n "$CLOUDFRONT_URL" ]; then
    echo -e "${BLUE}Website URL: ${NC}$CLOUDFRONT_URL"
    echo ""
    echo -e "${YELLOW}Note: CloudFront distribution may take 10-15 minutes to fully propagate changes.${NC}"
fi

echo ""
echo -e "${GREEN}✅ Frontend deployment complete!${NC}"
echo -e "${BLUE}The simplified form system is now live and ready to use.${NC}"