#!/usr/bin/env bash
# DMGT Basic Form Deployment Script
# Supports both full infrastructure and frontend-only deployments

set -euo pipefail

# Default configuration
ENVIRONMENT="dev"
REGION="eu-west-2"
FRONTEND_ONLY=false
VERBOSE=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
INFRASTRUCTURE_DIR="$SCRIPT_DIR/infrastructure"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_step() {
    echo -e "${BLUE}🚀 $1${NC}"
    echo "=================================================="
}

log_debug() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${YELLOW}🔍 DEBUG: $1${NC}"
    fi
}

# Execute command with error handling
execute_command() {
    local cmd="$1"
    local desc="$2"
    
    log_debug "Executing: $cmd"
    
    if [ "$VERBOSE" = true ]; then
        if ! eval "$cmd"; then
            log_error "$desc failed"
            exit 1
        fi
    else
        if ! eval "$cmd" >/dev/null 2>&1; then
            log_error "$desc failed"
            exit 1
        fi
    fi
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --environment=*)
                ENVIRONMENT="${1#*=}"
                shift
                ;;
            --environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --frontend-only)
                FRONTEND_ONLY=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Show help
show_help() {
    echo "DMGT Basic Form Deployment Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --environment=ENV    Set deployment environment (default: dev)"
    echo "  --frontend-only      Deploy only frontend (skip infrastructure)"
    echo "  --verbose           Enable verbose output"
    echo "  --help, -h          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Full deployment (dev environment)"
    echo "  $0 --environment=prod                 # Full deployment (prod environment)"
    echo "  $0 --frontend-only                    # Frontend only deployment"
    echo "  $0 --frontend-only --verbose          # Frontend only with verbose output"
}

# Get stack outputs
get_stack_outputs() {
    local stack_name="dmgt-basic-form-${ENVIRONMENT}"
    
    log_info "Retrieving stack outputs for environment: $ENVIRONMENT"
    
    CONFIG_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name $stack_name \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='ConfigBucketName'].OutputValue" \
        --output text 2>/dev/null || echo "")

    WEBSITE_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name $stack_name \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='WebsiteBucketName'].OutputValue" \
        --output text 2>/dev/null || echo "")

    API_URL=$(aws cloudformation describe-stacks \
        --stack-name $stack_name \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='ApiGatewayUrl'].OutputValue" \
        --output text 2>/dev/null || echo "")

    CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
        --stack-name $stack_name \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='WebsiteURL'].OutputValue" \
        --output text 2>/dev/null || echo "")

    DISTRIBUTION_ID=$(aws cloudformation describe-stack-resources \
        --stack-name $stack_name \
        --region $REGION \
        --query "StackResources[?ResourceType=='AWS::CloudFront::Distribution'].PhysicalResourceId" \
        --output text 2>/dev/null || echo "")

    if [ -z "$WEBSITE_BUCKET" ] || [ "$WEBSITE_BUCKET" = "None" ]; then
        log_error "Could not retrieve stack outputs. Stack may not exist or you may need to deploy infrastructure first."
        log_info "Try running without --frontend-only to deploy the full infrastructure."
        exit 1
    fi

    log_success "Stack outputs retrieved:"
    log_info "   API URL: $API_URL"
    log_info "   Website Bucket: $WEBSITE_BUCKET"
    log_info "   CloudFront URL: $CLOUDFRONT_URL"
    log_debug "   Distribution ID: $DISTRIBUTION_ID"
}

# Create environment file
create_environment_file() {
    log_info "Creating environment configuration..."
    
    cat > "$FRONTEND_DIR/.env.production" << EOF
# Generated by deployment script on $(date)
REACT_APP_API_URL=$API_URL
GENERATE_SOURCEMAP=false
PUBLIC_URL=
EOF

    log_success "Environment file created"
}

# Build frontend
build_frontend() {
    log_step "Building React Application"
    
    cd "$FRONTEND_DIR"
    local frontend_start_time=$(date +%s)
    
    # Check Node.js version
    local node_version=$(node --version | cut -d'v' -f2)
    log_debug "Node.js version: $node_version"
    
    # Install dependencies
    log_info "Installing npm dependencies..."
    execute_command "npm ci --silent" "NPM dependencies installation"
    
    # Create environment configuration
    create_environment_file
    
    # Build the application
    log_info "Building React application for production..."
    execute_command "npm run build" "React application build"
    
    # Verify build output
    if [ ! -d "build" ]; then
        log_error "Build directory not created"
        exit 1
    fi
    
    local build_size=$(du -sh build | cut -f1)
    log_success "React build completed (Size: $build_size)"
    
    cd "$SCRIPT_DIR"
    
    local frontend_end_time=$(date +%s)
    local frontend_duration=$((frontend_end_time - frontend_start_time))
    log_success "Frontend build completed in ${frontend_duration}s"
}

