#!/bin/bash
set -e

# DMGT Basic Form - Simple Deployment Script
# This script deploys the DMGT Basic Form application to AWS

# Configuration
ENVIRONMENT=${ENVIRONMENT:-dev}
REGION=${REGION:-eu-west-2}
STACK_NAME="dmgt-basic-form-${ENVIRONMENT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity > /dev/null 2>&1; then
        log_error "AWS credentials not configured"
        exit 1
    fi
    
    # Check CloudFormation template exists
    if [ ! -f "infrastructure/cloudformation-template.yaml" ]; then
        log_error "CloudFormation template not found: infrastructure/cloudformation-template.yaml"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Deploy infrastructure
deploy_infrastructure() {
    log_info "Deploying CloudFormation stack: $STACK_NAME"
    
    # Validate template
    log_info "Validating CloudFormation template..."
    aws cloudformation validate-template \
        --template-body file://infrastructure/cloudformation-template.yaml \
        --region $REGION
    
    if [ $? -eq 0 ]; then
        log_success "Template validation passed"
    else
        log_error "Template validation failed"
        exit 1
    fi
    
    # Deploy stack
    log_info "Deploying stack..."
    aws cloudformation deploy \
        --template-file infrastructure/cloudformation-template.yaml \
        --stack-name $STACK_NAME \
        --parameter-overrides Environment=$ENVIRONMENT \
        --capabilities CAPABILITY_NAMED_IAM \
        --region $REGION
    
    if [ $? -eq 0 ]; then
        log_success "Stack deployment completed"
    else
        log_error "Stack deployment failed"
        exit 1
    fi
}

# Get stack outputs
get_stack_outputs() {
    log_info "Retrieving stack outputs..."
    
    API_URL=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='ApiGatewayUrl'].OutputValue" \
        --output text)
    
    WEBSITE_URL=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='WebsiteURL'].OutputValue" \
        --output text)
    
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
    
    log_success "Stack outputs retrieved"
    echo "API URL: $API_URL"
    echo "Website URL: $WEBSITE_URL"
    echo "Config Bucket: $CONFIG_BUCKET"
    echo "Website Bucket: $WEBSITE_BUCKET"
}

# Upload sample data (if exists)
upload_sample_data() {
    if [ -d "data" ]; then
        log_info "Uploading sample data to S3..."
        
        if [ -f "data/CompanyQuestions.csv" ]; then
            aws s3 cp data/CompanyQuestions.csv s3://$CONFIG_BUCKET/CompanyQuestions.csv --region $REGION
            log_success "CompanyQuestions.csv uploaded"
        fi
        
        if [ -f "data/EmployeeQuestions.csv" ]; then
            aws s3 cp data/EmployeeQuestions.csv s3://$CONFIG_BUCKET/EmployeeQuestions.csv --region $REGION
            log_success "EmployeeQuestions.csv uploaded"
        fi
    fi
}

# Build and deploy frontend (if exists)
deploy_frontend() {
    if [ -d "frontend" ]; then
        log_info "Building and deploying frontend..."
        
        cd frontend
        
        # Create environment file
        cat > .env.production << EOF
REACT_APP_API_URL=$API_URL
GENERATE_SOURCEMAP=false
EOF
        
        # Install dependencies and build
        npm ci --silent
        npm run build
        
        # Upload to S3
        aws s3 sync build/ s3://$WEBSITE_BUCKET --delete --region $REGION
        
        cd ..
        
        log_success "Frontend deployed"
    fi
}

# Test deployment
test_deployment() {
    log_info "Testing deployment..."
    
    # Test API
    if curl -f -s "$API_URL/company-status/test" > /dev/null; then
        log_success "API is responding"
    else
        log_warning "API test failed"
    fi
    
    # Test website
    if curl -f -s "$WEBSITE_URL" > /dev/null; then
        log_success "Website is accessible"
    else
        log_warning "Website test failed"
    fi
}

# Main execution
main() {
    echo "========================================"
    echo "  DMGT Basic Form Deployment"
    echo "========================================"
    echo "Environment: $ENVIRONMENT"
    echo "Region: $REGION"
    echo "Stack: $STACK_NAME"
    echo "========================================"
    
    check_prerequisites
    deploy_infrastructure
    get_stack_outputs
    upload_sample_data
    deploy_frontend
    test_deployment
    
    echo "========================================"
    log_success "Deployment completed successfully!"
    echo "========================================"
    echo "🌐 Website: $WEBSITE_URL"
    echo "🔗 API: $API_URL"
    echo "========================================"
}

# Handle command line arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "delete")
        log_info "Deleting stack: $STACK_NAME"
        aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION
        log_success "Stack deletion initiated"
        ;;
    "status")
        aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION \
            --query 'Stacks[0].{Status:StackStatus,LastUpdated:LastUpdatedTime}'
        ;;
    *)
        echo "Usage: $0 [deploy|delete|status]"
        exit 1
        ;;
esac
