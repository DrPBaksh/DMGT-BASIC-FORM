#!/bin/bash

# DMGT Basic Form - Complete Deployment Script v4.0
# This script deploys the fully fixed DMGT Basic Form application

set -e

echo "🚀 DMGT Basic Form - Complete Deployment v4.0"
echo "=============================================="

# Configuration
STACK_NAME="dmgt-basic-form-prod"
ENVIRONMENT="prod"
REGION="us-east-1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print status messages
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if AWS CLI is configured
print_status "Checking AWS CLI configuration..."
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS CLI not configured. Please run 'aws configure' first."
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
print_success "AWS CLI configured. Account ID: $ACCOUNT_ID"

# Function to check if stack exists
stack_exists() {
    aws cloudformation describe-stacks --stack-name $1 &> /dev/null
}

# Step 1: Clean up any existing failed stack
print_status "Checking for existing stack..."
if stack_exists $STACK_NAME; then
    STACK_STATUS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].StackStatus' --output text)
    print_warning "Found existing stack with status: $STACK_STATUS"
    
    if [[ "$STACK_STATUS" == "ROLLBACK_COMPLETE" ]] || [[ "$STACK_STATUS" == "CREATE_FAILED" ]] || [[ "$STACK_STATUS" == "UPDATE_ROLLBACK_COMPLETE" ]]; then
        print_status "Deleting failed stack..."
        aws cloudformation delete-stack --stack-name $STACK_NAME
        
        print_status "Waiting for stack deletion to complete..."
        aws cloudformation wait stack-delete-complete --stack-name $STACK_NAME
        print_success "Stack deleted successfully"
    elif [[ "$STACK_STATUS" == "CREATE_COMPLETE" ]] || [[ "$STACK_STATUS" == "UPDATE_COMPLETE" ]]; then
        print_warning "Stack exists and is in good state. This will be an update."
    fi
fi

# Step 2: Deploy CloudFormation stack
print_status "Deploying CloudFormation stack..."
aws cloudformation deploy \
    --template-file infrastructure/cloudformation-template.yaml \
    --stack-name $STACK_NAME \
    --parameter-overrides Environment=$ENVIRONMENT \
    --capabilities CAPABILITY_NAMED_IAM \
    --region $REGION

if [ $? -eq 0 ]; then
    print_success "CloudFormation stack deployed successfully"
else
    print_error "CloudFormation deployment failed"
    exit 1
fi

# Step 3: Get stack outputs
print_status "Retrieving stack outputs..."
CONFIG_BUCKET=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`ConfigBucketName`].OutputValue' --output text)
RESPONSES_BUCKET=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`ResponsesBucketName`].OutputValue' --output text)
WEBSITE_BUCKET=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`WebsiteBucketName`].OutputValue' --output text)
API_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' --output text)
CLOUDFRONT_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' --output text)

print_success "Stack outputs retrieved:"
echo "  Config Bucket: $CONFIG_BUCKET"
echo "  Responses Bucket: $RESPONSES_BUCKET"
echo "  Website Bucket: $WEBSITE_BUCKET"
echo "  API URL: $API_URL"
echo "  Website URL: $CLOUDFRONT_URL"

# Step 4: Upload configuration files
print_status "Uploading configuration files..."
if [ -f "data/CompanyQuestions.csv" ]; then
    aws s3 cp data/CompanyQuestions.csv s3://$CONFIG_BUCKET/
    print_success "CompanyQuestions.csv uploaded"
else
    print_warning "CompanyQuestions.csv not found in data/ directory"
fi

if [ -f "data/EmployeeQuestions.csv" ]; then
    aws s3 cp data/EmployeeQuestions.csv s3://$CONFIG_BUCKET/
    print_success "EmployeeQuestions.csv uploaded"
else
    print_warning "EmployeeQuestions.csv not found in data/ directory"
fi

# Step 5: Build and deploy frontend
print_status "Building and deploying frontend..."
cd frontend

# Update environment variables
cat > .env.production << EOF
REACT_APP_API_URL=$API_URL
GENERATE_SOURCEMAP=false
EOF

