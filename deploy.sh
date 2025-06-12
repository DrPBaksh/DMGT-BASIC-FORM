#!/bin/bash

# DMGT Basic Form - Enhanced Deployment Script
# This script deploys the complete infrastructure and application with comprehensive logging

set -e

# Script configuration
SCRIPT_NAME="DMGT Deploy"
SCRIPT_VERSION="2.0"
START_TIME=$(date +%s)

# Color codes for better visibility
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[0;37m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration with defaults
ENVIRONMENT=${ENVIRONMENT:-prod}
STACK_NAME="dmgt-basic-form-${ENVIRONMENT}"
REGION=${AWS_REGION:-us-east-1}
BUCKET_PREFIX="dmgt-basic-form"
VERBOSE=${VERBOSE:-false}
DRY_RUN=${DRY_RUN:-false}

# Global variables for tracking
STEP_COUNT=0
TOTAL_STEPS=8
ERRORS=()

# Logging functions
log_info() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${CYAN}[INFO]${NC} ${timestamp} - $1"
}

log_success() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${GREEN}[SUCCESS]${NC} ${timestamp} - $1"
}

log_warning() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${YELLOW}[WARNING]${NC} ${timestamp} - $1"
}

log_error() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${RED}[ERROR]${NC} ${timestamp} - $1"
    ERRORS+=("$1")
}

log_debug() {
    if [ "$VERBOSE" = "true" ]; then
        local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        echo -e "${PURPLE}[DEBUG]${NC} ${timestamp} - $1"
    fi
}

log_step() {
    STEP_COUNT=$((STEP_COUNT + 1))
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "\n${BOLD}${BLUE}[STEP $STEP_COUNT/$TOTAL_STEPS]${NC} ${timestamp} - $1"
    echo -e "${BLUE}${'='*80}${NC}"
}

# Progress bar function
show_progress() {
    local current=$1
    local total=$2
    local width=50
    local percentage=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))
    
    printf "\r${CYAN}Progress: [${GREEN}"
    printf "%${filled}s" | tr ' ' '='
    printf "${NC}${WHITE}"
    printf "%${empty}s" | tr ' ' '-'
    printf "${NC}${CYAN}] %d%% (%d/%d)${NC}" $percentage $current $total
}

# Function to execute commands with logging
execute_command() {
    local cmd="$1"
    local description="$2"
    local step_timer_start=$(date +%s)
    
    log_info "Executing: $description"
    log_debug "Command: $cmd"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_warning "DRY RUN: Would execute: $cmd"
        return 0
    fi
    
    if [ "$VERBOSE" = "true" ]; then
        eval $cmd
        local result=$?
    else
        eval $cmd > /tmp/deploy_output.log 2>&1
        local result=$?
        if [ $result -ne 0 ]; then
            log_error "Command failed. Output:"
            cat /tmp/deploy_output.log
        fi
    fi
    
    local step_timer_end=$(date +%s)
    local step_duration=$((step_timer_end - step_timer_start))
    
    if [ $result -eq 0 ]; then
        log_success "$description completed in ${step_duration}s"
    else
        log_error "$description failed after ${step_duration}s (exit code: $result)"
        return $result
    fi
}

# Enhanced AWS CLI check
check_aws_cli() {
    log_step "Checking AWS CLI Prerequisites"
    
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install it first."
        log_info "Install AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
        exit 1
    fi
    log_success "AWS CLI found: $(aws --version)"
    
    # Check AWS credentials
    log_info "Checking AWS credentials..."
    if ! aws sts get-caller-identity > /dev/null 2>&1; then
        log_error "AWS credentials not configured or invalid"
        log_info "Configure AWS CLI: aws configure"
        exit 1
    fi
    
    local caller_identity=$(aws sts get-caller-identity --output json)
    local account_id=$(echo $caller_identity | jq -r '.Account')
    local user_arn=$(echo $caller_identity | jq -r '.Arn')
    
    log_success "AWS credentials valid"
    log_debug "Account ID: $account_id"
    log_debug "User ARN: $user_arn"
    
    # Verify region
    log_info "Checking AWS region configuration..."
    if [ -z "$REGION" ]; then
        REGION=$(aws configure get region)
        if [ -z "$REGION" ]; then
            log_warning "No region set, defaulting to us-east-1"
            REGION="us-east-1"
        fi
    fi
    log_success "Using AWS region: $REGION"
    
    # Test region connectivity
    log_info "Testing connectivity to region $REGION..."
    if ! aws ec2 describe-regions --region $REGION > /dev/null 2>&1; then
        log_error "Cannot connect to region $REGION"
        exit 1
    fi
    log_success "Region connectivity verified"
}

