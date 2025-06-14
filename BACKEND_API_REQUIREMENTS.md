# Backend API Requirements for Secure S3 File Upload

## Overview
This document outlines the backend API endpoints required to support secure S3 file uploads using presigned URLs. This approach is **more secure** than using AWS SDK directly in the frontend.

## Security Benefits
✅ **No exposed AWS credentials** in frontend  
✅ **Server-side validation** of upload requests  
✅ **Controlled access** to S3 resources  
✅ **Audit trail** of all file operations  
✅ **Better error handling** and logging  

## Required Backend Endpoints

### 1. Generate Presigned Upload URL

**Endpoint:** `POST /s3/presigned-url`

**Request Body:**
```json
{
  "fileName": "string",
  "fileType": "string", 
  "companyId": "string",
  "employeeId": "string|null",
  "questionId": "string"
}
```

**Response:**
```json
{
  "uploadUrl": "https://s3.amazonaws.com/...",
  "downloadUrl": "https://s3.amazonaws.com/...",
  "s3Key": "companies/ABC123/uploads/...",
  "entryId": "unique-file-identifier",
  "expiresAt": "2025-06-14T12:00:00Z"
}
```

**Implementation Example (Node.js):**
```javascript
app.post('/s3/presigned-url', async (req, res) => {
  try {
    const { fileName, fileType, companyId, employeeId, questionId } = req.body;
    
    // Validate inputs
    if (!fileName || !fileType || !companyId || !questionId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Generate S3 key
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const s3Key = employeeId 
      ? `companies/${companyId}/uploads/employees/${employeeId}/${questionId}/${timestamp}_${sanitizedFileName}`
      : `companies/${companyId}/uploads/company/${questionId}/${timestamp}_${sanitizedFileName}`;
    
    // Generate presigned URL for upload
    const uploadUrl = await s3.getSignedUrlPromise('putObject', {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      ContentType: fileType,
      Expires: 300 // 5 minutes
    });
    
    // Generate presigned URL for download
    const downloadUrl = await s3.getSignedUrlPromise('getObject', {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Expires: 3600 // 1 hour
    });
    
    const entryId = uuidv4();
    
    res.json({
      uploadUrl,
      downloadUrl,
      s3Key,
      entryId,
      expiresAt: new Date(Date.now() + 300000).toISOString()
    });
    
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});
```

### 2. File Registry Management

**Endpoint:** `POST /file-registry`

**Request Body:**
```json
{
  "companyId": "string",
  "employeeId": "string|null",
  "questionId": "string",
  "fileName": "string",
  "fileSize": "number",
  "fileType": "string",
  "s3Key": "string",
  "downloadUrl": "string",
  "formType": "company|employee",
  "entryId": "string"
}
```

**Response:**
```json
{
  "success": true,
  "entryId": "string"
}
```

### 3. Get File Registry

**Endpoint:** `GET /file-registry`

**Query Parameters:**
- `companyId` (optional): Filter by company
- `employeeId` (optional): Filter by employee

**Response:**
```json
[
  {
    "entryId": "string",
    "companyId": "string", 
    "employeeId": "string|null",
    "questionId": "string",
    "fileName": "string",
    "fileSize": "number",
    "fileType": "string",
    "s3Key": "string",
    "downloadUrl": "string",
    "uploadTimestamp": "ISO-8601-date",
    "formType": "company|employee"
  }
]
```

### 4. Generate Download URL

**Endpoint:** `POST /s3/download-url`

**Request Body:**
```json
{
  "s3Key": "string",
  "expirationTime": "number" // seconds, default 3600
}
```

**Response:**
```json
{
  "downloadUrl": "https://s3.amazonaws.com/...",
  "expiresAt": "2025-06-14T13:00:00Z"
}
```

### 5. Delete File

**Endpoint:** `DELETE /s3/file/{entryId}`

**Request Body:**
```json
{
  "s3Key": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

### 6. List Company Files

**Endpoint:** `GET /s3/files`

**Query Parameters:**
- `companyId`: Company identifier

**Response:**
```json
{
  "files": [
    {
      "entryId": "string",
      "fileName": "string",
      "fileSize": "number",
      "uploadDate": "ISO-8601-date",
      "questionId": "string",
      "employeeId": "string|null"
    }
  ],
  "totalCount": "number"
}
```

### 7. Health Check

**Endpoint:** `GET /s3/health`

**Response:**
```json
{
  "status": "healthy|unhealthy",
  "message": "string",
  "s3Connection": "ok|error",
  "timestamp": "ISO-8601-date"
}
```

## Database Schema

### File Uploads Table
```sql
CREATE TABLE file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id VARCHAR(255) UNIQUE NOT NULL,
  company_id VARCHAR(255) NOT NULL,
  employee_id VARCHAR(255),
  question_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  s3_key VARCHAR(1000) NOT NULL,
  form_type VARCHAR(20) NOT NULL CHECK (form_type IN ('company', 'employee')),
  upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  question_text TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_file_uploads_company_id ON file_uploads(company_id);
CREATE INDEX idx_file_uploads_employee_id ON file_uploads(employee_id);
CREATE INDEX idx_file_uploads_question_id ON file_uploads(question_id);
CREATE INDEX idx_file_uploads_upload_timestamp ON file_uploads(upload_timestamp);
```

## Environment Variables

```bash
# AWS Configuration
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-s3-bucket-name

# Database Configuration
DATABASE_URL=postgresql://user:password@host:port/database

# Application Configuration
PORT=3000
NODE_ENV=production
```

## AWS IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObjectAttributes"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name"
    }
  ]
}
```

## S3 Bucket Configuration

### CORS Policy
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["https://your-frontend-domain.com"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### Bucket Policy (Optional - for additional security)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowApplicationAccess",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR-ACCOUNT-ID:role/your-application-role"
      },
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

## Implementation Notes

### File Validation
- Validate file types on the backend before generating presigned URLs
- Implement file size limits (recommend 10MB max)
- Scan for malicious content if required

### Security Considerations
- Always validate company/employee permissions before file operations
- Log all file operations for audit purposes
- Implement rate limiting on upload endpoints
- Consider virus scanning for uploaded files

### Error Handling
- Return consistent error responses
- Log detailed errors server-side but return user-friendly messages
- Implement retry logic for transient S3 errors

### Performance Optimization
- Use connection pooling for database
- Implement caching for frequently accessed metadata
- Consider CloudFront CDN for file downloads
- Use background jobs for heavy operations

## Testing

### Unit Tests
```javascript
// Test presigned URL generation
describe('S3 Upload Service', () => {
  test('should generate valid presigned URLs', async () => {
    const result = await generatePresignedUrl({
      fileName: 'test.pdf',
      fileType: 'application/pdf',
      companyId: 'TEST123',
      questionId: 'Q001'
    });
    
    expect(result.uploadUrl).toContain('s3.amazonaws.com');
    expect(result.s3Key).toContain('companies/TEST123');
  });
});
```

### Integration Tests
- Test complete upload flow from frontend to S3
- Verify file metadata storage and retrieval
- Test error scenarios (invalid files, network failures)

## Monitoring

### Key Metrics
- Upload success/failure rates
- Average upload times
- S3 storage usage
- Error frequency by type

### Alerts
- High error rates (>5%)
- Slow response times (>30s)
- S3 storage approaching limits
- Database connection issues

---

This secure approach provides better control, security, and monitoring compared to direct AWS SDK usage in the frontend.