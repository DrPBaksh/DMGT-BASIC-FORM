// services/secureS3UploadService.js
// Enhanced S3 upload service with improved CORS handling and fallback

import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://your-api-gateway-url.amazonaws.com/prod';

// Metadata registry service (backend-based)
export class MetadataRegistry {
  constructor() {
    this.apiUrl = API_BASE_URL;
  }

  async getRegistry() {
    try {
      const response = await fetch(`${this.apiUrl}/file-registry`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.warn('Registry service unavailable, using fallback:', error.message);
      return {};
    }
  }

  async updateRegistry(metadata) {
    try {
      const response = await fetch(`${this.apiUrl}/file-registry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors',
        body: JSON.stringify(metadata)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.entryId;
    } catch (error) {
      console.warn('Registry update failed, using local ID:', error.message);
      // Generate local entry ID as fallback
      return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  async getCompanyUploads(companyId) {
    try {
      const response = await fetch(`${this.apiUrl}/file-registry?companyId=${companyId}`, {
        headers: {
          'Accept': 'application/json'
        },
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.warn('Company uploads listing failed:', error.message);
      return [];
    }
  }

  async getEmployeeUploads(employeeId) {
    try {
      const response = await fetch(`${this.apiUrl}/file-registry?employeeId=${employeeId}`, {
        headers: {
          'Accept': 'application/json'
        },
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.warn('Employee uploads listing failed:', error.message);
      return [];
    }
  }
}

// Enhanced S3 Upload Service with improved error handling
export class SecureS3UploadService {
  constructor() {
    this.metadataRegistry = new MetadataRegistry();
    this.apiUrl = API_BASE_URL;
    this.corsRetryAttempts = 0;
    this.maxCorsRetries = 1;
  }

  /**
   * Check if S3 service is available with proper CORS handling
   */
  async isServiceAvailable() {
    try {
      const response = await fetch(`${this.apiUrl}/s3/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        mode: 'cors',
        cache: 'no-cache'
      });
      
      if (!response.ok) {
        return false;
      }
      
      const result = await response.json();
      return result.status === 'healthy';
    } catch (error) {
      console.warn('S3 service health check failed:', error.message);
      return false;
    }
  }

  /**
   * Get presigned URL from backend for secure upload with enhanced error handling
   */
  async getPresignedUrl(fileName, fileType, companyId, employeeId, questionId) {
    try {
      const requestBody = {
        fileName,
        fileType,
        companyId,
        employeeId,
        questionId,
        timestamp: new Date().toISOString()
      };

      console.log('Requesting presigned URL with payload:', requestBody);

      const response = await fetch(`${this.apiUrl}/s3/presigned-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        },
        mode: 'cors',
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Presigned URL request failed: ${response.status} - ${errorText}`);
        throw new Error(`Failed to get presigned URL: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('Presigned URL received successfully');
      return result;

    } catch (error) {
      console.error('Error getting presigned URL:', error);
      
      // Enhanced error analysis
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
        throw new Error('CORS_ERROR: S3 upload service is not properly configured with CORS headers. File upload will use fallback service.');
      } else if (error.message.includes('404')) {
        throw new Error('ENDPOINT_NOT_FOUND: S3 presigned URL endpoint is not available. File upload will use fallback service.');
      } else {
        throw new Error(`PRESIGNED_URL_ERROR: ${error.message}`);
      }
    }
  }

  /**
   * Upload file using presigned URL (secure method) with enhanced fallback
   */
  async uploadFile(file, companyId, employeeId, questionId, additionalMetadata = {}) {
    try {
      // Validate inputs
      if (!file || !companyId || !questionId) {
        throw new Error('Missing required parameters: file, companyId, and questionId are required');
      }

      console.log(`Starting secure upload for file: ${file.name}`);

      // First check if the S3 service is available
      const serviceAvailable = await this.isServiceAvailable();
      
      if (!serviceAvailable) {
        console.warn('S3 service is not available, falling back to mock service immediately');
        throw new Error('S3_SERVICE_UNAVAILABLE: Service is not responding');
      }

      // Try to get presigned URL from backend
      let presignedData;
      try {
        presignedData = await this.getPresignedUrl(
          file.name,
          file.type,
          companyId,
          employeeId,
          questionId
        );
      } catch (presignedError) {
        console.warn('Presigned URL failed:', presignedError.message);
        throw new Error(`PRESIGNED_FAILED: ${presignedError.message}`);
      }

      const { uploadUrl, downloadUrl, s3Key, entryId } = presignedData;

      if (!uploadUrl) {
        throw new Error('INVALID_PRESIGNED_RESPONSE: No upload URL provided');
      }

      // Upload file directly to S3 using presigned URL
      console.log('Uploading to S3 with presigned URL...');
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type
        },
        body: file,
        mode: 'cors'
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(`S3 upload failed: ${uploadResponse.status} - ${errorText}`);
        throw new Error(`S3_UPLOAD_FAILED: ${uploadResponse.status} - ${errorText}`);
      }

      console.log('File uploaded successfully to S3');

      // Update metadata registry through backend (with fallback)
      const metadata = {
        companyId,
        employeeId: employeeId || null,
        questionId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        s3Key,
        downloadUrl,
        formType: employeeId ? 'employee' : 'company',
        entryId: entryId || `s3_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        uploadMethod: 'S3_SECURE',
        uploadTimestamp: new Date().toISOString(),
        ...additionalMetadata
      };

      const registryEntryId = await this.metadataRegistry.updateRegistry(metadata);

      return {
        success: true,
        entryId: registryEntryId,
        s3Key,
        s3Bucket: presignedData.s3Bucket || 'dmgt-forms-storage',
        url: downloadUrl,
        uploadedSecurely: true,
        metadata
      };

    } catch (error) {
      console.error('Secure S3 upload failed:', error);
      
      // Enhanced error handling with specific fallback triggers
      const shouldUseFallback = 
        error.message.includes('CORS') ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('S3_SERVICE_UNAVAILABLE') ||
        error.message.includes('ENDPOINT_NOT_FOUND') ||
        error.message.includes('PRESIGNED_FAILED') ||
        error.message.includes('S3_UPLOAD_FAILED');

      if (shouldUseFallback) {
        console.log('Triggering fallback to mock service due to:', error.message);
        throw new Error(`FALLBACK_REQUIRED: ${error.message}`);
      } else {
        throw new Error(`File upload failed: ${error.message}`);
      }
    }
  }

