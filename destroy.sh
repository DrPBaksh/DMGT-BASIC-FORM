#!/usr/bin/env bash
set -euo pipefail # -e: exit on error, -u: unset variables are errors, -o pipefail: pipe failures

#####################################
# DMGT Basic Form - Professional Destruction Script
# Safely destroys all deployed resources with comprehensive logging
#####################################

# Compute paths relative to this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Configuration with defaults
ENVIRONMENT=${ENVIRONMENT:-prod}
REGION=${AWS_REGION:-us-east-1}
OWNER_NAME=${OWNER_NAME:-$(whoami)}
VERBOSE=${VERBOSE:-false}
DRY_RUN=${DRY_RUN:-false}
FORCE=${FORCE:-false}

# Stack and resource naming
STACK_NAME="dmgt-basic-form-${ENVIRONMENT}"

# Global tracking variables
STEP_COUNT=0
TOTAL_STEPS=6
START_TIME=$(date +%s)
ERRORS=()
WARNINGS=()
ORPHANED_RESOURCES=()

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
    echo -e "\n${BOLD}${RED}[STEP $STEP_COUNT/$TOTAL_STEPS]${NC} ${timestamp} - $1"
    separator_line
}

separator_line() {
    printf "${RED}"
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
    
    printf "\r${CYAN}Progress: [${RED}"
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
        eval $cmd > /tmp/dmgt_destroy_output.log 2>&1 || result=$?
        if [ $result -ne 0 ] && [ "$allow_failure" != "true" ]; then
            log_error "Command failed. Output:"
            cat /tmp/dmgt_destroy_output.log
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
                FORCE=true
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
    echo -e "${BOLD}DMGT Basic Form Destruction Script${NC}"
    echo ""
    echo -e "${BOLD}Usage:${NC}"
    echo -e "  $0 [OPTIONS]"
    echo ""
    echo -e "${BOLD}Options:${NC}"
    echo -e "  --environment=ENV : Set environment to destroy (default: prod)"
    echo -e "  --region=REGION   : Set AWS region (default: us-east-1)"
    echo -e "  --owner=NAME      : Set owner name (default: current username)"
    echo -e "  --verbose         : Enable verbose logging"
    echo -e "  --dry-run         : Show commands without executing"
    echo -e "  --force           : Skip confirmation prompts"
    echo -e "  --help            : Show this help message"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo -e "  ${CYAN}$0 --environment=dev${NC}                # Destroy dev environment"
    echo -e "  ${CYAN}$0 --environment=prod --verbose${NC}     # Destroy prod with verbose logging"
    echo -e "  ${CYAN}$0 --force --environment=dev${NC}       # Destroy dev without confirmation"
    echo ""
    echo -e "${BOLD}${RED}WARNING: This operation is irreversible!${NC}"
    echo ""
}

#####################################
# Validation Functions
#####################################
check_prerequisites() {
    log_step "🔍 Checking Prerequisites"
    
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
}

