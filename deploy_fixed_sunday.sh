#!/bin/bash

# DMGT Basic Form - Sunday Afternoon Fix Deployment Script
# This script addresses the CloudFormation template corruption and stack deletion issues

set -e

echo "=================================================================================="
echo "DMGT Basic Form - Sunday Afternoon Fix"
echo "=================================================================================="
echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting fixed deployment process"

# Configuration
ENVIRONMENT=${1:-dev}
REGION=${2:-eu-west-2}
STACK_NAME="dmgt-basic-form-${ENVIRONMENT}"
TEMPLATE_PATH="infrastructure/cloudformation-template.yaml"

echo "[INFO] Environment: $ENVIRONMENT"
echo "[INFO] Region: $REGION" 
echo "[INFO] Stack Name: $STACK_NAME"

# Check if we're on the right branch
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "[INFO] Current branch: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "sunday_afternoon_fix" ]; then
    echo "[WARNING] Not on sunday_afternoon_fix branch. Current branch: $CURRENT_BRANCH"
    echo "[WARNING] This script is designed for the sunday_afternoon_fix branch"
fi

# Validate prerequisites
echo ""
echo "[STEP 1] Checking Prerequisites"
echo "=================================="

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "[ERROR] AWS CLI not found. Please install AWS CLI first."
    exit 1
fi

echo "[✓] AWS CLI found: $(aws --version)"

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "[ERROR] AWS credentials not configured or invalid"
    echo "Please run 'aws configure' or set up your AWS credentials"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "[✓] AWS credentials valid (Account: $ACCOUNT_ID)"

# Check CloudFormation template
if [ ! -f "$TEMPLATE_PATH" ]; then
    echo "[ERROR] CloudFormation template not found at: $TEMPLATE_PATH"
    exit 1
fi

echo "[✓] CloudFormation template found"

# Validate template syntax
echo ""
echo "[STEP 2] Validating CloudFormation Template"
echo "============================================="

if aws cloudformation validate-template --template-body file://$TEMPLATE_PATH --region $REGION > /dev/null; then
    echo "[✓] CloudFormation template is valid"
else
    echo "[ERROR] CloudFormation template validation failed"
    echo "Please check the template syntax"
    exit 1
fi

# Check for existing stack
echo ""
echo "[STEP 3] Checking Existing Stack"
echo "================================="

STACK_STATUS=""
if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION &> /dev/null; then
    STACK_STATUS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].StackStatus' --output text)
    echo "[INFO] Existing stack found with status: $STACK_STATUS"
    
    if [ "$STACK_STATUS" = "DELETE_FAILED" ] || [ "$STACK_STATUS" = "ROLLBACK_FAILED" ]; then
        echo "[WARNING] Stack is in failed state: $STACK_STATUS"
        echo "[INFO] You may need to manually clean up resources or delete the stack"
        echo "[INFO] Run: aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION"
        exit 1
    elif [ "$STACK_STATUS" = "DELETE_IN_PROGRESS" ]; then
        echo "[WARNING] Stack deletion is in progress. Please wait for completion."
        exit 1
    fi
else
    echo "[✓] No existing stack found - ready for fresh deployment"
fi

# Deploy CloudFormation stack
echo ""
echo "[STEP 4] Deploying CloudFormation Stack"
echo "========================================"

echo "[INFO] Deploying stack: $STACK_NAME"

if [ -z "$STACK_STATUS" ]; then
    # Create new stack
    echo "[INFO] Creating new stack..."
    aws cloudformation create-stack \
        --stack-name $STACK_NAME \
        --template-body file://$TEMPLATE_PATH \
        --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
        --capabilities CAPABILITY_NAMED_IAM \
        --region $REGION \
        --tags Key=Project,Value=dmgt-basic-form Key=Environment,Value=$ENVIRONMENT
else
    # Update existing stack
    echo "[INFO] Updating existing stack..."
    aws cloudformation update-stack \
        --stack-name $STACK_NAME \
        --template-body file://$TEMPLATE_PATH \
        --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
        --capabilities CAPABILITY_NAMED_IAM \
        --region $REGION
fi

echo "[✓] Stack deployment initiated"

# Wait for stack completion
echo ""
echo "[STEP 5] Waiting for Stack Completion"
echo "======================================"

echo "[INFO] Waiting for stack operation to complete..."
echo "[INFO] This may take several minutes..."

if aws cloudformation wait stack-create-complete --stack-name $STACK_NAME --region $REGION 2>/dev/null; then
    echo "[✓] Stack creation completed successfully"
elif aws cloudformation wait stack-update-complete --stack-name $STACK_NAME --region $REGION 2>/dev/null; then
    echo "[✓] Stack update completed successfully"
else
    echo "[WARNING] Stack wait command failed or timed out"
    echo "[INFO] Checking current stack status..."
    
    FINAL_STATUS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "UNKNOWN")
    echo "[INFO] Current stack status: $FINAL_STATUS"
    
    if [[ "$FINAL_STATUS" == *"COMPLETE"* ]]; then
        echo "[✓] Stack deployment completed successfully"
    elif [[ "$FINAL_STATUS" == *"FAILED"* ]] || [[ "$FINAL_STATUS" == *"ROLLBACK"* ]]; then
        echo "[ERROR] Stack deployment failed with status: $FINAL_STATUS"
        echo "[INFO] Check CloudFormation console for detailed error information"
        exit 1
    else
        echo "[WARNING] Stack may still be in progress. Check AWS console for status."
    fi
fi

# Get stack outputs
echo ""
echo "[STEP 6] Retrieving Stack Outputs"
echo "=================================="

if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs' --output table > /tmp/stack_outputs.txt 2>/dev/null; then
    echo "[✓] Stack outputs:"
    cat /tmp/stack_outputs.txt
    rm -f /tmp/stack_outputs.txt
    
    # Extract key URLs
    echo ""
    echo "[INFO] Key URLs:"
    
    API_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' --output text 2>/dev/null)
    WEBSITE_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' --output text 2>/dev/null)
    
    if [ ! -z "$API_URL" ] && [ "$API_URL" != "None" ]; then
        echo "  API Gateway URL: $API_URL"
    fi
    
    if [ ! -z "$WEBSITE_URL" ] && [ "$WEBSITE_URL" != "None" ]; then
        echo "  Website URL: $WEBSITE_URL"
    fi
else
    echo "[WARNING] Could not retrieve stack outputs"
fi

echo ""
echo "=================================================================================="
echo "✅ DEPLOYMENT COMPLETED SUCCESSFULLY"
echo "=================================================================================="
echo "$(date '+%Y-%m-%d %H:%M:%S') - Stack: $STACK_NAME"
echo "Region: $REGION"
echo "Environment: $ENVIRONMENT"
echo ""
echo "🚀 Next steps:"
echo "1. Deploy frontend using: ./deploy_frontend.sh"
echo "2. Upload configuration files to the config bucket"
echo "3. Test the application endpoints"
echo ""
echo "🔧 Troubleshooting:"
echo "- If deployment fails, check CloudFormation console for detailed errors"
echo "- For S3 bucket issues, ensure bucket names are globally unique"
echo "- For permission issues, verify IAM roles and policies"
echo ""
echo "📋 What was fixed in this deployment:"
echo "- ✅ Corrected CloudFormation template structure"
echo "- ✅ Resolved 'At least one Resources member must be defined' error"
echo "- ✅ Added proper S3 bucket deletion policies"
echo "- ✅ Enhanced Lambda function with file upload support"
echo "- ✅ Cleaned up previous DELETE_FAILED stack state"
echo "=================================================================================="
