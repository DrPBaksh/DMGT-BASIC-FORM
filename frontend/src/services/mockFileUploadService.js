// services/mockFileUploadService.js
// Mock file upload service for local testing when backend is not ready

import { v4 as uuidv4 } from 'uuid';

// Mock metadata registry (stored in localStorage for demo)
export class MockMetadataRegistry {
  constructor() {
    this.storageKey = 'dmgt_file_registry';
  }

  getRegistry() {
    try {
      const registry = localStorage.getItem(this.storageKey);
      return registry ? JSON.parse(registry) : {};
    } catch (error) {
      console.error('Error getting mock registry:', error);
      return {};
    }
  }

  updateRegistry(metadata) {
    try {
      const registry = this.getRegistry();
      const timestamp = new Date().toISOString();
      const entryId = `mock_${metadata.companyId}_${metadata.employeeId || 'company'}_${timestamp}_${uuidv4().slice(0, 8)}`;
      
      registry[entryId] = {
        ...metadata,
        uploadTimestamp: timestamp,
        entryId,
        mockEntry: true
      };

      localStorage.setItem(this.storageKey, JSON.stringify(registry));
      console.log('Mock registry updated:', entryId);
      return entryId;
    } catch (error) {
      console.error('Error updating mock registry:', error);
      throw error;
    }
  }

  getCompanyUploads(companyId) {
    const registry = this.getRegistry();
    return Object.values(registry).filter(entry => entry.companyId === companyId);
  }

  getEmployeeUploads(employeeId) {
    const registry = this.getRegistry();
    return Object.values(registry).filter(entry => entry.employeeId === employeeId);
  }

  clearRegistry() {
    localStorage.removeItem(this.storageKey);
    console.log('Mock registry cleared');
  }
}

// Mock S3 Upload Service (for local testing)
export class MockFileUploadService {
  constructor() {
    this.metadataRegistry = new MockMetadataRegistry();
    this.fileStorage = {}; // In-memory file storage for demo
  }

  /**
   * Mock file upload (stores file info locally)
   */
  async uploadFile(file, companyId, employeeId, questionId, additionalMetadata = {}) {
    try {
      // Simulate upload delay
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

      // Validate inputs
      if (!file || !companyId || !questionId) {
        throw new Error('Missing required parameters: file, companyId, and questionId are required');
      }

      console.log(`Mock uploading file: ${file.name} for company ${companyId}`);

      // Generate mock file ID
      const mockId = `mock_${uuidv4()}`;
      const timestamp = Date.now();
      
      // Create mock storage entry
      this.fileStorage[mockId] = {
        file: file,
        uploadedAt: new Date().toISOString(),
        companyId,
        employeeId,
        questionId
      };

      // Update metadata registry
      const metadata = {
        companyId,
        employeeId: employeeId || null,
        questionId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        mockId,
        formType: employeeId ? 'employee' : 'company',
        storedLocally: true,
        ...additionalMetadata
      };

      const entryId = this.metadataRegistry.updateRegistry(metadata);

      return {
        success: true,
        entryId,
        mockId,
        metadata,
        message: 'File stored locally (mock upload)'
      };

    } catch (error) {
      console.error('Error in mock file upload:', error);
      throw new Error(`Mock file upload failed: ${error.message}`);
    }
  }

  /**
   * Mock file deletion
   */
  async deleteFile(mockId) {
    try {
      if (this.fileStorage[mockId]) {
        delete this.fileStorage[mockId];
        console.log(`Mock file deleted: ${mockId}`);
        return { success: true };
      } else {
        throw new Error('File not found');
      }
    } catch (error) {
      console.error('Error deleting mock file:', error);
      throw new Error(`Mock file deletion failed: ${error.message}`);
    }
  }

  /**
   * Get mock file info
   */
  getFileInfo(mockId) {
    return this.fileStorage[mockId] || null;
  }

  /**
   * List all mock files for a company
   */
  listCompanyFiles(companyId) {
    return Object.entries(this.fileStorage)
      .filter(([_, fileInfo]) => fileInfo.companyId === companyId)
      .map(([mockId, fileInfo]) => ({
        mockId,
        ...fileInfo
      }));
  }

  /**
   * Mock health check
   */
  async healthCheck() {
    return { 
      status: 'mock_healthy', 
      message: 'Mock file service is running (local storage only)',
      filesStored: Object.keys(this.fileStorage).length
    };
  }

  /**
   * Clear all mock data (for testing)
   */
  clearAll() {
    this.fileStorage = {};
    this.metadataRegistry.clearRegistry();
    console.log('All mock file data cleared');
  }
}

// Export singleton instance
export const mockFileUploadService = new MockFileUploadService();
export const mockMetadataRegistry = new MockMetadataRegistry();

// Export utility functions (reuse from fileUtils with fallbacks)
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

// Test function to demonstrate mock functionality
export const testMockService = async () => {
  console.log('🧪 Testing Mock File Upload Service...');
  
  try {
    // Create a mock file
    const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
    
    // Test upload
    const result = await mockFileUploadService.uploadFile(
      mockFile, 
      'TEST_COMPANY_123', 
      'EMP_001', 
      'Q_001',
      { testFile: true }
    );
    
    console.log('✅ Mock upload successful:', result);
    
    // Test health check
    const health = await mockFileUploadService.healthCheck();
    console.log('✅ Health check:', health);
    
    // Test file listing
    const files = mockFileUploadService.listCompanyFiles('TEST_COMPANY_123');
    console.log('✅ Company files:', files);
    
    return true;
  } catch (error) {
    console.error('❌ Mock service test failed:', error);
    return false;
  }
};

// Auto-test on import (only in development)
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 Mock File Upload Service loaded for development');
  // Uncomment to run auto-test:
  // testMockService();
}

export default MockFileUploadService;