# Enhanced Node.js check
check_nodejs() {
    log_step "Checking Node.js Prerequisites"
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install it first."
        log_info "Install Node.js: https://nodejs.org/"
        exit 1
    fi
    
    local node_version=$(node --version)
    log_success "Node.js found: $node_version"
    
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    local npm_version=$(npm --version)
    log_success "npm found: $npm_version"
    
    # Check if package.json exists
    if [ ! -f "frontend/package.json" ]; then
        log_error "frontend/package.json not found"
        exit 1
    fi
    log_success "Frontend package.json found"
}

# Pre-deployment checks
pre_deployment_checks() {
    log_step "Running Pre-deployment Checks"
    
    # Check if CloudFormation template exists
    if [ ! -f "infrastructure/cloudformation-template.yaml" ]; then
        log_error "CloudFormation template not found: infrastructure/cloudformation-template.yaml"
        exit 1
    fi
    log_success "CloudFormation template found"
    
    # Check if CSV files exist
    if [ ! -f "data/CompanyQuestions.csv" ]; then
        log_error "Company questions CSV not found: data/CompanyQuestions.csv"
        exit 1
    fi
    log_success "Company questions CSV found"
    
    if [ ! -f "data/EmployeeQuestions.csv" ]; then
        log_error "Employee questions CSV not found: data/EmployeeQuestions.csv"
        exit 1
    fi
    log_success "Employee questions CSV found"
    
    # Check for existing stack
    log_info "Checking for existing CloudFormation stack..."
    if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION > /dev/null 2>&1; then
        local stack_status=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].StackStatus' --output text)
        log_warning "Existing stack found: $STACK_NAME (Status: $stack_status)"
        
        if [[ "$stack_status" == "ROLLBACK_COMPLETE" || "$stack_status" == "CREATE_FAILED" || "$stack_status" == "DELETE_FAILED" ]]; then
            log_error "Stack is in a failed state: $stack_status"
            log_info "Please delete the failed stack first: aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION"
            exit 1
        fi
    else
        log_success "No existing stack found - ready for deployment"
    fi
}

