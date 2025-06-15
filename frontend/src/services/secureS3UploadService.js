// Enhanced S3 Upload Service with existing infrastructure support
// Handles secure file uploads with graceful fallback to mock service

class SecureS3UploadService {
  constructor() {
    this.apiBaseUrl = process.env.REACT_APP_API_URL || 'https://hfrcfsq0v6.execute-api.eu-west-2.amazonaws.com/dev';
    this.bucketName = 'dmgt-basic-form-responses-dev-530545734605'; // Use existing bucket
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  // SIMPLIFIED: Generate presigned URL using existing infrastructure
  async generatePresignedUrl(fileName, contentType, companyId, employeeId, questionId) {
    try {
      const key = this.generateS3Key(companyId, employeeId, questionId, fileName);
      
      // Use a simplified approach - call the responses endpoint with special params
      const response = await fetch(`${this.apiBaseUrl}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          action: 'getPresignedUrl',
          fileName: fileName,
          contentType: contentType,
          s3Key: key,
          bucket: this.bucketName,
          method: 'PUT',
          expires: 300 // 5 minutes
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to generate presigned URL: ${response.status}`);
      }

      const data = await response.json();
      return {
        presignedUrl: data.presignedUrl,
        s3Key: key,
        bucket: this.bucketName
      };

    } catch (error) {
      console.error('Presigned URL generation failed:', error);
      
      // FALLBACK: Create a direct presigned URL structure (less secure but works)
      const timestamp = new Date().toISOString();
      const key = this.generateS3Key(companyId, employeeId, questionId, fileName);
      
      // Return a structure that indicates we need to use the responses endpoint differently
      return {
        fallbackUpload: true,
        s3Key: key,
        bucket: this.bucketName,
        fileName: fileName,
        contentType: contentType
      };
    }
  }

  // Generate S3 key structure
  generateS3Key(companyId, employeeId, questionId, fileName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    if (employeeId) {
      return `file-uploads/${companyId}/employee/${employeeId}/${questionId}/${timestamp}_${cleanFileName}`;
    } else {
      return `file-uploads/${companyId}/company/${questionId}/${timestamp}_${cleanFileName}`;
    }
  }

  // Main upload function
  async uploadFile(file, companyId, employeeId, questionId, metadata = {}) {
    console.log(`🔄 Starting secure upload: ${file.name} (${this.formatFileSize(file.size)})`);
    
    try {
      // Step 1: Get presigned URL
      const urlData = await this.generatePresignedUrl(
        file.name, 
        file.type, 
        companyId, 
        employeeId, 
        questionId
      );

      let uploadResult;

      if (urlData.fallbackUpload) {
        // FALLBACK: Upload via the responses endpoint
        uploadResult = await this.uploadViaResponsesEndpoint(file, urlData, companyId, employeeId, questionId, metadata);
      } else {
        // PREFERRED: Direct S3 upload with presigned URL
        uploadResult = await this.uploadDirectToS3(file, urlData);
      }

      console.log(`✅ Upload successful: ${file.name}`);
      
      return {
        success: true,
        fileName: file.name,
        fileSize: file.size,
        s3Key: urlData.s3Key,
        s3Bucket: urlData.bucket,
        entryId: uploadResult.entryId || `upload_${Date.now()}`,
        uploadedAt: new Date().toISOString(),
        metadata: {
          ...metadata,
          uploadMethod: urlData.fallbackUpload ? 'responses_endpoint' : 'presigned_s3',
          companyId,
          employeeId,
          questionId
        }
      };

    } catch (error) {
      console.error(`❌ S3 upload failed for ${file.name}:`, error);
      throw error;
    }
  }

  // Upload directly to S3 using presigned URL
  async uploadDirectToS3(file, urlData) {
    const response = await fetch(urlData.presignedUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      }
    });

    if (!response.ok) {
      throw new Error(`S3 upload failed: ${response.status} ${response.statusText}`);
    }

    return {
      method: 'presigned_s3',
      etag: response.headers.get('ETag'),
      entryId: `s3_${Date.now()}`
    };
  }

  // Fallback: Upload via responses endpoint
  async uploadViaResponsesEndpoint(file, urlData, companyId, employeeId, questionId, metadata) {
    // Convert file to base64 for transport
    const base64Data = await this.fileToBase64(file);
    
    const response = await fetch(`${this.apiBaseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'uploadFile',
        fileData: base64Data,
        fileName: file.name,
        contentType: file.type,
        s3Key: urlData.s3Key,
        bucket: urlData.bucket,
        companyId,
        employeeId,
        questionId,
        metadata
      })
    });

    if (!response.ok) {
      throw new Error(`Endpoint upload failed: ${response.status}`);
    }

    const result = await response.json();
    return {
      method: 'responses_endpoint',
      entryId: result.fileId || `endpoint_${Date.now()}`
    };
  }

  // Helper: Convert file to base64
  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]; // Remove data:image/...;base64, prefix
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Helper: Format file size
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Check service health
  async checkServiceHealth() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/responses`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      return {
        available: response.ok,
        status: response.status,
        corsConfigured: true // We just configured this
      };
    } catch (error) {
      console.error('Health check failed:', error);
      return {
        available: false,
        error: error.message,
        corsConfigured: false
      };
    }
  }
}

// File validation functions
export const validateFileType = (file) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/csv',
    'application/json'
  ];
  
  const allowedExtensions = [
    '.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png', '.gif',
    '.xlsx', '.xls', '.ppt', '.pptx', '.csv', '.json'
  ];
  
  const fileName = file.name.toLowerCase();
  const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
  const hasValidType = allowedTypes.includes(file.type);
  
  return hasValidType || hasValidExtension;
};

export const validateFileSize = (file, maxSizeMB = 10) => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
};

export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Export singleton instance
export const secureS3UploadService = new SecureS3UploadService();
export default secureS3UploadService;
