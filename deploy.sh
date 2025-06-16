#!/usr/bin/env bash
set -euo pipefail # -e: exit on error, -u: unset variables are errors, -o pipefail: pipe failures

#####################################
# DMGT Basic Form - Enhanced Deployment Script
# Deploys/destroys infrastructure and frontend for Data & AI Readiness Assessment
#####################################

# Compute paths relative to this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
INFRASTRUCTURE_DIR="$SCRIPT_DIR/infrastructure"
DATA_DIR="$SCRIPT_DIR/data"
ENV_FILE="$FRONTEND_DIR/.env.production"

# Configuration with defaults
MODE="deploy"
ENVIRONMENT=${ENVIRONMENT:-prod}
REGION=${AWS_REGION:-eu-west-2}
OWNER_NAME=${OWNER_NAME:-$(whoami)}
VERBOSE=${VERBOSE:-false}
DRY_RUN=${DRY_RUN:-false}
FORCE_DELETE=${FORCE_DELETE:-false}
APPLY_SUNDAY_FIXES=${APPLY_SUNDAY_FIXES:-false}

# Stack and resource naming
STACK_NAME="dmgt-basic-form-${ENVIRONMENT}"
BUCKET_PREFIX="dmgt-basic-form"

# Output tracking
OUTPUTS_FILE="/tmp/dmgt-stack-outputs-${ENVIRONMENT}.json"
START_TIME=$(date +%s)

# Global tracking variables
STEP_COUNT=0
TOTAL_STEPS=8
ERRORS=()
WARNINGS=()

#####################################
# Color codes and formatting
#####################################
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[0;37m'
BOLD='\033[1m'
NC='\033[0m' # No Color

#####################################
# Logging Functions
#####################################
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
    WARNINGS+=("$1")
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
    separator_line
}

separator_line() {
    printf "${BLUE}"
    printf '=%.0s' {1..80}
    printf "${NC}\n"
}

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

#####################################
# Command Execution with Logging
#####################################
execute_command() {
    local cmd="$1"
    local description="$2"
    local allow_failure="${3:-false}"
    local step_timer_start=$(date +%s)
    
    log_info "Executing: $description"
    log_debug "Command: $cmd"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_warning "DRY RUN: Would execute: $cmd"
        return 0
    fi
    
    local result=0
    if [ "$VERBOSE" = "true" ]; then
        eval $cmd || result=$?
    else
        eval $cmd > /tmp/dmgt_deploy_output.log 2>&1 || result=$?
        if [ $result -ne 0 ] && [ "$allow_failure" != "true" ]; then
            log_error "Command failed. Output:"
            cat /tmp/dmgt_deploy_output.log
        fi
    fi
    
    local step_timer_end=$(date +%s)
    local step_duration=$((step_timer_end - step_timer_start))
    
    if [ $result -eq 0 ]; then
        log_success "$description completed in ${step_duration}s"
    elif [ "$allow_failure" = "true" ]; then
        log_warning "$description failed after ${step_duration}s (exit code: $result) - continuing anyway"
    else
        log_error "$description failed after ${step_duration}s (exit code: $result)"
        return $result
    fi
}

#####################################
# Argument Parsing
#####################################
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --delete|--destroy)
                MODE="delete"
                shift
                ;;
            --frontend-only)
                MODE="frontend-only"
                shift
                ;;
            --apply-sunday-fixes)
                APPLY_SUNDAY_FIXES=true
                MODE="sunday-fixes"
                shift
                ;;
            --environment=*)
                ENVIRONMENT="${1#*=}"
                STACK_NAME="dmgt-basic-form-${ENVIRONMENT}"
                shift
                ;;
            --region=*)
                REGION="${1#*=}"
                shift
                ;;
            --owner=*)
                OWNER_NAME="${1#*=}"
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --force)
                FORCE_DELETE=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown argument: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

show_usage() {
    echo -e "${BOLD}DMGT Basic Form Deployment Script${NC}"
    echo ""
    echo -e "${BOLD}Usage:${NC}"
    echo -e "  $0 [OPTIONS]"
    echo ""
    echo -e "${BOLD}Options:${NC}"
    echo -e "  --delete              : Destroys all infrastructure"
    echo -e "  --frontend-only       : Builds and deploys only the React frontend"
    echo -e "  --apply-sunday-fixes  : Apply critical Sunday fixes (Lambda config + code)"
    echo -e "  --environment=ENV     : Set environment (default: prod)"
    echo -e "  --region=REGION       : Set AWS region (default: eu-west-2)"
    echo -e "  --owner=NAME          : Set owner name (default: current username)"
    echo -e "  --verbose             : Enable verbose logging"
    echo -e "  --dry-run             : Show commands without executing"
    echo -e "  --force               : Skip confirmation prompts"
    echo -e "  --help                : Show this help message"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo -e "  ${CYAN}$0${NC}                                    # Deploy to prod"
    echo -e "  ${CYAN}$0 --environment=dev --verbose${NC}        # Deploy to dev with verbose logging"
    echo -e "  ${CYAN}$0 --frontend-only${NC}                   # Deploy frontend only"
    echo -e "  ${CYAN}$0 --apply-sunday-fixes --environment=dev${NC}  # Apply critical fixes to dev"
    echo -e "  ${CYAN}$0 --delete --environment=dev${NC}        # Delete dev environment"
    echo ""
}

