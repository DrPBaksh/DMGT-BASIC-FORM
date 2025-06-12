#!/bin/bash

# DMGT Basic Form - Destruction Script
# This script safely destroys all deployed resources

set -e

# Configuration
ENVIRONMENT=${ENVIRONMENT:-prod}
STACK_NAME="dmgt-basic-form-${ENVIRONMENT}"
REGION=${AWS_REGION:-us-east-1}

echo "🗑️  Starting destruction of DMGT Basic Form..."
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

# Function to confirm destruction
confirm_destruction() {
    echo ""
    echo "⚠️  WARNING: This will permanently delete ALL resources including:"
    echo "   - CloudFormation stack: $STACK_NAME"
    echo "   - All S3 buckets and their contents"
    echo "   - Lambda functions"
    echo "   - API Gateway"
    echo "   - CloudFront distribution"
    echo "   - All form responses and uploaded files"
    echo ""
    read -p "Are you sure you want to proceed? Type 'DELETE' to confirm: " confirmation
    
    if [ "$confirmation" != "DELETE" ]; then
        echo "❌ Destruction cancelled"
        exit 1
    fi
    
    echo "✅ Destruction confirmed"
}

# Function to get bucket names before deletion
get_bucket_names() {
    echo "📋 Getting bucket names..."
    
    # Check if stack exists
    aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "⚠️  Stack $STACK_NAME does not exist in region $REGION"
        return 1
    fi
    
    CONFIG_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='ConfigBucketName'].OutputValue" \
        --output text 2>/dev/null)
    
    WEBSITE_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='WebsiteBucketName'].OutputValue" \
        --output text 2>/dev/null)
    
    RESPONSES_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='ResponsesBucketName'].OutputValue" \
        --output text 2>/dev/null)
    
    echo "Config Bucket: $CONFIG_BUCKET"
    echo "Website Bucket: $WEBSITE_BUCKET"
    echo "Responses Bucket: $RESPONSES_BUCKET"
    
    return 0
}

# Function to empty S3 buckets
empty_s3_buckets() {
    echo "🗂️  Emptying S3 buckets..."
    
    # Empty config bucket
    if [ "$CONFIG_BUCKET" != "None" ] && [ ! -z "$CONFIG_BUCKET" ]; then
        echo "Emptying config bucket: $CONFIG_BUCKET"
        aws s3 rm s3://$CONFIG_BUCKET --recursive --region $REGION 2>/dev/null || true
        
        # Delete all versions if versioning is enabled
        aws s3api list-object-versions --bucket $CONFIG_BUCKET --region $REGION \
            --query 'Versions[].{Key:Key,VersionId:VersionId}' --output text | \
            while read key version; do
                aws s3api delete-object --bucket $CONFIG_BUCKET --key "$key" --version-id "$version" --region $REGION 2>/dev/null || true
            done
        
        # Delete delete markers
        aws s3api list-object-versions --bucket $CONFIG_BUCKET --region $REGION \
            --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' --output text | \
            while read key version; do
                aws s3api delete-object --bucket $CONFIG_BUCKET --key "$key" --version-id "$version" --region $REGION 2>/dev/null || true
            done
    fi
    
    # Empty website bucket
    if [ "$WEBSITE_BUCKET" != "None" ] && [ ! -z "$WEBSITE_BUCKET" ]; then
        echo "Emptying website bucket: $WEBSITE_BUCKET"
        aws s3 rm s3://$WEBSITE_BUCKET --recursive --region $REGION 2>/dev/null || true
        
        # Delete all versions if versioning is enabled
        aws s3api list-object-versions --bucket $WEBSITE_BUCKET --region $REGION \
            --query 'Versions[].{Key:Key,VersionId:VersionId}' --output text | \
            while read key version; do
                aws s3api delete-object --bucket $WEBSITE_BUCKET --key "$key" --version-id "$version" --region $REGION 2>/dev/null || true
            done
        
        # Delete delete markers
        aws s3api list-object-versions --bucket $WEBSITE_BUCKET --region $REGION \
            --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' --output text | \
            while read key version; do
                aws s3api delete-object --bucket $WEBSITE_BUCKET --key "$key" --version-id "$version" --region $REGION 2>/dev/null || true
            done
    fi
    
    # Empty responses bucket
    if [ "$RESPONSES_BUCKET" != "None" ] && [ ! -z "$RESPONSES_BUCKET" ]; then
        echo "Emptying responses bucket: $RESPONSES_BUCKET"
        aws s3 rm s3://$RESPONSES_BUCKET --recursive --region $REGION 2>/dev/null || true
        
        # Delete all versions if versioning is enabled
        aws s3api list-object-versions --bucket $RESPONSES_BUCKET --region $REGION \
            --query 'Versions[].{Key:Key,VersionId:VersionId}' --output text | \
            while read key version; do
                aws s3api delete-object --bucket $RESPONSES_BUCKET --key "$key" --version-id "$version" --region $REGION 2>/dev/null || true
            done
        
        # Delete delete markers
        aws s3api list-object-versions --bucket $RESPONSES_BUCKET --region $REGION \
            --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' --output text | \
            while read key version; do
                aws s3api delete-object --bucket $RESPONSES_BUCKET --key "$key" --version-id "$version" --region $REGION 2>/dev/null || true
            done
    fi
    
    echo "✅ S3 buckets emptied"
}