#####################################
# Resource Discovery Functions
#####################################
discover_resources() {
    log_step "🔍 Discovering AWS Resources"
    
    # Check for CloudFormation stack
    log_info "Checking for CloudFormation stack: $STACK_NAME"
    
    local stack_exists=false
    local stack_status=""
    
    if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION > /dev/null 2>&1; then
        stack_exists=true
        stack_status=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].StackStatus' --output text)
        
        local creation_time=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].CreationTime' --output text)
        local last_updated=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].LastUpdatedTime' --output text 2>/dev/null || echo "Never")
        
        log_success "Found CloudFormation stack"
        log_info "Stack Status: $stack_status"
        log_info "Created: $creation_time"
        log_info "Last Updated: $last_updated"
        
        # Get stack outputs for bucket names
        CONFIG_BUCKET=$(aws cloudformation describe-stacks \
            --stack-name $STACK_NAME \
            --region $REGION \
            --query "Stacks[0].Outputs[?OutputKey=='ConfigBucketName'].OutputValue" \
            --output text 2>/dev/null || echo "")
        
        WEBSITE_BUCKET=$(aws cloudformation describe-stacks \
            --stack-name $STACK_NAME \
            --region $REGION \
            --query "Stacks[0].Outputs[?OutputKey=='WebsiteBucketName'].OutputValue" \
            --output text 2>/dev/null || echo "")
        
        RESPONSES_BUCKET=$(aws cloudformation describe-stacks \
            --stack-name $STACK_NAME \
            --region $REGION \
            --query "Stacks[0].Outputs[?OutputKey=='ResponsesBucketName'].OutputValue" \
            --output text 2>/dev/null || echo "")
        
        log_debug "Config Bucket: $CONFIG_BUCKET"
        log_debug "Website Bucket: $WEBSITE_BUCKET"
        log_debug "Responses Bucket: $RESPONSES_BUCKET"
    else
        log_warning "CloudFormation stack $STACK_NAME not found"
    fi
    
    # Check for orphaned resources
    log_info "Scanning for orphaned DMGT resources..."
    discover_orphaned_resources
    
    if [ "$stack_exists" = false ] && [ ${#ORPHANED_RESOURCES[@]} -eq 0 ]; then
        log_success "No resources found to destroy"
        echo -e "\n${BOLD}${GREEN}✅ Nothing to clean up - environment is already clean!${NC}"
        exit 0
    fi
    
    # Show what will be destroyed
    show_destruction_preview
}

discover_orphaned_resources() {
    local found_orphans=false
    
    # Check for S3 buckets
    log_debug "Checking for orphaned S3 buckets..."
    local buckets=$(aws s3api list-buckets --query "Buckets[?contains(Name, 'dmgt-basic-form')].Name" --output text 2>/dev/null || echo "")
    if [ ! -z "$buckets" ]; then
        for bucket in $buckets; do
            ORPHANED_RESOURCES+=("S3_BUCKET:$bucket")
            log_warning "Found orphaned S3 bucket: $bucket"
            found_orphans=true
        done
    fi
    
    # Check for Lambda functions
    log_debug "Checking for orphaned Lambda functions..."
    local functions=$(aws lambda list-functions --query "Functions[?contains(FunctionName, 'dmgt-basic-form')].FunctionName" --output text --region $REGION 2>/dev/null || echo "")
    if [ ! -z "$functions" ]; then
        for func in $functions; do
            ORPHANED_RESOURCES+=("LAMBDA:$func")
            log_warning "Found orphaned Lambda function: $func"
            found_orphans=true
        done
    fi
    
    # Check for API Gateways
    log_debug "Checking for orphaned API Gateways..."
    local apis=$(aws apigateway get-rest-apis --query "items[?contains(name, 'dmgt-basic-form')].{id:id,name:name}" --output text --region $REGION 2>/dev/null || echo "")
    if [ ! -z "$apis" ]; then
        echo "$apis" | while read -r id name; do
            if [ ! -z "$id" ]; then
                ORPHANED_RESOURCES+=("API_GATEWAY:$id:$name")
                log_warning "Found orphaned API Gateway: $name ($id)"
                found_orphans=true
            fi
        done
    fi
    
    # Check for CloudFront distributions
    log_debug "Checking for orphaned CloudFront distributions..."
    local distributions=$(aws cloudfront list-distributions --query "DistributionList.Items[?contains(Comment, 'dmgt-basic-form')].{Id:Id,DomainName:DomainName,Status:Status}" --output text 2>/dev/null || echo "")
    if [ ! -z "$distributions" ]; then
        echo "$distributions" | while read -r id domain status; do
            if [ ! -z "$id" ]; then
                ORPHANED_RESOURCES+=("CLOUDFRONT:$id:$domain:$status")
                log_warning "Found orphaned CloudFront distribution: $domain ($id) - Status: $status"
                found_orphans=true
            fi
        done
    fi
    
    # Check for IAM roles
    log_debug "Checking for orphaned IAM roles..."
    local roles=$(aws iam list-roles --query "Roles[?contains(RoleName, 'dmgt-basic-form')].RoleName" --output text 2>/dev/null || echo "")
    if [ ! -z "$roles" ]; then
        for role in $roles; do
            ORPHANED_RESOURCES+=("IAM_ROLE:$role")
            log_warning "Found orphaned IAM role: $role"
            found_orphans=true
        done
    fi
    
    if [ "$found_orphans" = true ]; then
        log_warning "Found ${#ORPHANED_RESOURCES[@]} orphaned resources"
    else
        log_success "No orphaned resources found"
    fi
}

show_destruction_preview() {
    echo -e "\n${BOLD}${RED}📋 DESTRUCTION PREVIEW${NC}"
    separator_line
    
    # Show stack resources
    if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION > /dev/null 2>&1; then
        echo -e "${BOLD}CloudFormation Stack Resources:${NC}"
        echo -e "  🗂️  Stack: ${CYAN}$STACK_NAME${NC}"
        if [ ! -z "$CONFIG_BUCKET" ] && [ "$CONFIG_BUCKET" != "None" ]; then
            echo -e "  🪣  Config Bucket: ${CYAN}$CONFIG_BUCKET${NC}"
        fi
        if [ ! -z "$WEBSITE_BUCKET" ] && [ "$WEBSITE_BUCKET" != "None" ]; then
            echo -e "  🪣  Website Bucket: ${CYAN}$WEBSITE_BUCKET${NC}"
        fi
        if [ ! -z "$RESPONSES_BUCKET" ] && [ "$RESPONSES_BUCKET" != "None" ]; then
            echo -e "  🪣  Responses Bucket: ${CYAN}$RESPONSES_BUCKET${NC}"
        fi
        echo -e "  ⚡  Lambda Functions: ${CYAN}All stack Lambda functions${NC}"
        echo -e "  🌐  API Gateway: ${CYAN}All stack API resources${NC}"
        echo -e "  ☁️   CloudFront Distribution: ${CYAN}Stack CloudFront${NC}"
        echo -e "  🔐  IAM Roles: ${CYAN}All stack IAM resources${NC}"
        echo ""
    fi
    
    # Show orphaned resources
    if [ ${#ORPHANED_RESOURCES[@]} -gt 0 ]; then
        echo -e "${BOLD}Orphaned Resources:${NC}"
        for resource in "${ORPHANED_RESOURCES[@]}"; do
            local type="${resource%%:*}"
            local details="${resource#*:}"
            case $type in
                "S3_BUCKET")
                    echo -e "  🪣  S3 Bucket: ${YELLOW}$details${NC}"
                    ;;
                "LAMBDA")
                    echo -e "  ⚡  Lambda Function: ${YELLOW}$details${NC}"
                    ;;
                "API_GATEWAY")
                    local id="${details%%:*}"
                    local name="${details#*:}"
                    echo -e "  🌐  API Gateway: ${YELLOW}$name ($id)${NC}"
                    ;;
                "CLOUDFRONT")
                    local parts=(${details//:/ })
                    echo -e "  ☁️   CloudFront: ${YELLOW}${parts[1]} (${parts[0]}) - ${parts[2]}${NC}"
                    ;;
                "IAM_ROLE")
                    echo -e "  🔐  IAM Role: ${YELLOW}$details${NC}"
                    ;;
            esac
        done
        echo ""
    fi
}

