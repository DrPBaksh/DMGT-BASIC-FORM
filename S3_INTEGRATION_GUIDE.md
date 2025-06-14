# S3 File Upload Integration & Enhanced Features Guide

## Overview

This document outlines the major enhancements made to the DMGT Basic Form application, including S3 file upload integration, company interview bug fixes, and improved user experience features.

## New Features Implemented

### 1. S3 File Upload Integration

The application now supports secure file uploads to Amazon S3 with comprehensive metadata tracking.

#### Key Features:
- **Secure S3 Storage**: Files are uploaded directly to S3 with proper access controls
- **Company Directory Structure**: Files are organized by company and employee hierarchy
- **Metadata Registry**: JSON-based tracking of all uploaded files with question context
- **File Type Validation**: Support for common document formats (PDF, DOC, images, Excel, etc.)
- **Size Limitations**: 10MB maximum file size with client-side validation
- **Download Links**: Signed URLs for secure file retrieval

#### Directory Structure:
```
S3 Bucket/
├── companies/
│   └── {companyId}/
│       └── uploads/
│           ├── company/
│           │   └── {questionId}/
│           │       └── {timestamp}_{filename}
│           └── employees/
│               └── {employeeId}/
│                   └── {questionId}/
│                       └── {timestamp}_{filename}
└── file-metadata-registry.json
```

#### Metadata Registry Format:
```json
{
  "entryId": {
    "companyId": "string",
    "employeeId": "string|null",
    "questionId": "string",
    "fileName": "string",
    "fileSize": "number",
    "fileType": "string",
    "s3Key": "string",
    "s3Url": "string",
    "formType": "company|employee",
    "uploadTimestamp": "ISO date string",
    "questionText": "string"
  }
}
```

### 2. Company Interview Bug Fixes

#### Issue Resolved:
Previously, the company questionnaire would incorrectly prevent users from continuing after filling the second question due to premature completion detection.

#### Solution Implemented:
- **Enhanced State Management**: Proper tracking of form completion vs. in-progress status
- **Backend Integration**: Improved communication with backend for accurate completion status
- **One-Per-Company Logic**: Enforced single questionnaire per company with modification capabilities
- **Autosave Enhancement**: Continuous saving without premature completion triggers

#### Key Improvements:
- ✅ Fixed autosave interference with form completion
- ✅ Proper "in-progress" vs "completed" state handling
- ✅ Allow modifications to completed company assessments with confirmation
- ✅ Clear status indicators for users
- ✅ Elimination of false completion warnings

### 3. Enhanced Company Assessment Logic

#### One Questionnaire Per Company:
- **Single Assessment Rule**: Each company can have only one assessment
- **Modification Support**: Completed assessments can be reopened and modified
- **Progress Tracking**: Real-time completion percentage calculation
- **Status Indicators**: Clear visual feedback on assessment state

#### Form States:
1. **New**: Fresh company assessment
2. **In Progress**: Partially completed (0-99%)
3. **Completed**: Fully completed (100%)
4. **Modifiable**: Completed but allows changes with confirmation

### 4. UI/UX Enhancements

#### File Upload Interface:
- **Drag & Drop Visual**: Enhanced upload area with hover effects
- **Progress Indicators**: Real-time upload progress with spinners
- **Error Handling**: Clear error messages for invalid files
- **File Preview**: Display uploaded file info with download links
- **Upload States**: Visual feedback for uploading, success, and error states

#### Company Status Display:
- **Status Badges**: Visual indicators for assessment state
- **Progress Bars**: Enhanced progress visualization
- **Modification Warnings**: Clear messaging about editing completed assessments
- **Employee Count**: Display of associated employee assessments

## Configuration Requirements

### Environment Variables
Copy `frontend/.env.example` to `frontend/.env.local` and configure:

```bash
# API Configuration
REACT_APP_API_URL=https://your-api-gateway-url.amazonaws.com/prod

# AWS S3 Configuration
REACT_APP_AWS_ACCESS_KEY_ID=your-aws-access-key-id
REACT_APP_AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
REACT_APP_AWS_REGION=us-east-1
REACT_APP_S3_BUCKET_NAME=your-s3-bucket-name
```

### AWS S3 Setup

