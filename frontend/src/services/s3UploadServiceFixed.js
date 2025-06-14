import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

// Configure AWS SDK
if (!process.env.REACT_APP_AWS_ACCESS_KEY_ID || !process.env.REACT_APP_AWS_SECRET_ACCESS_KEY) {
  console.error('AWS credentials not configured. Please set REACT_APP_AWS_ACCESS_KEY_ID and REACT_APP_AWS_SECRET_ACCESS_KEY in your environment.');
}

AWS.config.update({
  accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY,
  region: process.env.REACT_APP_AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();
const BUCKET_NAME = process.env.REACT_APP_S3_BUCKET_NAME;

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
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];
  
  return allowedTypes.includes(file.type);
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

class S3UploadService {
  constructor() {
    this.bucket = BUCKET_NAME;
    this.isConfigured = !!(process.env.REACT_APP_AWS_ACCESS_KEY_ID && 
                          process.env.REACT_APP_AWS_SECRET_ACCESS_KEY && 
                          BUCKET_NAME);
    
    if (!this.isConfigured) {
      console.warn('S3 Upload Service: AWS credentials or bucket name not configured');
    }
  }

  /**
   * Upload file to S3 with proper company/employee directory structure
   * @param {File} file - The file to upload
   * @param {string} companyId - Company ID
   * @param {string|null} employeeId - Employee ID (null for company files)
   * @param {string} questionId - Question ID
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Upload result
   */
  async uploadFile(file, companyId, employeeId, questionId, metadata = {}) {
    if (!this.isConfigured) {
      throw new Error('S3 Upload Service not configured. Please check your AWS credentials.');
    }

    try {
      // Validate file before upload
      if (!validateFileType(file)) {
        throw new Error('File type not allowed. Please upload PDF, DOC, TXT, Image, Excel, or PowerPoint files.');
      }

      if (!validateFileSize(file, 10)) {
        throw new Error('File size must be less than 10MB');
      }

      // Generate unique file key with proper directory structure
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileExtension = file.name.split('.').pop();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      
      // Create S3 key based on whether it's company or employee file
      const s3Key = employeeId !== null && employeeId !== undefined
        ? `uploads/${companyId}/employees/${employeeId}/${questionId}/${timestamp}_${sanitizedFileName}`
        : `uploads/${companyId}/company/${questionId}/${timestamp}_${sanitizedFileName}`;

      console.log(`Uploading file to S3: ${s3Key}`);

      // Upload file to S3
      const uploadParams = {
        Bucket: this.bucket,
        Key: s3Key,
        Body: file,
        ContentType: file.type,
        Metadata: {
          'company-id': companyId,
          'employee-id': employeeId?.toString() || 'company',
          'question-id': questionId,
          'original-filename': file.name,
          'upload-timestamp': new Date().toISOString(),
          'form-type': metadata.formType || (employeeId ? 'employee' : 'company'),
          'question-text': metadata.questionText || 'Unknown Question'
        }
      };

      const uploadResult = await s3.upload(uploadParams).promise();
      
      console.log('File uploaded successfully:', uploadResult.Location);

      // Create metadata entry for the metadata registry
      const metadataEntry = {
        uploadId: uuidv4(),
        companyId: companyId,
        employeeId: employeeId,
        questionId: questionId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        s3Key: s3Key,
        s3Bucket: this.bucket,
        s3Url: uploadResult.Location,
        uploadTimestamp: new Date().toISOString(),
        questionText: metadata.questionText || 'Unknown Question',
        formType: metadata.formType || (employeeId ? 'employee' : 'company')
      };

      // Save metadata to the metadata registry
      await this.saveFileMetadata(metadataEntry);

      return {
        success: true,
        s3Key: s3Key,
        s3Url: uploadResult.Location,
        bucket: this.bucket,
        uploadId: metadataEntry.uploadId,
        metadata: metadataEntry
      };

    } catch (error) {
      console.error('S3 Upload Error:', error);
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Save file metadata to the uploads metadata registry
   * @param {Object} metadataEntry - Metadata entry to save
   */
  async saveFileMetadata(metadataEntry) {
    try {
      // Create metadata key for the registry
      const metadataKey = `uploads/metadata/${metadataEntry.companyId}/upload-${metadataEntry.uploadId}.json`;
      
      const metadataParams = {
        Bucket: this.bucket,
        Key: metadataKey,
        Body: JSON.stringify(metadataEntry, null, 2),
        ContentType: 'application/json',
        Metadata: {
          'content-type': 'file-metadata',
          'company-id': metadataEntry.companyId,
          'upload-id': metadataEntry.uploadId
        }
      };

      await s3.upload(metadataParams).promise();
      console.log(`File metadata saved: ${metadataKey}`);

      // Also update the master metadata index
      await this.updateMetadataIndex(metadataEntry);

    } catch (error) {
      console.error('Error saving file metadata:', error);
      // Don't throw here as the file upload itself succeeded
    }
  }

  /**
   * Update the master metadata index file
   * @param {Object} metadataEntry - New metadata entry to add
   */
  async updateMetadataIndex(metadataEntry) {
    try {
      const indexKey = `uploads/metadata/${metadataEntry.companyId}/index.json`;
      
      // Try to get existing index
      let indexData = {
        companyId: metadataEntry.companyId,
        lastUpdated: new Date().toISOString(),
        fileCount: 0,
        files: []
      };

      try {
        const existingIndex = await s3.getObject({
          Bucket: this.bucket,
          Key: indexKey
        }).promise();
        
        indexData = JSON.parse(existingIndex.Body.toString());
      } catch (error) {
        if (error.code !== 'NoSuchKey') {
          throw error;
        }
        // Index doesn't exist yet, use default
      }

      // Add new file to index
      indexData.files.push({
        uploadId: metadataEntry.uploadId,
        fileName: metadataEntry.fileName,
        fileSize: metadataEntry.fileSize,
        questionId: metadataEntry.questionId,
        employeeId: metadataEntry.employeeId,
        uploadTimestamp: metadataEntry.uploadTimestamp,
        s3Key: metadataEntry.s3Key
      });

      indexData.fileCount = indexData.files.length;
      indexData.lastUpdated = new Date().toISOString();

      // Save updated index
      await s3.upload({
        Bucket: this.bucket,
        Key: indexKey,
        Body: JSON.stringify(indexData, null, 2),
        ContentType: 'application/json'
      }).promise();

      console.log(`Updated metadata index: ${indexKey}`);

    } catch (error) {
      console.error('Error updating metadata index:', error);
    }
  }

  /**
   * Get file metadata for a company
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>} Metadata index
   */
  async getCompanyFileMetadata(companyId) {
    try {
      const indexKey = `uploads/metadata/${companyId}/index.json`;
      
      const result = await s3.getObject({
        Bucket: this.bucket,
        Key: indexKey
      }).promise();

      return JSON.parse(result.Body.toString());
    } catch (error) {
      if (error.code === 'NoSuchKey') {
        return {
          companyId: companyId,
          lastUpdated: null,
          fileCount: 0,
          files: []
        };
      }
      throw error;
    }
  }

  /**
   * Generate presigned URL for file download
   * @param {string} s3Key - S3 key of the file
   * @param {number} expiresIn - URL expiration time in seconds (default: 1 hour)
   * @returns {Promise<string>} Presigned URL
   */
  async getPresignedUrl(s3Key, expiresIn = 3600) {
    try {
      const params = {
        Bucket: this.bucket,
        Key: s3Key,
        Expires: expiresIn
      };

      return await s3.getSignedUrlPromise('getObject', params);
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      throw error;
    }
  }

  /**
   * Delete file from S3 and update metadata
   * @param {string} companyId - Company ID
   * @param {string} uploadId - Upload ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteFile(companyId, uploadId) {
    try {
      // Get metadata to find S3 key
      const metadataKey = `uploads/metadata/${companyId}/upload-${uploadId}.json`;
      
      const metadata = await s3.getObject({
        Bucket: this.bucket,
        Key: metadataKey
      }).promise();

      const metadataEntry = JSON.parse(metadata.Body.toString());

      // Delete the actual file
      await s3.deleteObject({
        Bucket: this.bucket,
        Key: metadataEntry.s3Key
      }).promise();

      // Delete the metadata file
      await s3.deleteObject({
        Bucket: this.bucket,
        Key: metadataKey
      }).promise();

      console.log(`Deleted file and metadata: ${metadataEntry.s3Key}`);
      return true;

    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  /**
   * Check if S3 service is properly configured
   * @returns {boolean} Configuration status
   */
  isServiceConfigured() {
    return this.isConfigured;
  }

  /**
   * Test S3 connection
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      await s3.headBucket({ Bucket: this.bucket }).promise();
      return true;
    } catch (error) {
      console.error('S3 connection test failed:', error);
      return false;
    }
  }
}

// Create and export singleton instance
const s3UploadService = new S3UploadService();

export default s3UploadService;

// For backwards compatibility, also export the class
export { S3UploadService };
