# Script Usage Guide - Enhanced Deploy & Destroy Scripts

## 🚀 **Enhanced Scripts Overview**

Both `deploy.sh` and `destroy.sh` have been significantly enhanced with comprehensive logging, error handling, and debugging capabilities to provide maximum visibility into the deployment process.

## 📊 **New Features**

### **1. Color-Coded Logging**
- **🔵 INFO**: General information messages
- **🟢 SUCCESS**: Successful operations
- **🟡 WARNING**: Non-critical issues
- **🔴 ERROR**: Critical failures
- **🟣 DEBUG**: Detailed debugging info (verbose mode only)

### **2. Timestamped Messages**
Every log message includes a timestamp in format: `YYYY-MM-DD HH:MM:SS`

### **3. Progress Tracking**
- Step counter: `[STEP X/Y]`
- Progress bar for overall completion
- Duration tracking for each operation
- Real-time status updates

### **4. Enhanced Error Handling**
- Detailed error messages with context
- Troubleshooting suggestions
- Graceful failure handling
- Error aggregation and reporting

## 🛠️ **Usage Examples**

### **Deploy Script**

#### **Standard Deployment**
```bash
./deploy.sh
```

#### **Verbose Mode (Detailed Logging)**
```bash
VERBOSE=true ./deploy.sh
```

#### **Dry Run (Preview Only)**
```bash
DRY_RUN=true ./deploy.sh
```

#### **Different Environment**
```bash
ENVIRONMENT=dev ./deploy.sh
```

#### **Different Region**
```bash
AWS_REGION=eu-west-1 ./deploy.sh
```

#### **Combined Options**
```bash
VERBOSE=true ENVIRONMENT=staging AWS_REGION=eu-west-1 ./deploy.sh
```

### **Destroy Script**

#### **Standard Destruction**
```bash
./destroy.sh
```

#### **Force Mode (Skip Confirmations)**
```bash
FORCE=true ./destroy.sh
```

#### **Verbose Destruction**
```bash
VERBOSE=true ./destroy.sh
```

#### **Dry Run Destruction**
```bash
DRY_RUN=true ./destroy.sh
```

## 📋 **Environment Variables**

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVIRONMENT` | `prod` | Deployment environment (dev/staging/prod) |
| `AWS_REGION` | `us-east-1` | AWS region for deployment |
| `VERBOSE` | `false` | Enable detailed debug logging |
| `DRY_RUN` | `false` | Preview commands without executing |
| `FORCE` | `false` | Skip confirmation prompts (destroy only) |

## 🔍 **Debugging Features**

### **1. Verbose Mode**
When `VERBOSE=true`, you'll see:
- All AWS CLI commands being executed
- Detailed API responses
- Step-by-step progress
- CloudFormation changeset details
- S3 upload progress
- File sizes and counts

### **2. Pre-flight Checks**
The deploy script now performs comprehensive checks:
- ✅ AWS CLI installation and version
- ✅ AWS credentials validation
- ✅ Region connectivity
- ✅ Node.js and npm versions
- ✅ Required files existence
- ✅ Existing stack status
- ✅ IAM permissions verification

### **3. Enhanced CloudFormation Handling**
- Template validation before deployment
- Changeset creation and review
- Real-time status monitoring
- Detailed failure analysis
- Stack event inspection

### **4. S3 Bucket Management**
- Bucket existence verification
- Object counting and size reporting
- Versioning handling
- Upload progress tracking
- Delete marker cleanup

## 📱 **Sample Output**

### **Deploy Script Output**
```bash
========================================
  DMGT Deploy v2.0 - Enhanced Deployment Script
========================================

[INFO] 2025-06-12 14:15:30 - Starting deployment of DMGT Basic Form
[INFO] 2025-06-12 14:15:30 - Environment: prod
[INFO] 2025-06-12 14:15:30 - Region: us-east-1
[INFO] 2025-06-12 14:15:30 - Stack Name: dmgt-basic-form-prod

[STEP 1/8] 2025-06-12 14:15:31 - Checking AWS CLI Prerequisites
================================================================================
[SUCCESS] 2025-06-12 14:15:31 - AWS CLI found: aws-cli/2.15.30
[INFO] 2025-06-12 14:15:31 - Checking AWS credentials...
[SUCCESS] 2025-06-12 14:15:32 - AWS credentials valid
[INFO] 2025-06-12 14:15:32 - Using AWS region: us-east-1
[SUCCESS] 2025-06-12 14:15:33 - Region connectivity verified

Progress: [==============================] 100% (8/8)

🎉 DEPLOYMENT COMPLETED SUCCESSFULLY! 🎉

📋 Deployment Summary:
Environment: prod
Stack Name: dmgt-basic-form-prod
Region: us-east-1
Duration: 8m 45s

🌐 Access URLs:
Website: https://d123456789.cloudfront.net
API: https://abcdef123.execute-api.us-east-1.amazonaws.com/prod
```

### **Destroy Script Output**
```bash
========================================
  DMGT Destroy v2.0 - Enhanced Destruction Script
========================================

⚠️  DANGER: PERMANENT RESOURCE DELETION ⚠️