#####################################
# NPM Fix Functions
#####################################
fix_npm_issues() {
    log_info "🔧 Attempting to fix npm issues..."
    
    cd "$FRONTEND_DIR"
    
    # Step 1: Clean npm cache
    log_info "Cleaning npm cache..."
    npm cache clean --force || true
    
    # Step 2: Remove node_modules and package-lock.json
    log_info "Removing node_modules and package-lock.json..."
    rm -rf node_modules
    rm -f package-lock.json
    
    # Step 3: Fresh install
    log_info "Performing fresh npm install..."
    if npm install; then
        log_success "✅ npm install succeeded"
        cd "$SCRIPT_DIR"
        return 0
    else
        log_warning "npm install failed, trying alternative approaches..."
        
        # Step 4: Try with legacy peer deps
        log_info "Trying with --legacy-peer-deps..."
        if npm install --legacy-peer-deps; then
            log_success "✅ npm install with --legacy-peer-deps succeeded"
            cd "$SCRIPT_DIR"
            return 0
        else
            log_error "❌ All npm install attempts failed"
            cd "$SCRIPT_DIR"
            return 1
        fi
    fi
}

#####################################
# Validation Functions
#####################################
check_prerequisites() {
    log_step "Checking Prerequisites"
    
    # Check AWS CLI
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
    
    local caller_identity=$(aws sts get-caller-identity --output json 2>/dev/null)
    local account_id=$(echo $caller_identity | jq -r '.Account // "N/A"')
    local user_arn=$(echo $caller_identity | jq -r '.Arn // "N/A"')
    
    log_success "AWS credentials valid"
    log_debug "Account ID: $account_id"
    log_debug "User ARN: $user_arn"
    
    # Verify region
    log_info "Verifying AWS region: $REGION"
    if ! aws ec2 describe-regions --region $REGION > /dev/null 2>&1; then
        log_error "Cannot connect to region $REGION"
        exit 1
    fi
    log_success "Region connectivity verified"
    
    # Check Node.js for frontend
    if [[ "$MODE" != "delete" ]] && [[ "$MODE" != "sunday-fixes" ]]; then
        if ! command -v node &> /dev/null; then
            log_error "Node.js is not installed. Please install it first."
            log_info "Install Node.js: https://nodejs.org/"
            exit 1
        fi
        log_success "Node.js found: $(node --version)"
        
        if ! command -v npm &> /dev/null; then
            log_error "npm is not installed"
            exit 1
        fi
        log_success "npm found: $(npm --version)"
    fi
    
    # Check required files
    if [[ "$MODE" != "delete" ]] && [[ "$MODE" != "sunday-fixes" ]]; then
        local required_files=(
            "$INFRASTRUCTURE_DIR/cloudformation-template.yaml"
            "$DATA_DIR/CompanyQuestions.csv"
            "$DATA_DIR/EmployeeQuestions.csv"
            "$FRONTEND_DIR/package.json"
        )
        
        for file in "${required_files[@]}"; do
            if [ ! -f "$file" ]; then
                log_error "Required file not found: $file"
                exit 1
            fi
        done
        log_success "All required files found"
    fi
}

pre_deployment_checks() {
    log_step "Running Pre-deployment Checks"
    
    # Check for existing stack
    log_info "Checking for existing CloudFormation stack..."
    if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION > /dev/null 2>&1; then
        local stack_status=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].StackStatus' --output text)
        log_warning "Existing stack found: $STACK_NAME (Status: $stack_status)"
        
        if [[ "$stack_status" == "ROLLBACK_COMPLETE" || "$stack_status" == "CREATE_FAILED" || "$stack_status" == "DELETE_FAILED" ]]; then
            log_error "Stack is in a failed state: $stack_status"
            log_info "Please delete the failed stack first or use --delete flag"
            exit 1
        fi
        
        STACK_EXISTS=true
    else
        log_success "No existing stack found - ready for deployment"
        STACK_EXISTS=false
    fi
}

