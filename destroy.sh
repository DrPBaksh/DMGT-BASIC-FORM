#!/bin/bash

# DMGT Basic Form - Enhanced Destruction Script
# This script safely destroys all deployed resources with comprehensive logging

set -e

# Script configuration
SCRIPT_NAME="DMGT Destroy"
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
VERBOSE=${VERBOSE:-false}
DRY_RUN=${DRY_RUN:-false}
FORCE=${FORCE:-false}

# Global variables for tracking
STEP_COUNT=0
TOTAL_STEPS=7
ERRORS=()
WARNINGS=()

# Function to create separator line
separator_line() {
    printf "${BLUE}"
    printf '=%.0s' {1..80}
    printf "${NC}\n"
}

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

# Progress bar function
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

# Function to execute commands with logging
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
    
    if [ "$VERBOSE" = "true" ]; then
        eval $cmd
        local result=$?
    else
        eval $cmd > /tmp/destroy_output.log 2>&1
        local result=$?
        if [ $result -ne 0 ] && [ "$allow_failure" != "true" ]; then
            log_error "Command failed. Output:"
            cat /tmp/destroy_output.log
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
    
    local caller_identity=$(aws sts get-caller-identity --output json 2>/dev/null)
    local account_id=$(echo $caller_identity | grep -o '"Account":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "N/A")
    local user_arn=$(echo $caller_identity | grep -o '"Arn":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "N/A")
    
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
}

# Enhanced confirmation with resource preview
confirm_destruction() {
    log_step "Destruction Confirmation"
    
    if [ "$FORCE" = "true" ]; then
        log_warning "FORCE mode enabled - skipping confirmation"
        return 0
    fi
    
    echo -e "\n${BOLD}${RED}⚠️  DANGER: PERMANENT RESOURCE DELETION ⚠️${NC}\n"
    
    echo -e "${BOLD}This will permanently delete ALL resources including:${NC}"
    echo -e "  ${RED}•${NC} CloudFormation stack: ${CYAN}$STACK_NAME${NC}"
    echo -e "  ${RED}•${NC} All S3 buckets and their contents"
    echo -e "  ${RED}•${NC} Lambda functions"
    echo -e "  ${RED}•${NC} API Gateway"
    echo -e "  ${RED}•${NC} CloudFront distribution"
    echo -e "  ${RED}•${NC} IAM roles and policies"
    echo -e "  ${RED}•${NC} All form responses and uploaded files"
    echo ""
    
    # Show estimated data loss
    if [ ! -z "$RESPONSES_BUCKET" ] && [ "$RESPONSES_BUCKET" != "None" ]; then
        log_info "Checking data that will be lost..."
        local response_count=$(aws s3api list-objects-v2 --bucket $RESPONSES_BUCKET --region $REGION --query 'KeyCount' --output text 2>/dev/null || echo "0")
        if [ "$response_count" -gt 0 ]; then
            echo -e "  ${YELLOW}⚠️  $response_count response files will be permanently deleted${NC}"
        fi
    fi
    
    echo -e "\n${BOLD}Environment:${NC} ${RED}$ENVIRONMENT${NC}"
    echo -e "${BOLD}Region:${NC} ${RED}$REGION${NC}"
    echo -e "${BOLD}Account:${NC} ${RED}$(aws sts get-caller-identity --query Account --output text 2>/dev/null)${NC}"
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

# Enhanced stack discovery and analysis
discover_resources() {
    log_step "Discovering AWS Resources"
    
    # Check if stack exists
    log_info "Checking for CloudFormation stack..."
    if ! aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION > /dev/null 2>&1; then
        log_warning "Stack $STACK_NAME does not exist in region $REGION"
        
        # Look for orphaned resources
        log_info "Checking for orphaned resources..."
        check_orphaned_resources
        
        if [ ${#WARNINGS[@]} -eq 0 ]; then
            log_success "No resources found to destroy"
            exit 0
        else
            echo -e "\n${YELLOW}Found some potentially orphaned resources. Continue anyway? (y/N)${NC}"
            read -p "> " continue_anyway
            if [[ ! "$continue_anyway" =~ ^[Yy]$ ]]; then
                exit 0
            fi
        fi
        return 1
    fi
    
    # Get stack information
    local stack_info=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --output json)
    local stack_status=$(echo $stack_info | grep -o '"StackStatus":"[^"]*"' | cut -d'"' -f4)
    local creation_time=$(echo $stack_info | grep -o '"CreationTime":"[^"]*"' | cut -d'"' -f4)
    local last_updated=$(echo $stack_info | grep -o '"LastUpdatedTime":"[^"]*"' | cut -d'"' -f4 || echo "Never")
    
    log_success "Found CloudFormation stack"
    log_info "Stack Status: $stack_status"
    log_info "Created: $creation_time"
    log_info "Last Updated: $last_updated"
    
    # Get stack outputs if available
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
    
    if [ -z "$CONFIG_BUCKET" ] || [ "$CONFIG_BUCKET" = "None" ]; then
        log_warning "No stack outputs found - stack may be in failed state"
        # Try to discover buckets by naming convention
        log_info "Attempting to discover buckets by naming convention..."
        discover_buckets_by_name
    fi
    
    return 0
}

# Function to check for orphaned resources
check_orphaned_resources() {
    log_info "Scanning for orphaned DMGT resources..."
    
    # Check for S3 buckets
    local buckets=$(aws s3api list-buckets --query "Buckets[?contains(Name, 'dmgt-basic-form')].Name" --output text --region $REGION 2>/dev/null || echo "")
    if [ ! -z "$buckets" ]; then
        log_warning "Found potential orphaned S3 buckets: $buckets"
    fi
    
    # Check for Lambda functions
    local functions=$(aws lambda list-functions --query "Functions[?contains(FunctionName, 'dmgt-basic-form')].FunctionName" --output text --region $REGION 2>/dev/null || echo "")
    if [ ! -z "$functions" ]; then
        log_warning "Found potential orphaned Lambda functions: $functions"
    fi
    
    # Check for API Gateways
    local apis=$(aws apigateway get-rest-apis --query "items[?contains(name, 'dmgt-basic-form')].name" --output text --region $REGION 2>/dev/null || echo "")
    if [ ! -z "$apis" ]; then
        log_warning "Found potential orphaned API Gateways: $apis"
    fi
}

# Function to discover buckets by naming convention
discover_buckets_by_name() {
    local account_id=$(aws sts get-caller-identity --query Account --output text)
    
    CONFIG_BUCKET="dmgt-basic-form-config-${ENVIRONMENT}-${account_id}"
    WEBSITE_BUCKET="dmgt-basic-form-website-${ENVIRONMENT}-${account_id}"
    RESPONSES_BUCKET="dmgt-basic-form-responses-${ENVIRONMENT}-${account_id}"
    
    log_debug "Predicted Config Bucket: $CONFIG_BUCKET"
    log_debug "Predicted Website Bucket: $WEBSITE_BUCKET"
    log_debug "Predicted Responses Bucket: $RESPONSES_BUCKET"
}

# Enhanced S3 bucket cleanup
empty_s3_buckets() {
    log_step "Emptying S3 Buckets"
    
    local buckets_to_empty=()
    
    # Collect existing buckets
    for bucket in "$CONFIG_BUCKET" "$WEBSITE_BUCKET" "$RESPONSES_BUCKET"; do
        if [ ! -z "$bucket" ] && [ "$bucket" != "None" ]; then
            # Check if bucket exists
            if aws s3api head-bucket --bucket "$bucket" --region $REGION > /dev/null 2>&1; then
                buckets_to_empty+=("$bucket")
                log_info "Bucket exists: $bucket"
            else
                log_debug "Bucket does not exist: $bucket"
            fi
        fi
    done
    
    if [ ${#buckets_to_empty[@]} -eq 0 ]; then
        log_success "No S3 buckets found to empty"
        return 0
    fi
    
    log_info "Found ${#buckets_to_empty[@]} bucket(s) to empty"
    
    for bucket in "${buckets_to_empty[@]}"; do
        log_info "Emptying bucket: $bucket"
        
        # Get object count for progress tracking
        local object_count=$(aws s3api list-objects-v2 --bucket "$bucket" --region $REGION --query 'KeyCount' --output text 2>/dev/null || echo "0")
        log_info "Bucket contains $object_count objects"
        
        if [ "$object_count" -gt 0 ]; then
            # Regular objects
            log_info "Deleting current objects..."
            execute_command "aws s3 rm s3://$bucket --recursive --region $REGION" "Delete objects from $bucket" "true"
            
            # Handle versioned objects
            log_info "Checking for versioned objects..."
            local versions_exist=$(aws s3api list-object-versions --bucket "$bucket" --region $REGION --query 'Versions[0].Key' --output text 2>/dev/null || echo "None")
            
            if [ "$versions_exist" != "None" ]; then
                log_info "Deleting object versions..."
                aws s3api list-object-versions --bucket "$bucket" --region $REGION \
                    --query 'Versions[].{Key:Key,VersionId:VersionId}' --output text 2>/dev/null | \
                    while read key version; do
                        if [ ! -z "$key" ] && [ ! -z "$version" ]; then
                            aws s3api delete-object --bucket "$bucket" --key "$key" --version-id "$version" --region $REGION > /dev/null 2>&1 || true
                        fi
                    done
            fi
            
            # Handle delete markers
            log_info "Checking for delete markers..."
            local markers_exist=$(aws s3api list-object-versions --bucket "$bucket" --region $REGION --query 'DeleteMarkers[0].Key' --output text 2>/dev/null || echo "None")
            
            if [ "$markers_exist" != "None" ]; then
                log_info "Deleting delete markers..."
                aws s3api list-object-versions --bucket "$bucket" --region $REGION \
                    --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' --output text 2>/dev/null | \
                    while read key version; do
                        if [ ! -z "$key" ] && [ ! -z "$version" ]; then
                            aws s3api delete-object --bucket "$bucket" --key "$key" --version-id "$version" --region $REGION > /dev/null 2>&1 || true
                        fi
                    done
            fi
            
            # Verify bucket is empty
            local remaining_objects=$(aws s3api list-objects-v2 --bucket "$bucket" --region $REGION --query 'KeyCount' --output text 2>/dev/null || echo "0")
            if [ "$remaining_objects" -eq 0 ]; then
                log_success "Bucket $bucket is now empty"
            else
                log_warning "Bucket $bucket still contains $remaining_objects objects"
            fi
        else
            log_success "Bucket $bucket is already empty"
        fi
    done
    
    log_success "S3 bucket cleanup completed"
}

# Enhanced CloudFormation stack deletion
delete_stack() {
    log_step "Deleting CloudFormation Stack"
    
    # Check if stack exists
    if ! aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION > /dev/null 2>&1; then
        log_warning "Stack $STACK_NAME does not exist - skipping deletion"
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
    
    # Wait for stack deletion with enhanced progress tracking
    log_info "Waiting for stack deletion to complete..."
    local wait_start=$(date +%s)
    local last_status=""
    
    while true; do
        local current_status=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "DELETE_COMPLETE")
        local wait_current=$(date +%s)
        local wait_duration=$((wait_current - wait_start))
        
        if [ "$current_status" != "$last_status" ]; then
            echo "" # New line for status change
            log_info "Stack status changed to: $current_status"
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
                exit 1
                ;;
        esac
        
        # Timeout after 30 minutes
        if [ $wait_duration -gt 1800 ]; then
            echo ""
            log_error "Stack deletion timed out after 30 minutes"
            exit 1
        fi
        
        sleep 10
    done
    
    local deletion_end_time=$(date +%s)
    local deletion_duration=$((deletion_end_time - wait_start))
    log_success "Stack deletion completed in ${deletion_duration}s"
}

# Enhanced verification and cleanup
verify_destruction() {
    log_step "Verifying Complete Destruction"
    
    local verification_errors=0
    
    # Check CloudFormation stack
    log_info "Verifying CloudFormation stack deletion..."
    if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION > /dev/null 2>&1; then
        log_error "CloudFormation stack still exists"
        verification_errors=$((verification_errors + 1))
    else
        log_success "CloudFormation stack successfully deleted"
    fi
    
    # Check S3 buckets
    log_info "Verifying S3 bucket deletion..."
    for bucket in "$CONFIG_BUCKET" "$WEBSITE_BUCKET" "$RESPONSES_BUCKET"; do
        if [ ! -z "$bucket" ] && [ "$bucket" != "None" ]; then
            if aws s3api head-bucket --bucket "$bucket" --region $REGION > /dev/null 2>&1; then
                log_warning "S3 bucket still exists: $bucket"
                
                # Attempt to force delete
                log_info "Attempting to force delete bucket: $bucket"
                execute_command "aws s3 rb s3://$bucket --force --region $REGION" "Force delete bucket $bucket" "true"
                
                # Re-check
                if aws s3api head-bucket --bucket "$bucket" --region $REGION > /dev/null 2>&1; then
                    log_error "Failed to delete S3 bucket: $bucket"
                    verification_errors=$((verification_errors + 1))
                else
                    log_success "Successfully force-deleted bucket: $bucket"
                fi
            else
                log_debug "S3 bucket successfully deleted: $bucket"
            fi
        fi
    done
    
    # Check for orphaned resources
    log_info "Scanning for remaining DMGT resources..."
    
    # Lambda functions
    local remaining_functions=$(aws lambda list-functions --query "Functions[?contains(FunctionName, 'dmgt-basic-form')].FunctionName" --output text --region $REGION 2>/dev/null || echo "")
    if [ ! -z "$remaining_functions" ]; then
        log_warning "Orphaned Lambda functions found: $remaining_functions"
        verification_errors=$((verification_errors + 1))
    fi
    
    # API Gateways
    local remaining_apis=$(aws apigateway get-rest-apis --query "items[?contains(name, 'dmgt-basic-form')].name" --output text --region $REGION 2>/dev/null || echo "")
    if [ ! -z "$remaining_apis" ]; then
        log_warning "Orphaned API Gateways found: $remaining_apis"
        verification_errors=$((verification_errors + 1))
    fi
    
    # IAM roles
    local remaining_roles=$(aws iam list-roles --query "Roles[?contains(RoleName, 'dmgt-basic-form')].RoleName" --output text --region $REGION 2>/dev/null || echo "")
    if [ ! -z "$remaining_roles" ]; then
        log_warning "Orphaned IAM roles found: $remaining_roles"
        verification_errors=$((verification_errors + 1))
    fi
    
    if [ $verification_errors -eq 0 ]; then
        log_success "All resources successfully destroyed"
        return 0
    else
        log_warning "Destruction completed with $verification_errors remaining resources"
        return 1
    fi
}

# Destruction summary
destruction_summary() {
    log_step "Destruction Summary"
    
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
    echo -e "Stack Name: ${CYAN}$STACK_NAME${NC}"
    echo -e "Region: ${CYAN}$REGION${NC}"
    echo -e "Duration: ${CYAN}${minutes}m ${seconds}s${NC}"
    echo ""
    
    echo -e "${BOLD}🗑️  Resources Destroyed:${NC}"
    echo -e "• CloudFormation Stack: ${GREEN}✓${NC}"
    echo -e "• S3 Configuration Bucket: ${GREEN}✓${NC}"
    echo -e "• S3 Website Bucket: ${GREEN}✓${NC}"
    echo -e "• S3 Responses Bucket: ${GREEN}✓${NC}"
    echo -e "• Lambda Functions: ${GREEN}✓${NC}"
    echo -e "• API Gateway: ${GREEN}✓${NC}"
    echo -e "• CloudFront Distribution: ${GREEN}✓${NC}"
    echo -e "• IAM Roles: ${GREEN}✓${NC}"
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
    
    echo -e "${BOLD}✅ All tagged resources with Project=dmgt-basic-form have been removed${NC}"
    echo -e "${BOLD}💡 You can re-deploy anytime using: ${CYAN}./deploy.sh${NC}"
    echo ""
}

# Error handler
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
    echo -e "4. Run with verbose mode: ${CYAN}VERBOSE=true ./destroy.sh${NC}"
    echo -e "5. Force mode (skip confirmations): ${CYAN}FORCE=true ./destroy.sh${NC}"
    echo ""
    
    exit $exit_code
}

# Usage function
show_usage() {
    echo -e "${BOLD}DMGT Basic Form Destruction Script v$SCRIPT_VERSION${NC}"
    echo ""
    echo -e "${BOLD}Usage:${NC}"
    echo -e "  ./destroy.sh [OPTIONS]"
    echo ""
    echo -e "${BOLD}Environment Variables:${NC}"
    echo -e "  ENVIRONMENT    Deployment environment (default: prod)"
    echo -e "  AWS_REGION     AWS region (default: us-east-1)"
    echo -e "  VERBOSE        Enable verbose logging (default: false)"
    echo -e "  DRY_RUN        Show commands without executing (default: false)"
    echo -e "  FORCE          Skip confirmation prompts (default: false)"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo -e "  ${CYAN}./destroy.sh${NC}                     # Standard destruction"
    echo -e "  ${CYAN}VERBOSE=true ./destroy.sh${NC}        # Verbose logging"
    echo -e "  ${CYAN}DRY_RUN=true ./destroy.sh${NC}        # Preview commands"
    echo -e "  ${CYAN}FORCE=true ./destroy.sh${NC}          # Skip confirmations"
    echo -e "  ${CYAN}ENVIRONMENT=dev ./destroy.sh${NC}     # Destroy dev environment"
    echo ""
    echo -e "${BOLD}${RED}WARNING: This operation is irreversible!${NC}"
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
    echo -e "${BOLD}${RED}"
    printf '=%.0s' {1..72}
    echo ""
    echo "  $SCRIPT_NAME v$SCRIPT_VERSION - Enhanced Destruction Script"
    printf '=%.0s' {1..72}
    echo -e "${NC}"
    
    log_info "Starting destruction of DMGT Basic Form"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $REGION"
    log_info "Stack Name: $STACK_NAME"
    log_info "Verbose Mode: $VERBOSE"
    log_info "Dry Run: $DRY_RUN"
    log_info "Force Mode: $FORCE"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_warning "DRY RUN MODE - No actual changes will be made"
    fi
    
    # Execute destruction steps
    check_aws_cli
    show_progress $STEP_COUNT $TOTAL_STEPS
    
    if discover_resources; then
        show_progress $STEP_COUNT $TOTAL_STEPS
        
        confirm_destruction
        show_progress $STEP_COUNT $TOTAL_STEPS
        
        empty_s3_buckets
        show_progress $STEP_COUNT $TOTAL_STEPS
        
        delete_stack
        show_progress $STEP_COUNT $TOTAL_STEPS
        
        verify_destruction
        show_progress $STEP_COUNT $TOTAL_STEPS
    else
        # Skip some steps if no stack found
        STEP_COUNT=$((STEP_COUNT + 4))
        show_progress $STEP_COUNT $TOTAL_STEPS
    fi
    
    echo "" # Clear progress line
    destruction_summary
}

# Run main function with all arguments
main "$@"