This will permanently delete ALL resources including:
  • CloudFormation stack: dmgt-basic-form-prod
  • All S3 buckets and their contents
  • Lambda functions
  • API Gateway
  • CloudFront distribution
  • IAM roles and policies
  • All form responses and uploaded files

  ⚠️  15 response files will be permanently deleted

Environment: prod
Region: us-east-1
Account: 123456789012

This action CANNOT be undone!

Are you absolutely sure? Type 'DELETE' to confirm: DELETE
[WARNING] 2025-06-12 14:20:15 - Destruction confirmed - proceeding in 5 seconds...

[STEP 1/7] 2025-06-12 14:20:21 - Checking AWS CLI Prerequisites
[STEP 2/7] 2025-06-12 14:20:22 - Discovering AWS Resources
[STEP 3/7] 2025-06-12 14:20:23 - Destruction Confirmation
[STEP 4/7] 2025-06-12 14:20:24 - Emptying S3 Buckets
[STEP 5/7] 2025-06-12 14:20:45 - Deleting CloudFormation Stack
[STEP 6/7] 2025-06-12 14:25:12 - Verifying Complete Destruction

🎉 DESTRUCTION COMPLETED SUCCESSFULLY! 🎉
```

## 🚨 **Error Handling Examples**

### **Failed Deployment**
```bash
[ERROR] 2025-06-12 14:16:45 - Stack deployment failed with status: CREATE_FAILED

❌ DEPLOYMENT FAILED

Errors encountered:
  • Infrastructure deployment failed after 180s (exit code: 255)

🔧 Troubleshooting:
1. Check AWS credentials: aws sts get-caller-identity
2. Check region: aws configure get region
3. View stack events: aws cloudformation describe-stack-events --stack-name dmgt-basic-form-prod --region us-east-1
4. Run with verbose mode: VERBOSE=true ./deploy.sh
```

### **Resource Discovery Issues**
```bash
[WARNING] 2025-06-12 14:20:30 - Found potential orphaned S3 buckets: dmgt-basic-form-config-prod-123456789012
[WARNING] 2025-06-12 14:20:31 - Found potential orphaned Lambda functions: dmgt-basic-form-config-prod

Found some potentially orphaned resources. Continue anyway? (y/N)
```

## 🔧 **Troubleshooting Guide**

### **Common Issues and Solutions**

#### **1. AWS Credentials Issues**
```bash
[ERROR] AWS credentials not configured or invalid
```
**Solution**: 
```bash
aws configure
# or
aws sso login --profile your-profile
```

#### **2. Region Connectivity Issues**
```bash
[ERROR] Cannot connect to region eu-west-1
```
**Solution**:
```bash
AWS_REGION=us-east-1 ./deploy.sh
```

#### **3. Stack Already Exists in Failed State**
```bash
[ERROR] Stack is in a failed state: ROLLBACK_COMPLETE
```
**Solution**:
```bash
./destroy.sh  # Clean up failed stack
./deploy.sh   # Try deployment again
```

#### **4. S3 Bucket Name Conflicts**
```bash
[ERROR] S3 bucket already exists: dmgt-basic-form-config-prod-123456789012
```
**Solution**: The template handles this with account ID suffix, but if it persists:
```bash
# Check for existing buckets
aws s3 ls | grep dmgt-basic-form
# Delete conflicting buckets if they're yours
aws s3 rb s3://bucket-name --force
```

### **Advanced Debugging**

#### **Enable Maximum Verbosity**
```bash
VERBOSE=true AWS_CLI_FILE_ENCODING=UTF-8 ./deploy.sh
```

#### **Check CloudFormation Events**
```bash
aws cloudformation describe-stack-events \
  --stack-name dmgt-basic-form-prod \
  --region us-east-1 \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'
```

#### **Monitor Real-time Logs**
```bash
# In another terminal while deployment runs
aws logs tail /aws/lambda/dmgt-basic-form-config-prod --follow
```

## 📊 **Performance Metrics**

The enhanced scripts now track and report:
- **Total deployment time**
- **Individual step durations**
- **CloudFormation stack creation time**
- **S3 upload speeds and sizes**
- **React build time**
- **Resource verification time**

## 🎯 **Best Practices**

### **For Development**
```bash
# Use dry run first to preview
DRY_RUN=true ./deploy.sh

# Use verbose mode for troubleshooting
VERBOSE=true ./deploy.sh

# Use different environment
ENVIRONMENT=dev ./deploy.sh
```

### **For Production**
```bash
# Standard deployment with monitoring
./deploy.sh > deployment.log 2>&1

# Monitor in real-time
tail -f deployment.log
```

### **For Cleanup**
```bash
# Safe destruction with confirmation
./destroy.sh

# Force destruction (CI/CD environments)
FORCE=true ./destroy.sh
```

## 📝 **Log Files**

The scripts create temporary log files:
- `/tmp/deploy_output.log` - Command output in non-verbose mode
- `/tmp/destroy_output.log` - Destruction command output
- `/tmp/api_test.json` - API endpoint test results

## 🚀 **Next Steps**

With these enhanced scripts, you can:

1. **Deploy with confidence** knowing exactly what's happening
2. **Debug issues faster** with detailed error information
3. **Monitor progress** with real-time status updates
4. **Clean up safely** with verification steps
5. **Automate deployments** using environment variables

The scripts are now production-ready with enterprise-grade logging and error handling! 🎉