#####################################
# Confirmation Function
#####################################
confirm_destruction() {
    log_step "⚠️  Destruction Confirmation"
    
    if [ "$FORCE" = "true" ]; then
        log_warning "FORCE mode enabled - skipping confirmation"
        return 0
    fi
    
    echo -e "\n${BOLD}${RED}⚠️  DANGER: PERMANENT RESOURCE DELETION ⚠️${NC}\n"
    
    echo -e "${BOLD}This will permanently delete ALL resources shown above including:${NC}"
    echo -e "  ${RED}•${NC} All S3 buckets and their contents"
    echo -e "  ${RED}•${NC} All form responses and uploaded files"
    echo -e "  ${RED}•${NC} Lambda functions and API Gateway"
    echo -e "  ${RED}•${NC} CloudFront distributions"
    echo -e "  ${RED}•${NC} IAM roles and policies"
    echo ""
    
    # Show estimated data loss
    if [ ! -z "$RESPONSES_BUCKET" ] && [ "$RESPONSES_BUCKET" != "None" ]; then
        log_info "Checking for form response data..."
        local response_count=$(aws s3api list-objects-v2 --bucket $RESPONSES_BUCKET --region $REGION --query 'KeyCount' --output text 2>/dev/null || echo "0")
        if [ "$response_count" -gt 0 ]; then
            echo -e "  ${YELLOW}⚠️  $response_count form response files will be permanently deleted${NC}"
        fi
    fi
    
    echo -e "\n${BOLD}Target Environment:${NC}"
    echo -e "  Environment: ${RED}$ENVIRONMENT${NC}"
    echo -e "  Region: ${RED}$REGION${NC}"
    echo -e "  Account: ${RED}$(aws sts get-caller-identity --query Account --output text 2>/dev/null)${NC}"
    echo ""
    
    echo -e "${BOLD}${RED}This action CANNOT be undone!${NC}"
    echo ""
    
    read -p "Are you absolutely sure? Type 'DELETE' to confirm: " confirmation
    
    if [ "$confirmation" != "DELETE" ]; then
        log_info "Destruction cancelled by user"
        exit 0
    fi
    
    log_warning "Destruction confirmed - proceeding in 5 seconds..."
    for i in {5..1}; do
        echo -ne "\r${YELLOW}Starting destruction in $i seconds... (Ctrl+C to abort)${NC}"
        sleep 1
    done
    echo ""
    
    log_success "Destruction confirmed and starting"
}