#####################################
# Sunday Fixes Functions
#####################################
apply_sunday_fixes() {
    log_step "Applying Sunday Afternoon Critical Fixes"
    
    local function_name="dmgt-basic-form-responses-${ENVIRONMENT}"
    
    log_info "Target Lambda function: $function_name"
    log_info "Region: $REGION"
    
    # Check if the Lambda function exists
    if ! aws lambda get-function --function-name $function_name --region $REGION > /dev/null 2>&1; then
        log_error "Lambda function '$function_name' not found. Please deploy the stack first."
        exit 1
    fi
    
    # Get current account ID for bucket names
    local account_id=$(aws sts get-caller-identity --query Account --output text)
    local responses_bucket="dmgt-basic-form-responses-${ENVIRONMENT}-${account_id}"
    local config_bucket="dmgt-basic-form-config-${ENVIRONMENT}-${account_id}"
    
    log_info "Responses bucket: $responses_bucket"
    log_info "Config bucket: $config_bucket"
    
    # Step 1: Update Lambda function configuration
    log_info "⚙️ Updating Lambda function configuration..."
    
    # Create proper JSON for environment variables
    local env_vars=$(cat <<EOF
{
  "Variables": {
    "RESPONSES_BUCKET": "$responses_bucket",
    "CONFIG_BUCKET": "$config_bucket",
    "VERSION": "5.0-s3-upload-support"
  }
}
EOF
)
    
    execute_command "aws lambda update-function-configuration \
        --function-name $function_name \
        --timeout 30 \
        --memory-size 256 \
        --environment '$env_vars' \
        --region $REGION" "Lambda configuration update"
    
    log_success "✅ Lambda configuration updated (timeout: 30s, memory: 256MB)"
    
    # Step 2: Update Lambda function code
    log_info "⚙️ Updating Lambda function code..."
    
    # Create temporary directory for deployment
    local temp_dir=$(mktemp -d)
    local original_dir=$(pwd)
    
    cd "$temp_dir"
    
    # Copy the updated Lambda function code
    if [ -f "$INFRASTRUCTURE_DIR/lambda/responses-function/index.py" ]; then
        cp "$INFRASTRUCTURE_DIR/lambda/responses-function/index.py" .
        
        # Create ZIP file
        zip -q function.zip index.py
        
        # Update function code
        execute_command "aws lambda update-function-code \
            --function-name $function_name \
            --zip-file fileb://function.zip \
            --region $REGION" "Lambda function code update"
        
        log_success "✅ Lambda function code updated with S3 upload support"
    else
        log_warning "Lambda function code not found at expected location, skipping code update"
    fi
    
    # Clean up
    cd "$original_dir"
    rm -rf "$temp_dir"
    
    # Step 3: Test the deployment
    log_info "🧪 Testing Lambda function..."
    
    # Test with OPTIONS request
    local test_payload='{"httpMethod":"OPTIONS"}'
    local test_response="/tmp/test-lambda-response.json"
    
    if execute_command "aws lambda invoke \
        --function-name $function_name \
        --payload '$test_payload' \
        --region $REGION \
        $test_response" "Lambda function test" "true"; then
        
        if [ -f "$test_response" ]; then
            local status_code=$(jq -r '.statusCode // "unknown"' "$test_response" 2>/dev/null || echo "unknown")
            if [ "$status_code" = "200" ]; then
                log_success "✅ Lambda function responding correctly (HTTP 200)"
            else
                log_warning "⚠️ Lambda function returned status: $status_code"
            fi
        fi
    else
        log_warning "⚠️ Lambda function test failed (this may be normal for complex functions)"
    fi
    
    # Clean up test file
    rm -f "$test_response"
    
    # Step 4: Get deployment URLs for reference
    log_info "📋 Retrieving deployment information..."
    
    local api_url=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='ApiGatewayUrl'].OutputValue" \
        --output text 2>/dev/null || echo "")
    
    local website_url=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='WebsiteURL'].OutputValue" \
        --output text 2>/dev/null || echo "")
    
    # Final verification
    log_info "🔍 Final verification..."
    local function_info=$(aws lambda get-function \
        --function-name $function_name \
        --region $REGION \
        --query 'Configuration.{Timeout:Timeout,Memory:MemorySize,LastModified:LastModified}' \
        --output json 2>/dev/null || echo "")
    
    if [ ! -z "$function_info" ]; then
        local timeout=$(echo "$function_info" | jq -r '.Timeout // "unknown"')
        local memory=$(echo "$function_info" | jq -r '.Memory // "unknown"')
        local modified=$(echo "$function_info" | jq -r '.LastModified // "unknown"')
        
        log_success "✅ Verification complete!"
        log_info "   Timeout: ${timeout}s"
        log_info "   Memory: ${memory}MB"
        log_info "   Last Modified: $modified"
    fi
    
    # Sunday fixes summary
    echo ""
    echo -e "${BOLD}${GREEN}🎉 SUNDAY FIXES APPLIED SUCCESSFULLY! 🎉${NC}\n"
    
    echo -e "${BOLD}📋 FIXES APPLIED:${NC}"
    echo -e "   ✅ Lambda function timeout increased to 30 seconds"
    echo -e "   ✅ Lambda function memory increased to 256 MB"
    echo -e "   ✅ S3 upload support environment variables configured"
    echo -e "   ✅ Lambda function code updated (if available)"
    echo ""
    
    if [ ! -z "$api_url" ] && [ "$api_url" != "None" ]; then
        echo -e "${BOLD}🌐 API Gateway:${NC} ${GREEN}$api_url${NC}"
    fi
    if [ ! -z "$website_url" ] && [ "$website_url" != "None" ]; then
        echo -e "${BOLD}🌐 Website:${NC} ${GREEN}$website_url${NC}"
    fi
    echo ""
    
    echo -e "${BOLD}🧪 TEST COMMANDS:${NC}"
    if [ ! -z "$api_url" ]; then
        echo -e "curl \"${api_url}/config/Company\""
        echo -e "curl \"${api_url}/config/Employee\""
        echo -e "curl \"${api_url}/responses?companyId=TEST\""
    fi
    echo ""
    
    echo -e "${BOLD}🎯 The Sunday afternoon fixes have been deployed!${NC}"
    echo -e "💾 File uploads should now work properly"
    echo -e "📋 Organization assessments can be continued/updated"
    echo -e "🚀 The 500 errors should be resolved"
}