# Deploy to S3
deploy_to_s3() {
    log_step "Deploying to S3"
    
    log_info "Syncing files to S3 bucket: $WEBSITE_BUCKET"
    
    # Deploy with proper content types
    if [ "$VERBOSE" = true ]; then
        aws s3 sync "$FRONTEND_DIR/build/" "s3://$WEBSITE_BUCKET" --delete --region $REGION
    else
        aws s3 sync "$FRONTEND_DIR/build/" "s3://$WEBSITE_BUCKET" --delete --region $REGION --quiet
    fi
    
    log_success "Files deployed to S3"
}

# Invalidate CloudFront
invalidate_cloudfront() {
    log_step "Invalidating CloudFront Cache"
    
    if [ ! -z "$DISTRIBUTION_ID" ] && [ "$DISTRIBUTION_ID" != "None" ]; then
        log_info "Creating CloudFront invalidation..."
        
        local invalidation_id=$(aws cloudfront create-invalidation \
            --distribution-id $DISTRIBUTION_ID \
            --paths "/*" \
            --query 'Invalidation.Id' \
            --output text)
        
        log_success "CloudFront cache invalidation created: $invalidation_id"
        log_info "Cache invalidation may take 5-15 minutes to complete"
    else
        log_warning "CloudFront distribution ID not found, skipping invalidation"
    fi
}

# Deploy infrastructure
deploy_infrastructure() {
    log_step "Deploying Infrastructure"
    
    local stack_name="dmgt-basic-form-${ENVIRONMENT}"
    local template_file="$INFRASTRUCTURE_DIR/cloudformation-template.yaml"
    
    if [ ! -f "$template_file" ]; then
        log_error "CloudFormation template not found: $template_file"
        exit 1
    fi
    
    log_info "Deploying CloudFormation stack: $stack_name"
    
    # Check if stack exists
    if aws cloudformation describe-stacks --stack-name $stack_name --region $REGION >/dev/null 2>&1; then
        log_info "Updating existing stack..."
        execute_command "aws cloudformation update-stack \
            --stack-name $stack_name \
            --template-body file://$template_file \
            --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
            --capabilities CAPABILITY_IAM \
            --region $REGION" "CloudFormation stack update"
    else
        log_info "Creating new stack..."
        execute_command "aws cloudformation create-stack \
            --stack-name $stack_name \
            --template-body file://$template_file \
            --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
            --capabilities CAPABILITY_IAM \
            --region $REGION" "CloudFormation stack creation"
    fi
    
    log_info "Waiting for stack deployment to complete..."
    execute_command "aws cloudformation wait stack-update-complete --stack-name $stack_name --region $REGION || aws cloudformation wait stack-create-complete --stack-name $stack_name --region $REGION" "CloudFormation stack deployment"
    
    log_success "Infrastructure deployment completed"
}

# Main deployment function
main() {
    local start_time=$(date +%s)
    
    echo "🚀 DMGT Basic Form Deployment Script"
    echo "===================================="
    echo ""
    
    log_info "Configuration:"
    log_info "  Environment: $ENVIRONMENT"
    log_info "  Region: $REGION"
    log_info "  Frontend Only: $FRONTEND_ONLY"
    log_info "  Verbose: $VERBOSE"
    echo ""
    
    # Verify AWS CLI is configured
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log_error "AWS CLI not configured or credentials invalid"
        exit 1
    fi
    
    # Deploy infrastructure if not frontend-only
    if [ "$FRONTEND_ONLY" = false ]; then
        deploy_infrastructure
    fi
    
    # Get stack outputs
    get_stack_outputs
    
    # Build and deploy frontend
    build_frontend
    deploy_to_s3
    invalidate_cloudfront
    
    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))
    
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo "=================================="
    log_success "Total deployment time: ${total_duration}s"
    echo ""
    log_success "🌐 Your application: $CLOUDFRONT_URL"
    log_success "🧪 Test API endpoint: $API_URL/config/Company"
    echo ""
    
    if [ "$FRONTEND_ONLY" = true ]; then
        log_info "💡 Frontend-only deployment completed. Infrastructure was not modified."
    fi
}

# Parse arguments and run main function
parse_arguments "$@"
main