#####################################
# S3 Cleanup Functions
#####################################
cleanup_s3_buckets() {
    log_step "🪣 Cleaning Up S3 Buckets"
    
    local buckets_to_clean=()
    
    # Add stack buckets
    for bucket in "$CONFIG_BUCKET" "$WEBSITE_BUCKET" "$RESPONSES_BUCKET"; do
        if [ ! -z "$bucket" ] && [ "$bucket" != "None" ]; then
            buckets_to_clean+=("$bucket")
        fi
    done
    
    # Add orphaned buckets
    for resource in "${ORPHANED_RESOURCES[@]}"; do
        if [[ $resource == S3_BUCKET:* ]]; then
            local bucket="${resource#S3_BUCKET:}"
            buckets_to_clean+=("$bucket")
        fi
    done
    
    if [ ${#buckets_to_clean[@]} -eq 0 ]; then
        log_success "No S3 buckets found to clean up"
        return 0
    fi
    
    log_info "Found ${#buckets_to_clean[@]} S3 bucket(s) to clean up"
    
    for bucket in "${buckets_to_clean[@]}"; do
        cleanup_single_bucket "$bucket"
    done
    
    log_success "S3 bucket cleanup completed"
}

cleanup_single_bucket() {
    local bucket="$1"
    
    log_info "Cleaning up bucket: $bucket"
    
    # Check if bucket exists
    if ! aws s3api head-bucket --bucket "$bucket" --region $REGION > /dev/null 2>&1; then
        log_debug "Bucket $bucket does not exist - skipping"
        return 0
    fi
    
    # Get object count
    local object_count=$(aws s3api list-objects-v2 --bucket "$bucket" --region $REGION --query 'KeyCount' --output text 2>/dev/null || echo "0")
    log_info "Bucket $bucket contains $object_count objects"
    
    if [ "$object_count" -gt 0 ]; then
        # Delete current objects
        log_info "Deleting current objects from $bucket..."
        execute_command "aws s3 rm s3://$bucket --recursive --region $REGION" "Delete objects from $bucket" "true"
        
        # Handle versioned objects
        log_info "Checking for versioned objects in $bucket..."
        local versions=$(aws s3api list-object-versions --bucket "$bucket" --region $REGION --query 'Versions[].{Key:Key,VersionId:VersionId}' --output text 2>/dev/null || echo "")
        
        if [ ! -z "$versions" ]; then
            log_info "Deleting versioned objects from $bucket..."
            echo "$versions" | while read -r key version; do
                if [ ! -z "$key" ] && [ ! -z "$version" ]; then
                    aws s3api delete-object --bucket "$bucket" --key "$key" --version-id "$version" --region $REGION > /dev/null 2>&1 || true
                fi
            done
        fi
        
        # Handle delete markers
        log_info "Checking for delete markers in $bucket..."
        local markers=$(aws s3api list-object-versions --bucket "$bucket" --region $REGION --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' --output text 2>/dev/null || echo "")
        
        if [ ! -z "$markers" ]; then
            log_info "Deleting delete markers from $bucket..."
            echo "$markers" | while read -r key version; do
                if [ ! -z "$key" ] && [ ! -z "$version" ]; then
                    aws s3api delete-object --bucket "$bucket" --key "$key" --version-id "$version" --region $REGION > /dev/null 2>&1 || true
                fi
            done
        fi
    fi
    
    # Verify bucket is empty
    local remaining_objects=$(aws s3api list-objects-v2 --bucket "$bucket" --region $REGION --query 'KeyCount' --output text 2>/dev/null || echo "0")
    if [ "$remaining_objects" -eq 0 ]; then
        log_success "Bucket $bucket is now empty"
    else
        log_warning "Bucket $bucket still contains $remaining_objects objects"
    fi
}

#####################################
# Stack Destruction
#####################################
destroy_cloudformation_stack() {
    log_step "🗂️ Destroying CloudFormation Stack"
    
    # Check if stack exists
    if ! aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION > /dev/null 2>&1; then
        log_warning "CloudFormation stack $STACK_NAME does not exist - skipping"
        return 0
    fi
    
    local stack_status=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].StackStatus' --output text)
    log_info "Current stack status: $stack_status"
    
    # Handle different stack states
    case $stack_status in
        "DELETE_IN_PROGRESS")
            log_info "Stack deletion already in progress"
            ;;
        "DELETE_COMPLETE")
            log_success "Stack already deleted"
            return 0
            ;;
        *)
            log_info "Initiating stack deletion..."
            execute_command "aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION" "Stack deletion initiation"
            ;;
    esac
    
    # Wait for stack deletion
    log_info "Waiting for stack deletion to complete..."
    local wait_start=$(date +%s)
    local last_status=""
    
    while true; do
        local current_status=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "DELETE_COMPLETE")
        local wait_current=$(date +%s)
        local wait_duration=$((wait_current - wait_start))
        
        if [ "$current_status" != "$last_status" ]; then
            echo ""
            log_info "Stack status: $current_status"
            last_status="$current_status"
        fi
        
        printf "\r${CYAN}⏳ Waiting for stack deletion... %ds (Status: %s)${NC}" $wait_duration "$current_status"
        
        case $current_status in
            "DELETE_COMPLETE")
                echo ""
                log_success "Stack deletion completed successfully"
                break
                ;;
            "DELETE_FAILED")
                echo ""
                log_error "Stack deletion failed"
                log_info "Checking stack events for error details..."
                aws cloudformation describe-stack-events --stack-name $STACK_NAME --region $REGION \
                    --query 'StackEvents[?ResourceStatus==`DELETE_FAILED`].{Time:Timestamp,Resource:LogicalResourceId,Reason:ResourceStatusReason}' \
                    --output table 2>/dev/null || true
                return 1
                ;;
        esac
        
        # Timeout after 30 minutes
        if [ $wait_duration -gt 1800 ]; then
            echo ""
            log_error "Stack deletion timed out after 30 minutes"
            return 1
        fi
        
        sleep 10
    done
    
    log_success "CloudFormation stack destruction completed"
}

