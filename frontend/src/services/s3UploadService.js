// services/s3UploadService.js
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY,
  region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.REACT_APP_S3_BUCKET_NAME;

// Metadata registry service
export class MetadataRegistry {
  constructor() {
    this.metadataKey = 'file-metadata-registry';
  }

  async getRegistry() {
    try {
      const params = {
        Bucket: BUCKET_NAME,
        Key: `${this.metadataKey}.json`
      };
      const result = await s3.getObject(params).promise();
      return JSON.parse(result.Body.toString());
    } catch (error) {
      if (error.code === 'NoSuchKey') {
        return {}; // Return empty registry if file doesn't exist
      }
      console.error('Error getting registry:', error);
      throw error;
    }
  }

  async updateRegistry(metadata) {
    const registry = await this.getRegistry();
    const timestamp = new Date().toISOString();
    
    // Create unique entry ID
    const entryId = `${metadata.companyId}_${metadata.employeeId || 'company'}_${timestamp}_${uuidv4().slice(0, 8)}`;
    
    registry[entryId] = {
      ...metadata,
      uploadTimestamp: timestamp,
      entryId
    };

    const params = {
      Bucket: BUCKET_NAME,
      Key: `${this.metadataKey}.json`,
      Body: JSON.stringify(registry, null, 2),
      ContentType: 'application/json'
    };

    await s3.upload(params).promise();
    return entryId;
  }

  async getCompanyUploads(companyId) {
    const registry = await this.getRegistry();
    return Object.values(registry).filter(entry => entry.companyId === companyId);
  }

  async getEmployeeUploads(employeeId) {
    const registry = await this.getRegistry();
    return Object.values(registry).filter(entry => entry.employeeId === employeeId);
  }

  async getQuestionUploads(companyId, questionId) {
    const registry = await this.getRegistry();
    return Object.values(registry).filter(entry => 
      entry.companyId === companyId && entry.questionId === questionId
    );
  }
}

// S3 Upload Service
export class S3UploadService {
  constructor() {
    this.metadataRegistry = new MetadataRegistry();
  }

  async uploadFile(file, companyId, employeeId, questionId, additionalMetadata = {}) {
    try {
      // Validate inputs
      if (!file || !companyId || !questionId) {
        throw new Error('Missing required parameters: file, companyId, and questionId are required');
      }

      // Generate unique filename with company structure
      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      
      // Create S3 key with company directory structure
      const s3Key = employeeId 
        ? `companies/${companyId}/uploads/employees/${employeeId}/${questionId}/${timestamp}_${sanitizedFileName}`
        : `companies/${companyId}/uploads/company/${questionId}/${timestamp}_${sanitizedFileName}`;

      console.log(`Uploading file to S3: ${s3Key}`);

      // Upload file to S3
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: file,
        ContentType: file.type,
        Metadata: {
          companyId: companyId,
          employeeId: employeeId || 'company',
          questionId: questionId,
          originalFileName: file.name,
          uploadTimestamp: new Date().toISOString()
        }
      };

      const uploadResult = await s3.upload(uploadParams).promise();
      console.log('S3 upload successful:', uploadResult.Location);

      // Update metadata registry
      const metadata = {
        companyId,
        employeeId: employeeId || null,
        questionId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        s3Key,
        s3Url: uploadResult.Location,
        s3ETag: uploadResult.ETag,
        formType: employeeId ? 'employee' : 'company',
        ...additionalMetadata
      };

      const entryId = await this.metadataRegistry.updateRegistry(metadata);

      return {
        success: true,
        entryId,
        s3Key,
        url: uploadResult.Location,
        metadata
      };

    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  async deleteFile(s3Key) {
    try {
      const params = {
        Bucket: BUCKET_NAME,
        Key: s3Key
      };

      await s3.deleteObject(params).promise();
      console.log(`File deleted from S3: ${s3Key}`);

      return { success: true };
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      throw new Error(`File deletion failed: ${error.message}`);
    }
  }

  async getFileUrl(s3Key, expirationTime = 3600) {
    try {
      const params = {
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Expires: expirationTime // URL expires in 1 hour by default
      };

      const url = await s3.getSignedUrlPromise('getObject', params);
      return url;
    } catch (error) {
      console.error('Error generating file URL:', error);
      throw new Error(`URL generation failed: ${error.message}`);
    }
  }

  async listCompanyFiles(companyId) {
    try {
      const params = {
        Bucket: BUCKET_NAME,
        Prefix: `companies/${companyId}/uploads/`
      };

      const result = await s3.listObjectsV2(params).promise();
      return result.Contents || [];
    } catch (error) {
      console.error('Error listing company files:', error);
      throw new Error(`File listing failed: ${error.message}`);
    }
  }

  // Health check for S3 connectivity
  async healthCheck() {
    try {
      await s3.headBucket({ Bucket: BUCKET_NAME }).promise();
      return { status: 'healthy', message: 'S3 connection successful' };
    } catch (error) {
      console.error('S3 health check failed:', error);
      return { status: 'unhealthy', message: error.message };
    }
  }
}

// Export singleton instance
export const s3UploadService = new S3UploadService();
export const metadataRegistry = new MetadataRegistry();

// Export utility functions
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