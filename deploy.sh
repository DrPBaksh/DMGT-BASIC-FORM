#!/bin/bash

# DMGT Basic Form - Deployment Script
# This script deploys the complete infrastructure and application

set -e

# Configuration
ENVIRONMENT=${ENVIRONMENT:-prod}
STACK_NAME="dmgt-basic-form-${ENVIRONMENT}"
REGION=${AWS_REGION:-us-east-1}
BUCKET_PREFIX="dmgt-basic-form"

echo "🚀 Starting deployment of DMGT Basic Form..."
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Stack Name: $STACK_NAME"

# Function to check if AWS CLI is installed
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        echo "❌ AWS CLI is not installed. Please install it first."
        exit 1
    fi
    echo "✅ AWS CLI found"
}

# Function to check if Node.js is installed
check_nodejs() {
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js is not installed. Please install it first."
        exit 1
    fi
    echo "✅ Node.js found"
}

# Function to deploy CloudFormation stack
deploy_infrastructure() {
    echo "📦 Deploying CloudFormation infrastructure..."
    
    aws cloudformation deploy \
        --template-file infrastructure/cloudformation-template.yaml \
        --stack-name $STACK_NAME \
        --parameter-overrides Environment=$ENVIRONMENT \
        --capabilities CAPABILITY_NAMED_IAM \
        --region $REGION \
        --no-fail-on-empty-changeset
    
    if [ $? -eq 0 ]; then
        echo "✅ Infrastructure deployed successfully"
    else
        echo "❌ Infrastructure deployment failed"
        exit 1
    fi
}

# Function to get stack outputs
get_stack_outputs() {
    echo "📋 Getting stack outputs..."
    
    CONFIG_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='ConfigBucketName'].OutputValue" \
        --output text)
    
    WEBSITE_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='WebsiteBucketName'].OutputValue" \
        --output text)
    
    API_URL=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='ApiGatewayUrl'].OutputValue" \
        --output text)
    
    CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='WebsiteURL'].OutputValue" \
        --output text)
    
    echo "Config Bucket: $CONFIG_BUCKET"
    echo "Website Bucket: $WEBSITE_BUCKET"
    echo "API URL: $API_URL"
    echo "Website URL: $CLOUDFRONT_URL"
}

# Function to upload CSV configuration files
upload_config_files() {
    echo "📂 Uploading configuration files..."
    
    aws s3 cp data/CompanyQuestions.csv s3://$CONFIG_BUCKET/CompanyQuestions.csv --region $REGION
    aws s3 cp data/EmployeeQuestions.csv s3://$CONFIG_BUCKET/EmployeeQuestions.csv --region $REGION
    
    echo "✅ Configuration files uploaded"
}

# Function to build and deploy React app
deploy_frontend() {
    echo "🏗️  Building React application..."
    
    cd frontend
    
    # Install dependencies
    npm install
    
    # Create environment file for API URL
    echo "REACT_APP_API_URL=$API_URL" > .env.production
    
    # Build the application
    npm run build
    
    if [ $? -eq 0 ]; then
        echo "✅ React app built successfully"
    else
        echo "❌ React app build failed"
        exit 1
    fi
    
    # Upload to S3
    echo "📤 Uploading React app to S3..."
    aws s3 sync build/ s3://$WEBSITE_BUCKET --delete --region $REGION
    
    # Invalidate CloudFront cache
    echo "🔄 Invalidating CloudFront cache..."
    DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomainName'].OutputValue" \
        --output text | cut -d'.' -f1)
    
    aws cloudfront create-invalidation \
        --distribution-id $DISTRIBUTION_ID \
        --paths "/*" \
        --region $REGION > /dev/null 2>&1 || echo "⚠️  CloudFront invalidation failed (this is non-critical)"
    
    cd ..
    
    echo "✅ Frontend deployed successfully"
}

# Function to test deployment
test_deployment() {
    echo "🧪 Testing deployment..."
    
    # Test API endpoint
    echo "Testing API endpoint..."
    curl -s "$API_URL/config/Company" > /dev/null
    if [ $? -eq 0 ]; then
        echo "✅ API is responding"
    else
        echo "⚠️  API test failed"
    fi
    
    # Test website
    echo "Testing website..."
    curl -s "$CLOUDFRONT_URL" > /dev/null
    if [ $? -eq 0 ]; then
        echo "✅ Website is accessible"
    else
        echo "⚠️  Website test failed"
    fi
}

# Main execution
main() {
    echo "========================================"
    echo "  DMGT Basic Form Deployment Script"
    echo "========================================"
    
    check_aws_cli
    check_nodejs
    deploy_infrastructure
    get_stack_outputs
    upload_config_files
    deploy_frontend
    test_deployment
    
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo ""
    echo "📋 Deployment Summary:"
    echo "Environment: $ENVIRONMENT"
    echo "Stack Name: $STACK_NAME"
    echo "Website URL: $CLOUDFRONT_URL"
    echo "API URL: $API_URL"
    echo ""
    echo "📝 Next Steps:"
    echo "1. Access your application at: $CLOUDFRONT_URL"
    echo "2. Use the API at: $API_URL"
    echo "3. Monitor CloudWatch logs for any issues"
    echo "4. CSV files are now available in S3 for editing"
    echo ""
    echo "✅ All resources have been tagged with 'Project: dmgt-basic-form'"
}

# Run main function
main "$@"