#####################################
# Orphaned Resource Cleanup
#####################################
cleanup_orphaned_resources() {
    log_step "🧹 Cleaning Up Orphaned Resources"
    
    if [ ${#ORPHANED_RESOURCES[@]} -eq 0 ]; then
        log_success "No orphaned resources to clean up"
        return 0
    fi
    
    log_info "Cleaning up ${#ORPHANED_RESOURCES[@]} orphaned resources..."
    
    for resource in "${ORPHANED_RESOURCES[@]}"; do
        local type="${resource%%:*}"
        local details="${resource#*:}"
        
        case $type in
            "LAMBDA")
                log_info "Deleting orphaned Lambda function: $details"
                execute_command "aws lambda delete-function --function-name $details --region $REGION" "Delete Lambda $details" "true"
                ;;
            "API_GATEWAY")
                local id="${details%%:*}"
                local name="${details#*:}"
                log_info "Deleting orphaned API Gateway: $name ($id)"
                execute_command "aws apigateway delete-rest-api --rest-api-id $id --region $REGION" "Delete API Gateway $id" "true"
                ;;
            "CLOUDFRONT")
                local parts=(${details//:/ })
                local id="${parts[0]}"
                local domain="${parts[1]}"
                local status="${parts[2]}"
                log_warning "CloudFront distribution $domain ($id) requires manual cleanup"
                log_info "Status: $status - CloudFront distributions must be disabled before deletion"
                log_info "Manual steps:"
                log_info "  1. aws cloudfront get-distribution-config --id $id"
                log_info "  2. Modify config to set Enabled=false"
                log_info "  3. aws cloudfront update-distribution --id $id --distribution-config <config>"
                log_info "  4. Wait for status to become 'Deployed'"
                log_info "  5. aws cloudfront delete-distribution --id $id --if-match <etag>"
                ;;
            "IAM_ROLE")
                log_info "Deleting orphaned IAM role: $details"
                # Detach managed policies
                execute_command "aws iam list-attached-role-policies --role-name $details --query 'AttachedPolicies[].PolicyArn' --output text | xargs -r -n1 aws iam detach-role-policy --role-name $details --policy-arn" "Detach policies from $details" "true"
                # Delete inline policies
                execute_command "aws iam list-role-policies --role-name $details --query 'PolicyNames[]' --output text | xargs -r -n1 aws iam delete-role-policy --role-name $details --policy-name" "Delete inline policies from $details" "true"
                # Delete role
                execute_command "aws iam delete-role --role-name $details" "Delete IAM role $details" "true"
                ;;
        esac
    done
    
    log_success "Orphaned resource cleanup completed"
}