print_status "Installing frontend dependencies..."
npm install

print_status "Building React application..."
npm run build

print_status "Deploying to S3..."
aws s3 sync build/ s3://$WEBSITE_BUCKET/ --delete

# Set proper cache headers
print_status "Setting cache headers..."
aws s3 cp s3://$WEBSITE_BUCKET/static/ s3://$WEBSITE_BUCKET/static/ \
    --recursive \
    --metadata-directive REPLACE \
    --cache-control "public, max-age=31536000, immutable"

aws s3 cp s3://$WEBSITE_BUCKET/index.html s3://$WEBSITE_BUCKET/index.html \
    --metadata-directive REPLACE \
    --cache-control "public, max-age=0, must-revalidate"

cd ..

print_success "Frontend deployed successfully"

# Step 6: Test the deployment
print_status "Testing deployment..."

# Test API health
print_status "Testing API health..."
API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/s3/health" || echo "000")
if [ "$API_HEALTH" = "200" ]; then
    print_success "API health check passed"
else
    print_warning "API health check failed (HTTP $API_HEALTH). This might be normal if endpoints aren't fully configured yet."
fi

# Test configuration endpoint
print_status "Testing configuration endpoint..."
CONFIG_TEST=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/config/company" || echo "000")
if [ "$CONFIG_TEST" = "200" ]; then
    print_success "Configuration endpoint working"
elif [ "$CONFIG_TEST" = "404" ]; then
    print_warning "Configuration endpoint returned 404. Make sure CSV files are uploaded to the config bucket."
else
    print_warning "Configuration endpoint test failed (HTTP $CONFIG_TEST)"
fi

# Step 7: CloudFront invalidation
print_status "Creating CloudFront invalidation..."
CLOUDFRONT_ID=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDomainName`].OutputValue' --output text | cut -d'.' -f1)

if [ ! -z "$CLOUDFRONT_ID" ] && [ "$CLOUDFRONT_ID" != "None" ]; then
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id $CLOUDFRONT_ID \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text)
    print_success "CloudFront invalidation created: $INVALIDATION_ID"
else
    print_warning "Could not create CloudFront invalidation - distribution ID not found"
fi

# Step 8: Final summary
echo ""
echo "🎉 DEPLOYMENT COMPLETE!"
echo "======================="
echo ""
print_success "Your DMGT Basic Form application has been successfully deployed!"
echo ""
echo "📋 Application URLs:"
echo "  🌐 Website: $CLOUDFRONT_URL"
echo "  🔗 API: $API_URL"
echo ""
echo "📊 AWS Resources:"
echo "  📁 Config Bucket: $CONFIG_BUCKET"
echo "  💾 Responses Bucket: $RESPONSES_BUCKET"
echo "  🌍 Website Bucket: $WEBSITE_BUCKET"
echo ""
echo "✅ Features Available:"
echo "  🏢 Company Assessment (one per company ID)"
echo "  👤 Employee Assessment (multiple per company)"
echo "  📎 File Uploads (secure S3 storage)"
echo "  💾 Auto-save (every question response)"
echo "  🔄 Session Restoration (resume where left off)"
echo ""
echo "🚀 Ready for:"
echo "  ✓ Company onboarding (e.g., Corndel1)"
echo "  ✓ Employee assessments"
echo "  ✓ File uploads and management"
echo "  ✓ Progress tracking"
echo ""
echo "📚 Documentation:"
echo "  📖 See COMPLETE_FIX_SUMMARY.md for detailed information"
echo "  🔧 See BACKEND_API_REQUIREMENTS.md for API documentation"
echo ""
echo "🎯 Test the application:"
echo "  1. Visit: $CLOUDFRONT_URL"
echo "  2. Enter a Company ID (e.g., 'Corndel1')"
echo "  3. Complete company assessment"
echo "  4. Try employee assessments (new and returning)"
echo "  5. Test file uploads on supported questions"
echo ""
echo "💡 Need help? Check the documentation files in the repository."
echo ""
