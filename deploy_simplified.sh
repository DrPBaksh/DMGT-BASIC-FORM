#!/bin/bash

# DMGT Basic Form - Simplified Deployment Script
# This script deploys the new simplified form system

set -e

# Configuration
STACK_NAME="dmgt-basic-form-dev"
TEMPLATE_FILE="infrastructure/cloudformation-template.yaml"
ENVIRONMENT="dev"
REGION="us-east-1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== DMGT Basic Form - Simplified Deployment ===${NC}"
echo -e "${BLUE}Stack Name: ${STACK_NAME}${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Region: ${REGION}${NC}"
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS CLI not configured or no valid credentials found${NC}"
    echo "Please run: aws configure"
    exit 1
fi

# Check if template file exists
if [ ! -f "$TEMPLATE_FILE" ]; then
    echo -e "${RED}Error: CloudFormation template not found: $TEMPLATE_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}Validating CloudFormation template...${NC}"
aws cloudformation validate-template --template-body file://$TEMPLATE_FILE --region $REGION

# Check if stack exists
STACK_EXISTS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION 2>/dev/null | jq -r '.Stacks[0].StackStatus' || echo "DOES_NOT_EXIST")

if [ "$STACK_EXISTS" = "DOES_NOT_EXIST" ]; then
    echo -e "${GREEN}Creating new CloudFormation stack: $STACK_NAME${NC}"
    
    aws cloudformation create-stack \
        --stack-name $STACK_NAME \
        --template-body file://$TEMPLATE_FILE \
        --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
        --capabilities CAPABILITY_NAMED_IAM \
        --region $REGION \
        --tags Key=Project,Value=dmgt-basic-form Key=Environment,Value=$ENVIRONMENT
    
    echo -e "${YELLOW}Waiting for stack creation to complete...${NC}"
    aws cloudformation wait stack-create-complete --stack-name $STACK_NAME --region $REGION
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Stack created successfully!${NC}"
    else
        echo -e "${RED}❌ Stack creation failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}Stack $STACK_NAME already exists with status: $STACK_EXISTS${NC}"
    echo -e "${YELLOW}Updating existing stack...${NC}"
    
    UPDATE_OUTPUT=$(aws cloudformation update-stack \
        --stack-name $STACK_NAME \
        --template-body file://$TEMPLATE_FILE \
        --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
        --capabilities CAPABILITY_NAMED_IAM \
        --region $REGION 2>&1) || true
    
    if echo "$UPDATE_OUTPUT" | grep -q "No updates are to be performed"; then
        echo -e "${GREEN}✅ No updates needed - stack is already up to date${NC}"
    else
        echo -e "${YELLOW}Waiting for stack update to complete...${NC}"
        aws cloudformation wait stack-update-complete --stack-name $STACK_NAME --region $REGION
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Stack updated successfully!${NC}"
        else
            echo -e "${RED}❌ Stack update failed${NC}"
            exit 1
        fi
    fi
fi

# Get stack outputs
echo -e "${BLUE}Getting stack outputs...${NC}"
OUTPUTS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs' --output table)

echo ""
echo -e "${GREEN}=== Stack Outputs ===${NC}"
echo "$OUTPUTS"

# Get API Gateway URL specifically
API_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' --output text)
WEBSITE_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' --output text)

if [ -n "$API_URL" ]; then
    echo ""
    echo -e "${GREEN}=== Important URLs ===${NC}"
    echo -e "${BLUE}API Gateway URL: ${NC}$API_URL"
    if [ -n "$WEBSITE_URL" ]; then
        echo -e "${BLUE}Website URL: ${NC}$WEBSITE_URL"
    fi
    
    # Update frontend environment file
    echo ""
    echo -e "${YELLOW}Updating frontend environment configuration...${NC}"
    
    # Create/update .env.production file
    cat > frontend/.env.production << EOF
REACT_APP_API_URL=$API_URL
GENERATE_SOURCEMAP=false
EOF
    
    echo -e "${GREEN}✅ Environment file updated: frontend/.env.production${NC}"
fi

echo ""
echo -e "${GREEN}=== Next Steps ===${NC}"
echo -e "${BLUE}1. Build and deploy the frontend:${NC}"
echo "   cd frontend"
echo "   npm install"
echo "   npm run build"
echo ""
echo -e "${BLUE}2. Deploy to S3:${NC}"
echo "   ./deploy_frontend.sh"
echo ""
echo -e "${GREEN}✅ Infrastructure deployment complete!${NC}"