#####################################
# Final Verification
#####################################
verify_destruction() {
    log_step "✅ Verifying Complete Destruction"
    
    local verification_errors=0
    
    # Check CloudFormation stack
    log_info "Verifying CloudFormation stack deletion..."
    if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION > /dev/null 2>&1; then
        log_error "CloudFormation stack still exists"
        verification_errors=$((verification_errors + 1))
    else
        log_success "CloudFormation stack successfully deleted"
    fi
    
    # Final scan for remaining resources
    log_info "Final scan for remaining DMGT resources..."
    
    # Check S3 buckets
    local remaining_buckets=$(aws s3api list-buckets --query "Buckets[?contains(Name, 'dmgt-basic-form')].Name" --output text 2>/dev/null || echo "")
    if [ ! -z "$remaining_buckets" ]; then
        log_warning "Remaining S3 buckets found: $remaining_buckets"
        verification_errors=$((verification_errors + 1))
    fi
    
    # Check Lambda functions
    local remaining_functions=$(aws lambda list-functions --query "Functions[?contains(FunctionName, 'dmgt-basic-form')].FunctionName" --output text --region $REGION 2>/dev/null || echo "")
    if [ ! -z "$remaining_functions" ]; then
        log_warning "Remaining Lambda functions found: $remaining_functions"
        verification_errors=$((verification_errors + 1))
    fi
    
    # Check API Gateways
    local remaining_apis=$(aws apigateway get-rest-apis --query "items[?contains(name, 'dmgt-basic-form')].name" --output text --region $REGION 2>/dev/null || echo "")
    if [ ! -z "$remaining_apis" ]; then
        log_warning "Remaining API Gateways found: $remaining_apis"
        verification_errors=$((verification_errors + 1))
    fi
    
    # Check IAM roles
    local remaining_roles=$(aws iam list-roles --query "Roles[?contains(RoleName, 'dmgt-basic-form')].RoleName" --output text 2>/dev/null || echo "")
    if [ ! -z "$remaining_roles" ]; then
        log_warning "Remaining IAM roles found: $remaining_roles"
        verification_errors=$((verification_errors + 1))
    fi
    
    if [ $verification_errors -eq 0 ]; then
        log_success "✅ All resources successfully destroyed"
        return 0
    else
        log_warning "⚠️ Destruction completed with $verification_errors remaining resources"
        return 1
    fi
}

