// services/secureS3UploadService.js
// Secure S3 upload service using presigned URLs from backend

import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://your-api-gateway-url.amazonaws.com/prod';

// Metadata registry service (backend-based)
export class MetadataRegistry {
  constructor() {
    this.apiUrl = API_BASE_URL;
  }

  async getRegistry() {
    try {
      const response = await fetch(`${this.apiUrl}/file-registry`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error getting registry:', error);
      return {};
    }
  }

  async updateRegistry(metadata) {
    try {
      const response = await fetch(`${this.apiUrl}/file-registry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.entryId;
    } catch (error) {
      console.error('Error updating registry:', error);
      throw error;
    }
  }

  async getCompanyUploads(companyId) {
    try {
      const response = await fetch(`${this.apiUrl}/file-registry?companyId=${companyId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error getting company uploads:', error);
      return [];
    }
  }

  async getEmployeeUploads(employeeId) {
    try {
      const response = await fetch(`${this.apiUrl}/file-registry?employeeId=${employeeId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error getting employee uploads:', error);
      return [];
    }
  }
}

// Secure S3 Upload Service using presigned URLs
export class SecureS3UploadService {
  constructor() {
    this.metadataRegistry = new MetadataRegistry();
    this.apiUrl = API_BASE_URL;
  }

  /**
   * Get presigned URL from backend for secure upload
   */
  async getPresignedUrl(fileName, fileType, companyId, employeeId, questionId) {
    try {
      const response = await fetch(`${this.apiUrl}/s3/presigned-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileName,
          fileType,
          companyId,
          employeeId,
          questionId
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to get presigned URL: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting presigned URL:', error);
      throw error;
    }
  }

  /**
   * Upload file using presigned URL (secure method)
   */
  async uploadFile(file, companyId, employeeId, questionId, additionalMetadata = {}) {
    try {
      // Validate inputs
      if (!file || !companyId || !questionId) {
        throw new Error('Missing required parameters: file, companyId, and questionId are required');
      }

      console.log(`Starting secure upload for file: ${file.name}`);

      // Get presigned URL from backend
      const presignedData = await this.getPresignedUrl(
        file.name,
        file.type,
        companyId,
        employeeId,
        questionId
      );

      const { uploadUrl, downloadUrl, s3Key, entryId } = presignedData;

      // Upload file directly to S3 using presigned URL
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type
        },
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error(`S3 upload failed: ${uploadResponse.status}`);
      }

      console.log('File uploaded successfully to S3');

      // Update metadata registry through backend
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
        entryId,
        ...additionalMetadata
      };

      await this.metadataRegistry.updateRegistry(metadata);

      return {
        success: true,
        entryId,
        s3Key,
        url: downloadUrl,
        metadata
      };

    } catch (error) {
      console.error('Error uploading file:', error);
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  /**
   * Delete file through backend API
   */
  async deleteFile(s3Key, entryId) {
    try {
      const response = await fetch(`${this.apiUrl}/s3/file/${entryId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ s3Key })
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status}`);
      }

      console.log(`File deleted: ${s3Key}`);
      return { success: true };
    } catch (error) {
      console.error('Error deleting file:', error);
      throw new Error(`File deletion failed: ${error.message}`);
    }
  }

  /**
   * Get file download URL through backend
   */
  async getFileUrl(s3Key, expirationTime = 3600) {
    try {
      const response = await fetch(`${this.apiUrl}/s3/download-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ s3Key, expirationTime })
      });

      if (!response.ok) {
        throw new Error(`Failed to get download URL: ${response.status}`);
      }

      const result = await response.json();
      return result.downloadUrl;
    } catch (error) {
      console.error('Error getting download URL:', error);
      throw new Error(`URL generation failed: ${error.message}`);
    }
  }

  /**
   * List company files through backend
   */
  async listCompanyFiles(companyId) {
    try {
      const response = await fetch(`${this.apiUrl}/s3/files?companyId=${companyId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error listing company files:', error);
      throw new Error(`File listing failed: ${error.message}`);
    }
  }

  /**
   * Health check for S3 service through backend
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.apiUrl}/s3/health`);
      
      if (!response.ok) {
        return { status: 'unhealthy', message: `API unreachable: ${response.status}` };
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('S3 health check failed:', error);
      return { status: 'unhealthy', message: error.message };
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
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
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