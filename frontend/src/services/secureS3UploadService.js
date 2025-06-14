// services/secureS3UploadService.js
// FIXED: Secure S3 upload service using presigned URLs from enhanced backend

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://your-api-gateway-url.amazonaws.com/prod';

// REQUIREMENT: Metadata registry service (backend-based) for file upload tracking
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
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
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

// REQUIREMENT: Secure S3 Upload Service using presigned URLs with proper metadata
export class SecureS3UploadService {
  constructor() {
    this.metadataRegistry = new MetadataRegistry();
    this.apiUrl = API_BASE_URL;
  }

  /**
   * REQUIREMENT: Get presigned URL from backend for secure upload
   * Files will be stored under: companies/{companyId}/uploads/{company|employees}/{employeeId}/{questionId}/
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
        const errorText = await response.text();
        throw new Error(`Failed to get presigned URL: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting presigned URL:', error);
      throw error;
    }
  }

  /**
   * REQUIREMENT: Upload file using presigned URL (secure method) and create metadata
   * This is the main function that handles the complete upload process including metadata
   */
  async uploadFile(file, companyId, employeeId, questionId, additionalMetadata = {}) {
    try {
      // Validate inputs
      if (!file || !companyId || !questionId) {
        throw new Error('Missing required parameters: file, companyId, and questionId are required');
      }

      console.log(`Starting secure upload for file: ${file.name}`);

      // REQUIREMENT: Get presigned URL from backend
      const presignedData = await this.getPresignedUrl(
        file.name,
        file.type,
        companyId,
        employeeId,
        questionId
      );

      const { uploadUrl, downloadUrl, s3Key, entryId } = presignedData;

      // REQUIREMENT: Upload file directly to S3 using presigned URL
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type
        },
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error(`S3 upload failed: ${uploadResponse.status} - ${uploadResponse.statusText}`);
      }

      console.log('File uploaded successfully to S3');

      // REQUIREMENT: Update metadata registry through backend with complete file information
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
        questionText: additionalMetadata.questionText || '',
        questionOrder: additionalMetadata.questionOrder || null,
        section: additionalMetadata.section || null,
        uploadTimestamp: new Date().toISOString(),
        ...additionalMetadata
      };

      await this.metadataRegistry.updateRegistry(metadata);

      // REQUIREMENT: Return complete upload result with all necessary information
      return {
        success: true,
        entryId,
        s3Key,
        url: downloadUrl,
        metadata,
        fileName: file.name,
        fileSize: file.size,
        uploadedAt: metadata.uploadTimestamp
      };

    } catch (error) {
      console.error('Error uploading file:', error);
      
      // Enhanced error messages for common issues
      if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
        throw new Error('Upload service is not configured. Please check backend deployment.');
      } else if (error.message.includes('presigned URL')) {
        throw new Error('Unable to get upload authorization. Please check your permissions.');
      } else if (error.message.includes('S3 upload failed')) {
        throw new Error('File upload to storage failed. Please try again.');
      }
      
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  /**
   * REQUIREMENT: Delete file through backend API with metadata cleanup
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
        const errorText = await response.text();
        throw new Error(`Delete failed: ${response.status} - ${errorText}`);
      }

      console.log(`File deleted: ${s3Key}`);
      return { success: true };
    } catch (error) {
      console.error('Error deleting file:', error);
      throw new Error(`File deletion failed: ${error.message}`);
    }
  }

  /**
   * REQUIREMENT: Get file download URL through backend for security
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
        const errorText = await response.text();
        throw new Error(`Failed to get download URL: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      return result.downloadUrl;
    } catch (error) {
      console.error('Error getting download URL:', error);
      throw new Error(`URL generation failed: ${error.message}`);
    }
  }

  /**
   * REQUIREMENT: List company files through backend with metadata
   */
  async listCompanyFiles(companyId) {
    try {
      const response = await fetch(`${this.apiUrl}/s3/files?companyId=${companyId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list files: ${response.status} - ${errorText}`);
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
        return { 
          status: 'unhealthy', 
          message: `API unreachable: ${response.status}`,
          timestamp: new Date().toISOString()
        };
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('S3 health check failed:', error);
      return { 
        status: 'unhealthy', 
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * REQUIREMENT: Get files by company and optionally filter by employee
   */
  async getFilesForCompany(companyId, employeeId = null) {
    try {
      const url = employeeId 
        ? `${this.apiUrl}/file-registry?companyId=${companyId}&employeeId=${employeeId}`
        : `${this.apiUrl}/file-registry?companyId=${companyId}`;
        
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to get files: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting files for company:', error);
      return [];
    }
  }

  /**
   * REQUIREMENT: Get upload statistics for a company
   */
  async getUploadStats(companyId) {
    try {
      const files = await this.getFilesForCompany(companyId);
      
      const stats = {
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + (file.fileSize || 0), 0),
        fileTypes: {},
        employeeUploads: {},
        questionUploads: {},
        uploadsByDate: {}
      };

      files.forEach(file => {
        // Count by file type
        const fileType = file.fileType || 'unknown';
        stats.fileTypes[fileType] = (stats.fileTypes[fileType] || 0) + 1;

        // Count by employee
        const empId = file.employeeId || 'company';
        stats.employeeUploads[empId] = (stats.employeeUploads[empId] || 0) + 1;

        // Count by question
        const qId = file.questionId || 'unknown';
        stats.questionUploads[qId] = (stats.questionUploads[qId] || 0) + 1;

        // Count by date
        const uploadDate = file.uploadTimestamp ? 
          new Date(file.uploadTimestamp).toDateString() : 'unknown';
        stats.uploadsByDate[uploadDate] = (stats.uploadsByDate[uploadDate] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('Error getting upload stats:', error);
      return null;
    }
  }
}

// Export singleton instance
export const secureS3UploadService = new SecureS3UploadService();
export const metadataRegistry = new MetadataRegistry();

// REQUIREMENT: Export utility functions for file validation
export const validateFileType = (file, allowedTypes = []) => {
  if (allowedTypes.length === 0) {
    // Default allowed types as per requirements
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

// REQUIREMENT: Export helper functions for file management
export const getFileExtension = (fileName) => {
  return fileName.split('.').pop().toLowerCase();
};

export const generateFileName = (originalName, companyId, employeeId, questionId) => {
  const timestamp = Date.now();
  const extension = getFileExtension(originalName);
  const baseName = originalName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, '_');
  
  if (employeeId) {
    return `${companyId}_emp${employeeId}_${questionId}_${timestamp}_${baseName}.${extension}`;
  } else {
    return `${companyId}_company_${questionId}_${timestamp}_${baseName}.${extension}`;
  }
};

export const isImageFile = (fileType) => {
  return fileType.startsWith('image/');
};

export const isDocumentFile = (fileType) => {
  const documentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
  return documentTypes.includes(fileType);
};

export const isSpreadsheetFile = (fileType) => {
  const spreadsheetTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  return spreadsheetTypes.includes(fileType);
};

export const isPresentationFile = (fileType) => {
  const presentationTypes = [
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];
  return presentationTypes.includes(fileType);
};

export const getFileTypeIcon = (fileType) => {
  if (isImageFile(fileType)) return '🖼️';
  if (isDocumentFile(fileType)) return '📄';
  if (isSpreadsheetFile(fileType)) return '📊';
  if (isPresentationFile(fileType)) return '📽️';
  return '📎';
};

export default SecureS3UploadService;