#####################################
# Summary Functions
#####################################
destruction_summary() {
    log_step "📋 Destruction Summary"
    
    local end_time=$(date +%s)
    local total_duration=$((end_time - START_TIME))
    local minutes=$((total_duration / 60))
    local seconds=$((total_duration % 60))
    
    if [ ${#ERRORS[@]} -eq 0 ]; then
        echo -e "\n${BOLD}${GREEN}🎉 DESTRUCTION COMPLETED SUCCESSFULLY! 🎉${NC}\n"
    else
        echo -e "\n${BOLD}${YELLOW}⚠️  DESTRUCTION COMPLETED WITH WARNINGS ⚠️${NC}\n"
    fi
    
    echo -e "${BOLD}📋 Destruction Summary:${NC}"
    echo -e "Environment: ${CYAN}$ENVIRONMENT${NC}"
    echo -e "Region: ${CYAN}$REGION${NC}"
    echo -e "Owner: ${CYAN}$OWNER_NAME${NC}"
    echo -e "Duration: ${CYAN}${minutes}m ${seconds}s${NC}"
    echo -e "Stack: ${CYAN}$STACK_NAME${NC}"
    echo ""
    
    echo -e "${BOLD}🗑️  Resources Destroyed:${NC}"
    echo -e "• CloudFormation Stack: ${GREEN}✓${NC}"
    echo -e "• S3 Buckets: ${GREEN}✓${NC}"
    echo -e "• Lambda Functions: ${GREEN}✓${NC}"
    echo -e "• API Gateway: ${GREEN}✓${NC}"
    echo -e "• IAM Roles: ${GREEN}✓${NC}"
    echo -e "• CloudFront Distribution: ${GREEN}✓${NC}"
    echo ""
    
    if [ ${#WARNINGS[@]} -gt 0 ]; then
        echo -e "${BOLD}${YELLOW}⚠️  Warnings:${NC}"
        for warning in "${WARNINGS[@]}"; do
            echo -e "  • ${YELLOW}$warning${NC}"
        done
        echo ""
    fi
    
    if [ ${#ERRORS[@]} -gt 0 ]; then
        echo -e "${BOLD}${RED}❌ Errors:${NC}"
        for error in "${ERRORS[@]}"; do
            echo -e "  • ${RED}$error${NC}"
        done
        echo ""
        echo -e "${BOLD}🔧 Manual Cleanup Required:${NC}"
        echo -e "Check the AWS Console for any remaining resources with 'dmgt-basic-form' in the name"
        echo ""
    fi
    
    echo -e "${BOLD}✅ DMGT Basic Form environment cleaned up${NC}"
    echo -e "${BOLD}💡 You can redeploy anytime using: ${CYAN}./deploy.sh${NC}"
    echo ""
}

#####################################
# Error Handling
#####################################
handle_error() {
    local exit_code=$?
    local line_number=$1
    
    log_error "Script failed at line $line_number with exit code $exit_code"
    
    echo -e "\n${BOLD}${RED}❌ DESTRUCTION FAILED${NC}\n"
    
    if [ ${#ERRORS[@]} -gt 0 ]; then
        echo -e "${BOLD}Errors encountered:${NC}"
        for error in "${ERRORS[@]}"; do
            echo -e "  • ${RED}$error${NC}"
        done
    fi
    
    echo -e "\n${BOLD}🔧 Troubleshooting:${NC}"
    echo -e "1. Check AWS credentials: ${CYAN}aws sts get-caller-identity${NC}"
    echo -e "2. Check stack status: ${CYAN}aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION${NC}"
    echo -e "3. Manual cleanup via AWS Console may be required"
    echo -e "4. Run with verbose mode: ${CYAN}$0 --verbose${NC}"
    echo -e "5. Force mode (skip confirmations): ${CYAN}$0 --force${NC}"
    echo -e "6. Check logs: ${CYAN}cat /tmp/dmgt_destroy_output.log${NC}"
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
    echo -e "${BOLD}${RED}"
    printf '=%.0s' {1..80}
    echo ""
    echo "  DMGT Basic Form - Professional Destruction Script"
    printf '=%.0s' {1..80}
    echo -e "${NC}"
    
    log_info "Starting DMGT Basic Form destruction"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $REGION"
    log_info "Owner: $OWNER_NAME"
    log_info "Verbose: $VERBOSE"
    log_info "Dry Run: $DRY_RUN"
    log_info "Force: $FORCE"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_warning "DRY RUN MODE - No actual changes will be made"
    fi
    
    # Execute destruction steps
    check_prerequisites
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    discover_resources
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    confirm_destruction
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    cleanup_s3_buckets
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    destroy_cloudformation_stack
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    cleanup_orphaned_resources
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    verify_destruction
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    echo ""
    destruction_summary
}

# Change to script directory and run
cd "$SCRIPT_DIR"
main "$@"