# Enhanced CloudFormation deployment
deploy_infrastructure() {
    log_step "Deploying CloudFormation Infrastructure"
    
    local cf_start_time=$(date +%s)
    
    log_info "Stack Name: $STACK_NAME"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $REGION"
    
    # Validate template first
    log_info "Validating CloudFormation template..."
    execute_command "aws cloudformation validate-template --template-body file://infrastructure/cloudformation-template.yaml --region $REGION" "Template validation"
    
    # Create changeset for review
    log_info "Creating changeset for review..."
    local changeset_name="changeset-$(date +%s)"
    execute_command "aws cloudformation create-change-set --stack-name $STACK_NAME --template-body file://infrastructure/cloudformation-template.yaml --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT --capabilities CAPABILITY_NAMED_IAM --change-set-name $changeset_name --region $REGION" "Changeset creation"
    
    # Wait for changeset
    log_info "Waiting for changeset to be created..."
    aws cloudformation wait change-set-create-complete --stack-name $STACK_NAME --change-set-name $changeset_name --region $REGION
    
    # Show changeset (if verbose)
    if [ "$VERBOSE" = "true" ]; then
        log_debug "Changeset details:"
        aws cloudformation describe-change-set --stack-name $STACK_NAME --change-set-name $changeset_name --region $REGION
    fi
    
    # Execute changeset
    log_info "Executing changeset..."
    execute_command "aws cloudformation execute-change-set --stack-name $STACK_NAME --change-set-name $changeset_name --region $REGION" "Changeset execution"
    
    # Wait for stack completion with progress
    log_info "Waiting for stack deployment to complete..."
    local wait_start=$(date +%s)
    
    while true; do
        local stack_status=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
        local wait_current=$(date +%s)
        local wait_duration=$((wait_current - wait_start))
        
        printf "\r${CYAN}⏳ Waiting for stack deployment... %ds (Status: %s)${NC}" $wait_duration "$stack_status"
        
        case $stack_status in
            "CREATE_COMPLETE"|"UPDATE_COMPLETE")
                echo ""
                log_success "Stack deployment completed successfully"
                break
                ;;
            "CREATE_FAILED"|"UPDATE_FAILED"|"ROLLBACK_COMPLETE"|"UPDATE_ROLLBACK_COMPLETE")
                echo ""
                log_error "Stack deployment failed with status: $stack_status"
                log_info "Checking stack events for error details..."
                aws cloudformation describe-stack-events --stack-name $STACK_NAME --region $REGION --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`].{Time:Timestamp,Resource:LogicalResourceId,Status:ResourceStatus,Reason:ResourceStatusReason}' --output table
                exit 1
                ;;
        esac
        
        sleep 10
    done
    
    local cf_end_time=$(date +%s)
    local cf_duration=$((cf_end_time - cf_start_time))
    log_success "Infrastructure deployment completed in ${cf_duration}s"
}

# Enhanced stack outputs retrieval
get_stack_outputs() {
    log_step "Retrieving Stack Outputs"
    
    log_info "Fetching CloudFormation stack outputs..."
    
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
    
    # Validate outputs
    if [ -z "$CONFIG_BUCKET" ] || [ "$CONFIG_BUCKET" = "None" ]; then
        log_error "Failed to retrieve Config Bucket name"
        exit 1
    fi
    
    if [ -z "$WEBSITE_BUCKET" ] || [ "$WEBSITE_BUCKET" = "None" ]; then
        log_error "Failed to retrieve Website Bucket name"
        exit 1
    fi
    
    if [ -z "$API_URL" ] || [ "$API_URL" = "None" ]; then
        log_error "Failed to retrieve API Gateway URL"
        exit 1
    fi
    
    if [ -z "$CLOUDFRONT_URL" ] || [ "$CLOUDFRONT_URL" = "None" ]; then
        log_error "Failed to retrieve CloudFront URL"
        exit 1
    fi
    
    log_success "All stack outputs retrieved successfully"
    log_info "Config Bucket: $CONFIG_BUCKET"
    log_info "Website Bucket: $WEBSITE_BUCKET"
    log_info "API URL: $API_URL"
    log_info "CloudFront URL: $CLOUDFRONT_URL"
}

# Enhanced CSV upload
upload_config_files() {
    log_step "Uploading Configuration Files"
    
    log_info "Uploading CSV configuration files to S3..."
    
    # Upload Company questions
    log_info "Uploading CompanyQuestions.csv..."
    execute_command "aws s3 cp data/CompanyQuestions.csv s3://$CONFIG_BUCKET/CompanyQuestions.csv --region $REGION" "Company questions upload"
    
    # Upload Employee questions
    log_info "Uploading EmployeeQuestions.csv..."
    execute_command "aws s3 cp data/EmployeeQuestions.csv s3://$CONFIG_BUCKET/EmployeeQuestions.csv --region $REGION" "Employee questions upload"
    
    # Verify uploads
    log_info "Verifying uploaded files..."
    local company_size=$(aws s3api head-object --bucket $CONFIG_BUCKET --key CompanyQuestions.csv --region $REGION --query ContentLength --output text)
    local employee_size=$(aws s3api head-object --bucket $CONFIG_BUCKET --key EmployeeQuestions.csv --region $REGION --query ContentLength --output text)
    
    log_success "CompanyQuestions.csv uploaded (${company_size} bytes)"
    log_success "EmployeeQuestions.csv uploaded (${employee_size} bytes)"
}

# Enhanced frontend deployment
deploy_frontend() {
    log_step "Building and Deploying React Application"
    
    cd frontend
    local frontend_start_time=$(date +%s)
    
    # Check Node.js version compatibility
    log_info "Checking Node.js version compatibility..."
    local node_version=$(node --version | cut -d'v' -f2)
    log_debug "Node.js version: $node_version"
    
    # Install dependencies
    log_info "Installing npm dependencies..."
    execute_command "npm ci --silent" "NPM dependencies installation"
    
    # Create environment configuration
    log_info "Creating production environment configuration..."
    cat > .env.production << EOF
REACT_APP_API_URL=$API_URL
GENERATE_SOURCEMAP=false
EOF
    log_success "Environment configuration created"
    log_debug "API URL configured: $API_URL"
    
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
    
    # Upload to S3 with progress
    log_info "Uploading React app to S3..."
    execute_command "aws s3 sync build/ s3://$WEBSITE_BUCKET --delete --region $REGION" "React app S3 upload"
    
    # Get CloudFront distribution ID
    log_info "Getting CloudFront distribution ID..."
    local distribution_id=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomainName'].OutputValue" \
        --output text | cut -d'.' -f1)
    
    if [ ! -z "$distribution_id" ] && [ "$distribution_id" != "None" ]; then
        log_info "Invalidating CloudFront cache..."
        local invalidation_id=$(aws cloudfront create-invalidation \
            --distribution-id $distribution_id \
            --paths "/*" \
            --query 'Invalidation.Id' \
            --output text)
        
        if [ $? -eq 0 ]; then
            log_success "CloudFront invalidation created: $invalidation_id"
        else
            log_warning "CloudFront invalidation failed (non-critical)"
        fi
    else
        log_warning "Could not determine CloudFront distribution ID"
    fi
    
    cd ..
    
    local frontend_end_time=$(date +%s)
    local frontend_duration=$((frontend_end_time - frontend_start_time))
    log_success "Frontend deployment completed in ${frontend_duration}s"
}

# Enhanced deployment testing
test_deployment() {
    log_step "Testing Deployment"
    
    local test_start_time=$(date +%s)
    
    # Test API endpoint
    log_info "Testing API Gateway endpoint..."
    local api_test_url="$API_URL/config/Company"
    log_debug "Testing URL: $api_test_url"
    
    local api_response=$(curl -s -w "%{http_code}" -o /tmp/api_test.json "$api_test_url")
    if [ "$api_response" = "200" ]; then
        log_success "API endpoint is responding correctly"
        if [ "$VERBOSE" = "true" ]; then
            log_debug "API Response: $(cat /tmp/api_test.json | head -c 200)..."
        fi
    else
        log_warning "API endpoint returned HTTP $api_response"
    fi
    
    # Test website
    log_info "Testing CloudFront website..."
    log_debug "Testing URL: $CLOUDFRONT_URL"
    
    local website_response=$(curl -s -w "%{http_code}" -o /dev/null "$CLOUDFRONT_URL")
    if [ "$website_response" = "200" ]; then
        log_success "Website is accessible"
    else
        log_warning "Website returned HTTP $website_response"
    fi
    
    # Test S3 bucket access
    log_info "Testing S3 bucket access..."
    local bucket_test=$(aws s3 ls s3://$CONFIG_BUCKET --region $REGION 2>/dev/null | wc -l)
    if [ $bucket_test -gt 0 ]; then
        log_success "S3 configuration bucket accessible ($bucket_test files)"
    else
        log_warning "S3 configuration bucket may be empty or inaccessible"
    fi
    
    local test_end_time=$(date +%s)
    local test_duration=$((test_end_time - test_start_time))
    log_success "Deployment testing completed in ${test_duration}s"
}

# Deployment summary
deployment_summary() {
    log_step "Deployment Summary"
    
    local end_time=$(date +%s)
    local total_duration=$((end_time - START_TIME))
    local minutes=$((total_duration / 60))
    local seconds=$((total_duration % 60))
    
    echo -e "\n${BOLD}${GREEN}🎉 DEPLOYMENT COMPLETED SUCCESSFULLY! 🎉${NC}\n"
    
    echo -e "${BOLD}📋 Deployment Summary:${NC}"
    echo -e "Environment: ${CYAN}$ENVIRONMENT${NC}"
    echo -e "Stack Name: ${CYAN}$STACK_NAME${NC}"
    echo -e "Region: ${CYAN}$REGION${NC}"
    echo -e "Duration: ${CYAN}${minutes}m ${seconds}s${NC}"
    echo ""
    
    echo -e "${BOLD}🌐 Access URLs:${NC}"
    echo -e "Website: ${GREEN}$CLOUDFRONT_URL${NC}"
    echo -e "API: ${GREEN}$API_URL${NC}"
    echo ""
    
    echo -e "${BOLD}📚 Resources Created:${NC}"
    echo -e "• CloudFormation Stack: ${CYAN}$STACK_NAME${NC}"
    echo -e "• S3 Config Bucket: ${CYAN}$CONFIG_BUCKET${NC}"
    echo -e "• S3 Website Bucket: ${CYAN}$WEBSITE_BUCKET${NC}"
    echo -e "• API Gateway: ${CYAN}$(echo $API_URL | cut -d'/' -f3)${NC}"
    echo -e "• CloudFront Distribution: ${CYAN}$(echo $CLOUDFRONT_URL | cut -d'/' -f3)${NC}"
    echo ""
    
    echo -e "${BOLD}📝 Next Steps:${NC}"
    echo -e "1. ${WHITE}Access your application at: ${GREEN}$CLOUDFRONT_URL${NC}"
    echo -e "2. ${WHITE}Share Company IDs with your clients${NC}"
    echo -e "3. ${WHITE}Monitor CloudWatch logs: ${CYAN}aws logs describe-log-groups --region $REGION${NC}"
    echo -e "4. ${WHITE}Edit questions: Update CSV files in S3 bucket ${CYAN}$CONFIG_BUCKET${NC}"
    echo ""
    
    if [ ${#ERRORS[@]} -gt 0 ]; then
        echo -e "${BOLD}${YELLOW}⚠️  Warnings/Errors During Deployment:${NC}"
        for error in "${ERRORS[@]}"; do
            echo -e "  • ${YELLOW}$error${NC}"
        done
        echo ""
    fi
    
    echo -e "${BOLD}🏷️  All resources tagged with: ${CYAN}Project=dmgt-basic-form${NC}"
    echo ""
}

# Error handler
handle_error() {
    local exit_code=$?
    local line_number=$1
    
    log_error "Script failed at line $line_number with exit code $exit_code"
    
    if [ ${#ERRORS[@]} -gt 0 ]; then
        echo -e "\n${BOLD}${RED}❌ DEPLOYMENT FAILED${NC}\n"
        echo -e "${BOLD}Errors encountered:${NC}"
        for error in "${ERRORS[@]}"; do
            echo -e "  • ${RED}$error${NC}"
        done
    fi
    
    echo -e "\n${BOLD}🔧 Troubleshooting:${NC}"
    echo -e "1. Check AWS credentials: ${CYAN}aws sts get-caller-identity${NC}"
    echo -e "2. Check region: ${CYAN}aws configure get region${NC}"
    echo -e "3. View stack events: ${CYAN}aws cloudformation describe-stack-events --stack-name $STACK_NAME --region $REGION${NC}"
    echo -e "4. Run with verbose mode: ${CYAN}VERBOSE=true ./deploy.sh${NC}"
    echo ""
    
    exit $exit_code
}

# Usage function
show_usage() {
    echo -e "${BOLD}DMGT Basic Form Deployment Script v$SCRIPT_VERSION${NC}"
    echo ""
    echo -e "${BOLD}Usage:${NC}"
    echo -e "  ./deploy.sh [OPTIONS]"
    echo ""
    echo -e "${BOLD}Environment Variables:${NC}"
    echo -e "  ENVIRONMENT    Deployment environment (default: prod)"
    echo -e "  AWS_REGION     AWS region (default: us-east-1)"
    echo -e "  VERBOSE        Enable verbose logging (default: false)"
    echo -e "  DRY_RUN        Show commands without executing (default: false)"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo -e "  ${CYAN}./deploy.sh${NC}                    # Standard deployment"
    echo -e "  ${CYAN}VERBOSE=true ./deploy.sh${NC}       # Verbose logging"
    echo -e "  ${CYAN}DRY_RUN=true ./deploy.sh${NC}       # Preview commands"
    echo -e "  ${CYAN}ENVIRONMENT=dev ./deploy.sh${NC}    # Deploy to dev environment"
    echo ""
}

# Main execution function
main() {
    # Set up error handling
    trap 'handle_error $LINENO' ERR
    
    # Handle command line arguments
    if [[ "$1" == "-h" || "$1" == "--help" ]]; then
        show_usage
        exit 0
    fi
    
    # Script header
    echo -e "${BOLD}${BLUE}"
    echo "========================================================================"
    echo "  $SCRIPT_NAME v$SCRIPT_VERSION - Enhanced Deployment Script"
    echo "========================================================================"
    echo -e "${NC}"
    
    log_info "Starting deployment of DMGT Basic Form"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $REGION"
    log_info "Stack Name: $STACK_NAME"
    log_info "Verbose Mode: $VERBOSE"
    log_info "Dry Run: $DRY_RUN"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_warning "DRY RUN MODE - No actual changes will be made"
    fi
    
    # Execute deployment steps
    check_aws_cli
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    check_nodejs
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    pre_deployment_checks
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    deploy_infrastructure
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    get_stack_outputs
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    upload_config_files
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    deploy_frontend
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    test_deployment
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    echo "" # Clear progress line
    deployment_summary
}

# Run main function with all arguments
main "$@"