# Function to delete CloudFormation stack
delete_stack() {
    echo "🗑️  Deleting CloudFormation stack..."
    
    aws cloudformation delete-stack \
        --stack-name $STACK_NAME \
        --region $REGION
    
    echo "⏳ Waiting for stack deletion to complete..."
    aws cloudformation wait stack-delete-complete \
        --stack-name $STACK_NAME \
        --region $REGION
    
    if [ $? -eq 0 ]; then
        echo "✅ Stack deleted successfully"
    else
        echo "❌ Stack deletion failed or timed out"
        echo "Please check the AWS Console for more details"
        exit 1
    fi
}

# Function to verify destruction
verify_destruction() {
    echo "🔍 Verifying destruction..."
    
    # Check if stack still exists
    aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "⚠️  Stack still exists - destruction may not be complete"
        return 1
    else
        echo "✅ Stack successfully destroyed"
        return 0
    fi
}

# Function to clean up any remaining resources (backup)
cleanup_remaining_resources() {
    echo "🧹 Cleaning up any remaining resources..."
    
    # Try to delete buckets directly if they still exist
    for bucket in $CONFIG_BUCKET $WEBSITE_BUCKET $RESPONSES_BUCKET; do
        if [ "$bucket" != "None" ] && [ ! -z "$bucket" ]; then
            aws s3api head-bucket --bucket $bucket --region $REGION > /dev/null 2>&1
            if [ $? -eq 0 ]; then
                echo "Removing remaining bucket: $bucket"
                aws s3 rb s3://$bucket --force --region $REGION 2>/dev/null || true
            fi
        fi
    done
    
    echo "✅ Cleanup completed"
}

# Main execution
main() {
    echo "========================================"
    echo "  DMGT Basic Form Destruction Script"
    echo "========================================"
    
    check_aws_cli
    
    # Get bucket names first (before confirmation)
    get_bucket_names
    if [ $? -ne 0 ]; then
        echo "✅ No stack found - nothing to destroy"
        exit 0
    fi
    
    confirm_destruction
    empty_s3_buckets
    delete_stack
    
    # Verify and cleanup
    if ! verify_destruction; then
        cleanup_remaining_resources
    fi
    
    echo ""
    echo "🎉 Destruction completed successfully!"
    echo ""
    echo "📋 Destruction Summary:"
    echo "Environment: $ENVIRONMENT"
    echo "Stack Name: $STACK_NAME"
    echo "Region: $REGION"
    echo ""
    echo "✅ All resources have been destroyed"
    echo "💡 You can re-deploy anytime using ./deploy.sh"
}

# Run main function
main "$@"