  /**
   * Delete file through backend API with error handling
   */
  async deleteFile(s3Key, entryId) {
    try {
      const response = await fetch(`${this.apiUrl}/s3/file/${entryId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors',
        body: JSON.stringify({ s3Key })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Delete failed: ${response.status} - ${errorText}`);
        throw new Error(`Delete failed: ${response.status} - ${errorText}`);
      }

      console.log(`File deleted successfully: ${s3Key}`);
      return { success: true };
    } catch (error) {
      console.warn('File deletion failed (file may not exist on S3):', error.message);
      // Don't throw for delete failures - file might already be gone
      return { success: false, error: error.message };
    }
  }

  /**
   * Get file download URL through backend with fallback
   */
  async getFileUrl(s3Key, expirationTime = 3600) {
    try {
      const response = await fetch(`${this.apiUrl}/s3/download-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors',
        body: JSON.stringify({ s3Key, expirationTime })
      });

      if (!response.ok) {
        throw new Error(`Failed to get download URL: ${response.status}`);
      }

      const result = await response.json();
      return result.downloadUrl;
    } catch (error) {
      console.warn('Download URL generation failed:', error.message);
      // Return a placeholder that indicates the file exists but download is unavailable
      return `#file-unavailable-${s3Key}`;
    }
  }

  /**
   * List company files through backend with error handling
   */
  async listCompanyFiles(companyId) {
    try {
      const response = await fetch(`${this.apiUrl}/s3/files?companyId=${companyId}`, {
        headers: {
          'Accept': 'application/json'
        },
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.warn('File listing failed:', error.message);
      return [];
    }
  }

  /**
   * Enhanced health check for S3 service
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.apiUrl}/s3/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        mode: 'cors',
        cache: 'no-cache'
      });
      
      if (!response.ok) {
        return { 
          status: 'unhealthy', 
          message: `API unreachable: ${response.status}`,
          available: false
        };
      }

      const result = await response.json();
      return {
        ...result,
        available: result.status === 'healthy'
      };
    } catch (error) {
      console.warn('S3 health check failed:', error.message);
      return { 
        status: 'unhealthy', 
        message: error.message,
        available: false,
        error: error.message.includes('CORS') ? 'CORS_ERROR' : 'CONNECTION_ERROR'
      };
    }
  }
}

// Export singleton instance
export const secureS3UploadService = new SecureS3UploadService();
export const metadataRegistry = new MetadataRegistry();

// Export utility functions (reuse from fileUtils)
export const validateFileType = (file, allowedTypes = []) => {
  if (allowedTypes.length === 0) {
    // Default allowed types
    allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/csv',
      'application/json'
    ];
  }
  
  return allowedTypes.includes(file.type);
};

export const validateFileSize = (file, maxSizeInMB = 10) => {
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  return file.size <= maxSizeInBytes;
};

export const formatFileSize = (sizeInBytes) => {
  if (sizeInBytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(sizeInBytes) / Math.log(k));
  
  return parseFloat((sizeInBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default SecureS3UploadService;