#### Bucket Configuration:
1. Create an S3 bucket for file storage
2. Configure CORS policy for web uploads:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["https://your-domain.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

#### IAM Policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

## File Upload Service API

### Core Methods

#### `uploadFile(file, companyId, employeeId, questionId, metadata)`
Uploads a file to S3 with proper organization and metadata tracking.

#### `deleteFile(s3Key)`
Removes a file from S3 storage.

#### `getFileUrl(s3Key, expirationTime)`
Generates a signed URL for secure file access.

#### `listCompanyFiles(companyId)`
Lists all files associated with a company.

### Validation Functions

#### `validateFileType(file, allowedTypes)`
Checks if the uploaded file type is allowed.

#### `validateFileSize(file, maxSizeInMB)`
Ensures file size is within limits.

#### `formatFileSize(sizeInBytes)`
Formats file size for display.

## Backend Integration Requirements

### API Endpoints to Update

The following backend endpoints need to be enhanced to support the new features:

#### POST `/responses`
- **Enhanced**: Support for file metadata in request payload
- **Added**: Company form state tracking (new, in_progress, completed)
- **Fixed**: Proper completion detection logic

#### GET `/responses`
- **Enhanced**: Return completion percentage and form state
- **Added**: Company modification timestamps
- **Fixed**: Accurate completion status

### Database Schema Additions

Consider adding these fields to support the new functionality:

```sql
-- Company assessments table
ALTER TABLE company_responses ADD COLUMN completion_percentage INT DEFAULT 0;
ALTER TABLE company_responses ADD COLUMN form_state VARCHAR(20) DEFAULT 'new';
ALTER TABLE company_responses ADD COLUMN last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE company_responses ADD COLUMN can_modify BOOLEAN DEFAULT true;

-- File metadata tracking
CREATE TABLE file_uploads (
  id UUID PRIMARY KEY,
  company_id VARCHAR(255) NOT NULL,
  employee_id VARCHAR(255),
  question_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  s3_key VARCHAR(1000) NOT NULL,
  s3_url VARCHAR(1000) NOT NULL,
  form_type VARCHAR(20) NOT NULL,
  upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  question_text TEXT
);
```

## Testing Guidelines

### File Upload Testing
1. **File Type Validation**: Test with various file types (allowed and disallowed)
2. **Size Limits**: Test files above and below 10MB limit
3. **Network Failures**: Test upload interruption scenarios
4. **S3 Permissions**: Verify proper access controls

### Company Assessment Testing
1. **New Assessments**: Test fresh company onboarding
2. **In-Progress**: Test partial completion and resumption
3. **Completion**: Test full assessment completion flow
4. **Modification**: Test editing completed assessments
5. **Multiple Users**: Test concurrent access scenarios

### User Experience Testing
1. **Progress Indicators**: Verify accurate progress calculation
2. **Status Badges**: Test all form state transitions
3. **Error Handling**: Test various error scenarios
4. **Mobile Responsiveness**: Test on various screen sizes

## Security Considerations

### File Upload Security
- **File Type Restriction**: Only allow safe file types
- **Size Limitations**: Prevent large file uploads
- **Virus Scanning**: Consider adding virus scanning for uploaded files
- **Access Controls**: Implement proper S3 bucket policies

### Data Privacy
- **Company Isolation**: Ensure files are properly isolated by company
- **Employee Privacy**: Protect employee assessment data
- **Audit Trails**: Maintain logs of all file operations
- **GDPR Compliance**: Consider data retention and deletion policies

## Troubleshooting

### Common Issues

#### S3 Upload Failures
- Check AWS credentials and permissions
- Verify CORS configuration
- Confirm bucket name and region settings

#### Company Assessment Issues
- Clear browser cache and local storage
- Check API endpoint responses
- Verify company ID format

#### File Display Problems
- Check S3 signed URL generation
- Verify file metadata integrity
- Confirm proper file type detection

### Debug Mode
Enable debug logging by adding to your environment:
```bash
REACT_APP_DEBUG_MODE=true
```

## Performance Optimization

### File Upload Optimization
- Implement file compression for large documents
- Add progress bars for large uploads
- Consider chunked uploads for very large files

### UI Performance
- Lazy load file previews
- Implement virtual scrolling for large file lists
- Optimize image thumbnails

## Future Enhancements

### Planned Features
1. **Bulk File Upload**: Support multiple file selection
2. **File Preview**: In-browser document preview
3. **Version Control**: Track file version history
4. **Collaboration**: Multi-user editing capabilities
5. **Advanced Search**: File content search and filtering

### Integration Opportunities
1. **Document Processing**: OCR and text extraction
2. **Compliance Checking**: Automated document validation
3. **Backup Solutions**: Cross-region replication
4. **Analytics**: File usage and access analytics

## Support and Maintenance

### Regular Tasks
- Monitor S3 storage usage and costs
- Review and cleanup old file uploads
- Update file type restrictions as needed
- Backup metadata registry regularly

### Monitoring
- Set up CloudWatch alerts for S3 operations
- Monitor application performance metrics
- Track file upload success/failure rates
- Monitor user experience metrics

---

For technical support or questions about implementation, please refer to the application documentation or contact the development team.