#####################################
# Infrastructure Functions
#####################################
deploy_infrastructure() {
    log_step "Deploying CloudFormation Infrastructure"
    
    local cf_start_time=$(date +%s)
    
    log_info "Stack Name: $STACK_NAME"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $REGION"
    log_info "Owner: $OWNER_NAME"
    
    # Validate template
    log_info "Validating CloudFormation template..."
    execute_command "aws cloudformation validate-template --template-body file://$INFRASTRUCTURE_DIR/cloudformation-template.yaml --region $REGION" "Template validation"
    
    # Create changeset
    log_info "Creating changeset for review..."
    local changeset_name="changeset-$(date +%s)"
    local changeset_type="CREATE"
    
    if [ "$STACK_EXISTS" = "true" ]; then
        changeset_type="UPDATE"
    fi
    
    # Create changeset with error handling for "no changes" scenario
    local changeset_result=0
    if ! aws cloudformation create-change-set \
        --stack-name $STACK_NAME \
        --template-body file://$INFRASTRUCTURE_DIR/cloudformation-template.yaml \
        --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
        --capabilities CAPABILITY_NAMED_IAM \
        --change-set-name $changeset_name \
        --change-set-type $changeset_type \
        --region $REGION > /tmp/changeset_output.log 2>&1; then
        changeset_result=$?
        log_warning "Changeset creation returned non-zero exit code: $changeset_result"
    fi
    
    # Wait for changeset with timeout and check for "no changes" error
    log_info "Waiting for changeset to be created..."
    local wait_attempts=0
    local max_attempts=30
    
    while [ $wait_attempts -lt $max_attempts ]; do
        local changeset_status=$(aws cloudformation describe-change-set \
            --stack-name $STACK_NAME \
            --change-set-name $changeset_name \
            --region $REGION \
            --query 'Status' \
            --output text 2>/dev/null || echo "NOT_FOUND")
        
        local changeset_reason=$(aws cloudformation describe-change-set \
            --stack-name $STACK_NAME \
            --change-set-name $changeset_name \
            --region $REGION \
            --query 'StatusReason' \
            --output text 2>/dev/null || echo "")
        
        case $changeset_status in
            "CREATE_COMPLETE")
                log_success "Changeset created successfully"
                break
                ;;
            "FAILED")
                if [[ "$changeset_reason" == *"didn't contain changes"* ]]; then
                    log_warning "No infrastructure changes detected - stack is already up to date"
                    log_info "Skipping infrastructure deployment, continuing with frontend..."
                    
                    # Clean up the failed changeset
                    aws cloudformation delete-change-set \
                        --stack-name $STACK_NAME \
                        --change-set-name $changeset_name \
                        --region $REGION > /dev/null 2>&1 || true
                    
                    local cf_end_time=$(date +%s)
                    local cf_duration=$((cf_end_time - cf_start_time))
                    log_success "Infrastructure check completed in ${cf_duration}s (no changes needed)"
                    return 0
                else
                    log_error "Changeset creation failed: $changeset_reason"
                    # Clean up the failed changeset
                    aws cloudformation delete-change-set \
                        --stack-name $STACK_NAME \
                        --change-set-name $changeset_name \
                        --region $REGION > /dev/null 2>&1 || true
                    exit 1
                fi
                ;;
            "CREATE_PENDING"|"CREATE_IN_PROGRESS")
                printf "\r${CYAN}⏳ Waiting for changeset creation... %ds${NC}" $((wait_attempts * 2))
                sleep 2
                wait_attempts=$((wait_attempts + 1))
                ;;
            *)
                log_error "Unexpected changeset status: $changeset_status"
                exit 1
                ;;
        esac
    done
    
    if [ $wait_attempts -ge $max_attempts ]; then
        log_error "Changeset creation timed out"
        exit 1
    fi
    
    # Execute changeset
    log_info "Executing changeset..."
    execute_command "aws cloudformation execute-change-set --stack-name $STACK_NAME --change-set-name $changeset_name --region $REGION" "Changeset execution"
    
    # Wait for completion with progress
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
                aws cloudformation describe-stack-events --stack-name $STACK_NAME --region $REGION \
                    --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`].{Time:Timestamp,Resource:LogicalResourceId,Status:ResourceStatus,Reason:ResourceStatusReason}' \
                    --output table
                exit 1
                ;;
        esac
        
        sleep 10
    done
    
    local cf_end_time=$(date +%s)
    local cf_duration=$((cf_end_time - cf_start_time))
    log_success "Infrastructure deployment completed in ${cf_duration}s"
}

fetch_stack_outputs() {
    log_step "Retrieving Stack Outputs"
    
    log_info "Fetching CloudFormation stack outputs..."
    
    # Save outputs to file for reference
    aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs' \
        --output json > "$OUTPUTS_FILE"
    
    # Extract key outputs
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
    
    CLOUDFRONT_DOMAIN=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomainName'].OutputValue" \
        --output text)
    
    # Validate all required outputs
    local required_outputs=("CONFIG_BUCKET:$CONFIG_BUCKET" "WEBSITE_BUCKET:$WEBSITE_BUCKET" "API_URL:$API_URL" "CLOUDFRONT_URL:$CLOUDFRONT_URL")
    
    for output in "${required_outputs[@]}"; do
        local name="${output%%:*}"
        local value="${output##*:}"
        if [ -z "$value" ] || [ "$value" = "None" ]; then
            log_error "Failed to retrieve required output: $name"
            exit 1
        fi
        log_debug "$name: $value"
    done
    
    log_success "All stack outputs retrieved successfully"
}

upload_configuration_files() {
    log_step "Uploading Configuration Files to S3"
    
    log_info "Uploading CSV configuration files..."
    
    # Upload Company questions
    execute_command "aws s3 cp $DATA_DIR/CompanyQuestions.csv s3://$CONFIG_BUCKET/CompanyQuestions.csv --region $REGION" "Company questions upload"
    
    # Upload Employee questions
    execute_command "aws s3 cp $DATA_DIR/EmployeeQuestions.csv s3://$CONFIG_BUCKET/EmployeeQuestions.csv --region $REGION" "Employee questions upload"
    
    # Verify uploads
    log_info "Verifying uploaded files..."
    local company_size=$(aws s3api head-object --bucket $CONFIG_BUCKET --key CompanyQuestions.csv --region $REGION --query ContentLength --output text)
    local employee_size=$(aws s3api head-object --bucket $CONFIG_BUCKET --key EmployeeQuestions.csv --region $REGION --query ContentLength --output text)
    
    log_success "CompanyQuestions.csv uploaded (${company_size} bytes)"
    log_success "EmployeeQuestions.csv uploaded (${employee_size} bytes)"
}

#####################################
# Frontend Functions
#####################################
create_environment_file() {
    log_info "Creating production environment configuration..."
    
    cat > "$ENV_FILE" << EOF
# Generated by DMGT deployment script on $(date)
REACT_APP_API_URL=$API_URL
GENERATE_SOURCEMAP=false
EOF
    
    log_success "Environment configuration created"
    log_debug "API URL configured: $API_URL"
}

build_frontend() {
    log_step "Building React Application"
    
    cd "$FRONTEND_DIR"
    local frontend_start_time=$(date +%s)
    
    # Check Node.js version
    local node_version=$(node --version | cut -d'v' -f2)
    log_debug "Node.js version: $node_version"
    
    # Install dependencies with error handling
    log_info "Installing npm dependencies..."
    
    # Try npm ci first, with fallback to fix if it fails
    if ! npm ci --silent; then
        log_warning "npm ci failed, attempting to fix npm issues..."
        cd "$SCRIPT_DIR"
        
        if ! fix_npm_issues; then
            log_error "Failed to fix npm issues. Please check your package.json and node version compatibility."
            exit 1
        fi
        
        cd "$FRONTEND_DIR"
        log_info "Retrying npm ci after fixes..."
        execute_command "npm ci --silent" "NPM dependencies installation (retry)"
    else
        log_success "NPM dependencies installation completed"
    fi
    
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

deploy_frontend() {
    log_step "Deploying React Application to S3"
    
    # Upload to S3
    log_info "Uploading React app to S3..."
    execute_command "aws s3 sync $FRONTEND_DIR/build/ s3://$WEBSITE_BUCKET --delete --region $REGION" "React app S3 upload"
    
    # CloudFront cache invalidation
    log_info "Creating CloudFront cache invalidation..."
    local distribution_id=$(aws cloudformation describe-stack-resources \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "StackResources[?ResourceType=='AWS::CloudFront::Distribution'].PhysicalResourceId" \
        --output text 2>/dev/null || echo "")
    
    if [ ! -z "$distribution_id" ] && [ "$distribution_id" != "None" ]; then
        log_info "CloudFront Distribution ID: $distribution_id"
        local invalidation_id=$(aws cloudfront create-invalidation \
            --distribution-id $distribution_id \
            --paths "/*" \
            --query 'Invalidation.Id' \
            --output text 2>/dev/null || echo "")
        
        if [ ! -z "$invalidation_id" ] && [ "$invalidation_id" != "None" ]; then
            log_success "CloudFront invalidation created: $invalidation_id"
            log_info "Cache invalidation will complete in 10-15 minutes"
        else
            log_warning "CloudFront invalidation failed (non-critical)"
        fi
    else
        log_warning "Could not determine CloudFront distribution ID for cache invalidation"
    fi
    
    log_success "Frontend deployment completed"
}

#####################################
# Testing Functions
#####################################
test_deployment() {
    log_step "Testing Deployment"
    
    local test_start_time=$(date +%s)
    
    # Test API endpoints
    log_info "Testing API Gateway endpoints..."
    
    # Test Company configuration
    local company_api_url="$API_URL/config/Company"
    local company_response=$(curl -s -w "%{http_code}" -o /tmp/company_test.json "$company_api_url" 2>/dev/null || echo "000")
    
    if [ "$company_response" = "200" ]; then
        log_success "✅ Company API endpoint responding correctly"
    else
        log_warning "⚠️ Company API endpoint returned HTTP $company_response"
    fi
    
    # Test Employee configuration
    local employee_api_url="$API_URL/config/Employee"
    local employee_response=$(curl -s -w "%{http_code}" -o /tmp/employee_test.json "$employee_api_url" 2>/dev/null || echo "000")
    
    if [ "$employee_response" = "200" ]; then
        log_success "✅ Employee API endpoint responding correctly"
    else
        log_warning "⚠️ Employee API endpoint returned HTTP $employee_response"
    fi
    
    # Test website
    log_info "Testing CloudFront website..."
    local website_response=$(curl -s -w "%{http_code}" -o /tmp/website_test.html "$CLOUDFRONT_URL" 2>/dev/null || echo "000")
    
    if [ "$website_response" = "200" ]; then
        log_success "✅ Website accessible via CloudFront"
        # Check if it's the React app
        if grep -q "root" /tmp/website_test.html 2>/dev/null; then
            log_success "✅ React application properly served"
        fi
    else
        log_warning "⚠️ Website returned HTTP $website_response"
    fi
    
    # Test S3 bucket
    local bucket_test=$(aws s3 ls s3://$CONFIG_BUCKET --region $REGION 2>/dev/null | wc -l)
    if [ $bucket_test -gt 0 ]; then
        log_success "✅ S3 configuration bucket accessible ($bucket_test files)"
    else
        log_warning "⚠️ S3 configuration bucket may be empty"
    fi
    
    local test_end_time=$(date +%s)
    local test_duration=$((test_end_time - test_start_time))
    log_success "Deployment testing completed in ${test_duration}s"
}

#####################################
# Destruction Functions
#####################################
destroy_infrastructure() {
    log_step "Destroying Infrastructure"
    
    if [ "$FORCE_DELETE" != "true" ]; then
        echo -e "\n${BOLD}${RED}⚠️  DANGER: PERMANENT RESOURCE DELETION ⚠️${NC}\n"
        echo -e "${BOLD}This will permanently delete:${NC}"
        echo -e "  ${RED}•${NC} CloudFormation stack: ${CYAN}$STACK_NAME${NC}"
        echo -e "  ${RED}•${NC} All S3 buckets and their contents"
        echo -e "  ${RED}•${NC} All form responses and data"
        echo -e "  ${RED}•${NC} Lambda functions and API Gateway"
        echo -e "  ${RED}•${NC} CloudFront distribution"
        echo ""
        echo -e "${BOLD}Environment: ${RED}$ENVIRONMENT${NC} | Region: ${RED}$REGION${NC}${NC}"
        echo -e "${BOLD}${RED}This action CANNOT be undone!${NC}"
        echo ""
        
        read -p "Are you absolutely sure? Type 'DELETE' to confirm: " confirmation
        
        if [ "$confirmation" != "DELETE" ]; then
            log_info "Destruction cancelled by user"
            exit 0
        fi
    fi
    
    # Empty S3 buckets first
    log_info "Emptying S3 buckets before stack deletion..."
    
    # Get bucket names from stack if it exists
    if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION > /dev/null 2>&1; then
        local config_bucket=$(aws cloudformation describe-stacks \
            --stack-name $STACK_NAME \
            --region $REGION \
            --query "Stacks[0].Outputs[?OutputKey=='ConfigBucketName'].OutputValue" \
            --output text 2>/dev/null || echo "")
        
        local website_bucket=$(aws cloudformation describe-stacks \
            --stack-name $STACK_NAME \
            --region $REGION \
            --query "Stacks[0].Outputs[?OutputKey=='WebsiteBucketName'].OutputValue" \
            --output text 2>/dev/null || echo "")
        
        local responses_bucket=$(aws cloudformation describe-stacks \
            --stack-name $STACK_NAME \
            --region $REGION \
            --query "Stacks[0].Outputs[?OutputKey=='ResponsesBucketName'].OutputValue" \
            --output text 2>/dev/null || echo "")
        
        # Empty each bucket
        for bucket in "$config_bucket" "$website_bucket" "$responses_bucket"; do
            if [ ! -z "$bucket" ] && [ "$bucket" != "None" ]; then
                log_info "Emptying bucket: $bucket"
                execute_command "aws s3 rm s3://$bucket --recursive --region $REGION" "Empty bucket $bucket" "true"
                
                # Handle versioned objects
                aws s3api list-object-versions --bucket "$bucket" --region $REGION \
                    --query 'Versions[].{Key:Key,VersionId:VersionId}' --output text 2>/dev/null | \
                    while read key version; do
                        if [ ! -z "$key" ] && [ ! -z "$version" ]; then
                            aws s3api delete-object --bucket "$bucket" --key "$key" --version-id "$version" --region $REGION > /dev/null 2>&1 || true
                        fi
                    done
            fi
        done
    fi
    
    # Delete CloudFormation stack
    log_info "Deleting CloudFormation stack: $STACK_NAME"
    execute_command "aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION" "Stack deletion"
    
    # Wait for deletion
    log_info "Waiting for stack deletion to complete..."
    local wait_start=$(date +%s)
    
    while true; do
        local stack_status=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "DELETE_COMPLETE")
        local wait_current=$(date +%s)
        local wait_duration=$((wait_current - wait_start))
        
        printf "\r${CYAN}⏳ Waiting for stack deletion... %ds (Status: %s)${NC}" $wait_duration "$stack_status"
        
        case $stack_status in
            "DELETE_COMPLETE")
                echo ""
                log_success "Stack deletion completed successfully"
                break
                ;;
            "DELETE_FAILED")
                echo ""
                log_error "Stack deletion failed"
                aws cloudformation describe-stack-events --stack-name $STACK_NAME --region $REGION \
                    --query 'StackEvents[?ResourceStatus==`DELETE_FAILED`].{Time:Timestamp,Resource:LogicalResourceId,Reason:ResourceStatusReason}' \
                    --output table
                exit 1
                ;;
        esac
        
        sleep 10
    done
    
    # Cleanup output files
    rm -f "$OUTPUTS_FILE" "$ENV_FILE"
    
    log_success "Infrastructure destruction completed"
}

#####################################
# Summary Functions
#####################################
deployment_summary() {
    log_step "Deployment Summary"
    
    local end_time=$(date +%s)
    local total_duration=$((end_time - START_TIME))
    local minutes=$((total_duration / 60))
    local seconds=$((total_duration % 60))
    
    echo -e "\n${BOLD}${GREEN}🎉 DEPLOYMENT COMPLETED SUCCESSFULLY! 🎉${NC}\n"
    
    # Prominent URL Display
    echo -e "${BOLD}${CYAN}╔═══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}║                          🌐 DMGT BASIC FORM ACCESS URLS                      ║${NC}"
    echo -e "${BOLD}${CYAN}╠═══════════════════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${BOLD}${CYAN}║                                                                               ║${NC}"
    echo -e "${BOLD}${CYAN}║  📱 Application Website:                                                      ║${NC}"
    echo -e "${BOLD}${CYAN}║     ${GREEN}${CLOUDFRONT_URL}${CYAN}                    ║${NC}"
    echo -e "${BOLD}${CYAN}║                                                                               ║${NC}"
    echo -e "${BOLD}${CYAN}║  🔗 API Gateway:                                                              ║${NC}"
    echo -e "${BOLD}${CYAN}║     ${GREEN}${API_URL}${CYAN}                ║${NC}"
    echo -e "${BOLD}${CYAN}║                                                                               ║${NC}"
    echo -e "${BOLD}${CYAN}║  📋 Test Endpoints:                                                           ║${NC}"
    echo -e "${BOLD}${CYAN}║     Company Config:  ${GREEN}${API_URL}/config/Company${CYAN}       ║${NC}"
    echo -e "${BOLD}${CYAN}║     Employee Config: ${GREEN}${API_URL}/config/Employee${CYAN}      ║${NC}"
    echo -e "${BOLD}${CYAN}║     Status Check:    ${GREEN}${API_URL}/responses?companyId=TEST${CYAN}  ║${NC}"
    echo -e "${BOLD}${CYAN}║                                                                               ║${NC}"
    echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${BOLD}📋 Deployment Details:${NC}"
    echo -e "Environment: ${CYAN}$ENVIRONMENT${NC}"
    echo -e "Region: ${CYAN}$REGION${NC}"
    echo -e "Owner: ${CYAN}$OWNER_NAME${NC}"
    echo -e "Duration: ${CYAN}${minutes}m ${seconds}s${NC}"
    echo -e "Stack: ${CYAN}$STACK_NAME${NC}"
    echo ""
    
    echo -e "${BOLD}📚 AWS Resources:${NC}"
    echo -e "• Config Bucket: ${CYAN}$CONFIG_BUCKET${NC}"
    echo -e "• Website Bucket: ${CYAN}$WEBSITE_BUCKET${NC}"
    echo -e "• CloudFront: ${CYAN}$CLOUDFRONT_DOMAIN${NC}"
    echo ""
    
    echo -e "${BOLD}📝 Next Steps:${NC}"
    echo -e "1. ${WHITE}📱 Access your application: ${GREEN}$CLOUDFRONT_URL${NC}"
    echo -e "2. ${WHITE}🧪 Test API endpoints using the URLs above${NC}"
    echo -e "3. ${WHITE}📨 Share Company IDs with your clients${NC}"
    echo -e "4. ${WHITE}📊 Monitor CloudWatch logs for usage${NC}"
    echo -e "5. ${WHITE}✏️ Edit questions by updating CSV files in S3${NC}"
    echo ""
    
    if [ ${#WARNINGS[@]} -gt 0 ]; then
        echo -e "${BOLD}${YELLOW}⚠️  Warnings:${NC}"
        for warning in "${WARNINGS[@]}"; do
            echo -e "  • ${YELLOW}$warning${NC}"
        done
        echo ""
    fi
    
    echo -e "${BOLD}🧪 Quick Tests:${NC}"
    echo -e "curl \"${API_URL}/config/Company\""
    echo -e "curl \"${API_URL}/config/Employee\""
    echo -e "curl \"${API_URL}/responses?companyId=TEST\""
    echo ""
    
    echo -e "${BOLD}🎯 DMGT Basic Form is ready to collect data and assess AI readiness!${NC}"
    echo ""
    
    echo -e "${BOLD}💡 Pro Tip:${NC} Use ${CYAN}$0 --apply-sunday-fixes --environment=$ENVIRONMENT${NC} to apply critical fixes to Lambda functions"
}

destruction_summary() {
    local end_time=$(date +%s)
    local total_duration=$((end_time - START_TIME))
    local minutes=$((total_duration / 60))
    local seconds=$((total_duration % 60))
    
    echo -e "\n${BOLD}${GREEN}✅ DESTRUCTION COMPLETED SUCCESSFULLY!${NC}\n"
    
    echo -e "${BOLD}📋 Destruction Summary:${NC}"
    echo -e "Environment: ${CYAN}$ENVIRONMENT${NC}"
    echo -e "Region: ${CYAN}$REGION${NC}"
    echo -e "Duration: ${CYAN}${minutes}m ${seconds}s${NC}"
    echo ""
    
    echo -e "${BOLD}🗑️ Resources Destroyed:${NC}"
    echo -e "• CloudFormation Stack: ${GREEN}✓${NC}"
    echo -e "• S3 Buckets: ${GREEN}✓${NC}"
    echo -e "• Lambda Functions: ${GREEN}✓${NC}"
    echo -e "• API Gateway: ${GREEN}✓${NC}"
    echo -e "• CloudFront Distribution: ${GREEN}✓${NC}"
    echo ""
    
    echo -e "${BOLD}💡 You can redeploy anytime using: ${CYAN}$0${NC}"
}

#####################################
# Error Handling
#####################################
handle_error() {
    local exit_code=$?
    local line_number=$1
    
    log_error "Script failed at line $line_number with exit code $exit_code"
    
    echo -e "\n${BOLD}${RED}❌ DEPLOYMENT FAILED${NC}\n"
    
    if [ ${#ERRORS[@]} -gt 0 ]; then
        echo -e "${BOLD}Errors encountered:${NC}"
        for error in "${ERRORS[@]}"; do
            echo -e "  • ${RED}$error${NC}"
        done
    fi
    
    echo -e "\n${BOLD}🔧 Troubleshooting:${NC}"
    echo -e "1. Check AWS credentials: ${CYAN}aws sts get-caller-identity${NC}"
    echo -e "2. Check region: ${CYAN}aws configure get region${NC}"
    echo -e "3. View stack events: ${CYAN}aws cloudformation describe-stack-events --stack-name $STACK_NAME --region $REGION${NC}"
    echo -e "4. Run with verbose mode: ${CYAN}$0 --verbose${NC}"
    echo -e "5. Check logs: ${CYAN}cat /tmp/dmgt_deploy_output.log${NC}"
    echo ""
    
    exit $exit_code
}

#####################################
# Main Execution
#####################################
main() {
    # Set up error handling
    trap 'handle_error $LINENO' ERR
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Script header
    echo -e "${BOLD}${BLUE}"
    printf '=%.0s' {1..80}
    echo ""
    echo "  DMGT Basic Form - Enhanced Deployment Script"
    printf '=%.0s' {1..80}
    echo -e "${NC}"
    
    log_info "Starting DMGT Basic Form deployment"
    log_info "Mode: $MODE"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $REGION"
    log_info "Owner: $OWNER_NAME"
    log_info "Verbose: $VERBOSE"
    log_info "Dry Run: $DRY_RUN"
    
    if [ "$APPLY_SUNDAY_FIXES" = "true" ]; then
        log_info "Sunday Fixes: ${GREEN}ENABLED${NC}"
    fi
    
    if [ "$DRY_RUN" = "true" ]; then
        log_warning "DRY RUN MODE - No actual changes will be made"
    fi
    
    # Execute based on mode
    case $MODE in
        "delete")
            TOTAL_STEPS=2
            check_prerequisites
            show_progress $STEP_COUNT $TOTAL_STEPS
            destroy_infrastructure
            show_progress $STEP_COUNT $TOTAL_STEPS
            echo ""
            destruction_summary
            ;;
        "sunday-fixes")
            TOTAL_STEPS=2
            check_prerequisites
            show_progress $STEP_COUNT $TOTAL_STEPS
            apply_sunday_fixes
            show_progress $STEP_COUNT $TOTAL_STEPS
            echo ""
            ;;
        "frontend-only")
            TOTAL_STEPS=4
            check_prerequisites
            show_progress $STEP_COUNT $TOTAL_STEPS
            fetch_stack_outputs
            show_progress $STEP_COUNT $TOTAL_STEPS
            build_frontend
            show_progress $STEP_COUNT $TOTAL_STEPS
            deploy_frontend
            show_progress $STEP_COUNT $TOTAL_STEPS
            echo ""
            log_success "Frontend-only deployment completed!"
            echo -e "🌐 Your application: ${GREEN}$CLOUDFRONT_URL${NC}"
            ;;
        *)
            # Full deployment
            check_prerequisites
            show_progress $STEP_COUNT $TOTAL_STEPS
            pre_deployment_checks
            show_progress $STEP_COUNT $TOTAL_STEPS
            deploy_infrastructure
            show_progress $STEP_COUNT $TOTAL_STEPS
            fetch_stack_outputs
            show_progress $STEP_COUNT $TOTAL_STEPS
            upload_configuration_files
            show_progress $STEP_COUNT $TOTAL_STEPS
            build_frontend
            show_progress $STEP_COUNT $TOTAL_STEPS
            deploy_frontend
            show_progress $STEP_COUNT $TOTAL_STEPS
            test_deployment
            show_progress $STEP_COUNT $TOTAL_STEPS
            echo ""
            deployment_summary
            ;;
    esac
    
    # Auto-apply Sunday fixes if requested for full deployment
    if [ "$APPLY_SUNDAY_FIXES" = "true" ] && [ "$MODE" = "deploy" ]; then
        echo ""
        log_info "Auto-applying Sunday fixes as requested..."
        apply_sunday_fixes
    fi
}

# Change to script directory and run
cd "$SCRIPT_DIR"
main "$@"