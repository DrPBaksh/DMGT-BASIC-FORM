// utils/fileUtils.js
// Utility functions for file handling and validation

/**
 * File type mappings and validation utilities
 */
export const FILE_TYPES = {
  // Documents
  PDF: 'application/pdf',
  DOC: 'application/msword',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  TXT: 'text/plain',
  RTF: 'application/rtf',
  
  // Spreadsheets
  XLS: 'application/vnd.ms-excel',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  CSV: 'text/csv',
  
  // Presentations
  PPT: 'application/vnd.ms-powerpoint',
  PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  
  // Images
  JPEG: 'image/jpeg',
  JPG: 'image/jpeg',
  PNG: 'image/png',
  GIF: 'image/gif',
  WEBP: 'image/webp',
  BMP: 'image/bmp',
  SVG: 'image/svg+xml',
  
  // Archives
  ZIP: 'application/zip',
  RAR: 'application/x-rar-compressed',
  
  // Others
  JSON: 'application/json',
  XML: 'application/xml'
};

/**
 * Default allowed file types for uploads
 */
export const DEFAULT_ALLOWED_TYPES = [
  FILE_TYPES.PDF,
  FILE_TYPES.DOC,
  FILE_TYPES.DOCX,
  FILE_TYPES.TXT,
  FILE_TYPES.XLS,
  FILE_TYPES.XLSX,
  FILE_TYPES.CSV,
  FILE_TYPES.PPT,
  FILE_TYPES.PPTX,
  FILE_TYPES.JPEG,
  FILE_TYPES.PNG,
  FILE_TYPES.GIF
];

/**
 * File size constants
 */
export const FILE_SIZE_LIMITS = {
  MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  MAX_SIZE_MB: 10,
  WARN_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  WARN_SIZE_MB: 5
};

/**
 * Validate file type against allowed types
 * @param {File} file - The file to validate
 * @param {Array} allowedTypes - Array of allowed MIME types
 * @returns {Object} - Validation result with success and error message
 */
export const validateFileType = (file, allowedTypes = DEFAULT_ALLOWED_TYPES) => {
  if (!file) {
    return { isValid: false, error: 'No file provided' };
  }

  if (!allowedTypes.includes(file.type)) {
    const allowedExtensions = getAllowedExtensions(allowedTypes);
    return {
      isValid: false,
      error: `File type "${file.type}" is not allowed. Allowed types: ${allowedExtensions.join(', ')}`
    };
  }

  return { isValid: true, error: null };
};

/**
 * Validate file size
 * @param {File} file - The file to validate
 * @param {number} maxSizeInMB - Maximum file size in megabytes
 * @returns {Object} - Validation result with success and error message
 */
export const validateFileSize = (file, maxSizeInMB = FILE_SIZE_LIMITS.MAX_SIZE_MB) => {
  if (!file) {
    return { isValid: false, error: 'No file provided' };
  }

  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  
  if (file.size > maxSizeInBytes) {
    return {
      isValid: false,
      error: `File size (${formatFileSize(file.size)}) exceeds maximum allowed size of ${maxSizeInMB}MB`
    };
  }

  return { isValid: true, error: null };
};

/**
 * Comprehensive file validation
 * @param {File} file - The file to validate
 * @param {Object} options - Validation options
 * @returns {Object} - Validation result with success, warnings, and errors
 */
export const validateFile = (file, options = {}) => {
  const {
    allowedTypes = DEFAULT_ALLOWED_TYPES,
    maxSizeInMB = FILE_SIZE_LIMITS.MAX_SIZE_MB,
    warnSizeInMB = FILE_SIZE_LIMITS.WARN_SIZE_MB
  } = options;

  const result = {
    isValid: true,
    errors: [],
    warnings: []
  };

  // Validate file existence
  if (!file) {
    result.isValid = false;
    result.errors.push('No file provided');
    return result;
  }

  // Validate file type
  const typeValidation = validateFileType(file, allowedTypes);
  if (!typeValidation.isValid) {
    result.isValid = false;
    result.errors.push(typeValidation.error);
  }

  // Validate file size
  const sizeValidation = validateFileSize(file, maxSizeInMB);
  if (!sizeValidation.isValid) {
    result.isValid = false;
    result.errors.push(sizeValidation.error);
  }

  // Check for size warnings
  const warnSizeInBytes = warnSizeInMB * 1024 * 1024;
  if (file.size > warnSizeInBytes && result.isValid) {
    result.warnings.push(`Large file size (${formatFileSize(file.size)}). Upload may take longer.`);
  }

  // Validate file name
  if (file.name && file.name.length > 255) {
    result.warnings.push('File name is very long and may be truncated.');
  }

  // Check for special characters in filename
  if (file.name && /[<>:"/\\|?*]/.test(file.name)) {
    result.warnings.push('File name contains special characters that may cause issues.');
  }

  return result;
};

/**
 * Format file size in human-readable format
 * @param {number} sizeInBytes - File size in bytes
 * @returns {string} - Formatted file size
 */
export const formatFileSize = (sizeInBytes) => {
  if (sizeInBytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(sizeInBytes) / Math.log(k));
  
  return parseFloat((sizeInBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Get file extension from filename
 * @param {string} filename - The filename
 * @returns {string} - File extension (lowercase)
 */
export const getFileExtension = (filename) => {
  if (!filename) return '';
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.slice(lastDot + 1).toLowerCase() : '';
};

/**
 * Get allowed extensions from MIME types
 * @param {Array} mimeTypes - Array of MIME types
 * @returns {Array} - Array of file extensions
 */
export const getAllowedExtensions = (mimeTypes) => {
  const extensionMap = {
    [FILE_TYPES.PDF]: 'pdf',
    [FILE_TYPES.DOC]: 'doc',
    [FILE_TYPES.DOCX]: 'docx',
    [FILE_TYPES.TXT]: 'txt',
    [FILE_TYPES.RTF]: 'rtf',
    [FILE_TYPES.XLS]: 'xls',
    [FILE_TYPES.XLSX]: 'xlsx',
    [FILE_TYPES.CSV]: 'csv',
    [FILE_TYPES.PPT]: 'ppt',
    [FILE_TYPES.PPTX]: 'pptx',
    [FILE_TYPES.JPEG]: 'jpg',
    [FILE_TYPES.PNG]: 'png',
    [FILE_TYPES.GIF]: 'gif',
    [FILE_TYPES.WEBP]: 'webp',
    [FILE_TYPES.BMP]: 'bmp',
    [FILE_TYPES.SVG]: 'svg',
    [FILE_TYPES.ZIP]: 'zip',
    [FILE_TYPES.RAR]: 'rar',
    [FILE_TYPES.JSON]: 'json',
    [FILE_TYPES.XML]: 'xml'
  };

  return mimeTypes
    .map(type => extensionMap[type])
    .filter(ext => ext)
    .map(ext => `.${ext}`);
};

/**
 * Sanitize filename for safe storage
 * @param {string} filename - Original filename
 * @returns {string} - Sanitized filename
 */
export const sanitizeFilename = (filename) => {
  if (!filename) return 'unnamed_file';
  
  // Remove or replace problematic characters
  let sanitized = filename
    .replace(/[<>:"/\\|?*]/g, '_')  // Replace unsafe characters with underscore
    .replace(/\s+/g, '_')           // Replace spaces with underscore
    .replace(/_{2,}/g, '_')         // Replace multiple underscores with single
    .replace(/^_+|_+$/g, '');       // Remove leading/trailing underscores
  
  // Ensure filename isn't empty after sanitization
  if (!sanitized) {
    sanitized = 'unnamed_file';
  }
  
  // Limit length
  const maxLength = 200;
  if (sanitized.length > maxLength) {
    const extension = getFileExtension(filename);
    const nameWithoutExt = sanitized.slice(0, maxLength - extension.length - 1);
    sanitized = `${nameWithoutExt}.${extension}`;
  }
  
  return sanitized;
};

/**
 * Generate unique filename with timestamp
 * @param {string} originalFilename - Original filename
 * @returns {string} - Unique filename with timestamp
 */
export const generateUniqueFilename = (originalFilename) => {
  const timestamp = Date.now();
  const sanitizedName = sanitizeFilename(originalFilename);
  const extension = getFileExtension(sanitizedName);
  const nameWithoutExt = sanitizedName.slice(0, -(extension.length + 1));
  
  return `${timestamp}_${nameWithoutExt}.${extension}`;
};

/**
 * Check if file is an image
 * @param {File|string} file - File object or MIME type string
 * @returns {boolean} - True if file is an image
 */
export const isImageFile = (file) => {
  const mimeType = typeof file === 'string' ? file : file.type;
  return mimeType.startsWith('image/');
};

/**
 * Check if file is a document
 * @param {File|string} file - File object or MIME type string
 * @returns {boolean} - True if file is a document
 */
export const isDocumentFile = (file) => {
  const mimeType = typeof file === 'string' ? file : file.type;
  const documentTypes = [
    FILE_TYPES.PDF,
    FILE_TYPES.DOC,
    FILE_TYPES.DOCX,
    FILE_TYPES.TXT,
    FILE_TYPES.RTF
  ];
  return documentTypes.includes(mimeType);
};

/**
 * Check if file is a spreadsheet
 * @param {File|string} file - File object or MIME type string
 * @returns {boolean} - True if file is a spreadsheet
 */
export const isSpreadsheetFile = (file) => {
  const mimeType = typeof file === 'string' ? file : file.type;
  const spreadsheetTypes = [
    FILE_TYPES.XLS,
    FILE_TYPES.XLSX,
    FILE_TYPES.CSV
  ];
  return spreadsheetTypes.includes(mimeType);
};

/**
 * Get file type category
 * @param {File|string} file - File object or MIME type string
 * @returns {string} - File category (image, document, spreadsheet, presentation, archive, other)
 */
export const getFileCategory = (file) => {
  const mimeType = typeof file === 'string' ? file : file.type;
  
  if (isImageFile(file)) return 'image';
  if (isDocumentFile(file)) return 'document';
  if (isSpreadsheetFile(file)) return 'spreadsheet';
  
  const presentationTypes = [FILE_TYPES.PPT, FILE_TYPES.PPTX];
  if (presentationTypes.includes(mimeType)) return 'presentation';
  
  const archiveTypes = [FILE_TYPES.ZIP, FILE_TYPES.RAR];
  if (archiveTypes.includes(mimeType)) return 'archive';
  
  return 'other';
};

/**
 * Get appropriate icon for file type
 * @param {File|string} file - File object or MIME type string
 * @returns {string} - Emoji icon for file type
 */
export const getFileIcon = (file) => {
  const category = getFileCategory(file);
  
  const icons = {
    image: '🖼️',
    document: '📄',
    spreadsheet: '📊',
    presentation: '📽️',
    archive: '📦',
    other: '📁'
  };
  
  return icons[category] || icons.other;
};

/**
 * Create file preview info object
 * @param {File} file - File object
 * @returns {Object} - File preview information
 */
export const createFilePreview = (file) => {
  if (!file) return null;
  
  return {
    name: file.name,
    size: file.size,
    sizeFormatted: formatFileSize(file.size),
    type: file.type,
    category: getFileCategory(file),
    icon: getFileIcon(file),
    extension: getFileExtension(file.name),
    lastModified: file.lastModified ? new Date(file.lastModified) : null,
    isImage: isImageFile(file),
    isDocument: isDocumentFile(file),
    isSpreadsheet: isSpreadsheetFile(file)
  };
};

/**
 * Read file as data URL (for image previews)
 * @param {File} file - File object
 * @returns {Promise<string>} - Data URL string
 */
export const readFileAsDataURL = (file) => {
  return new Promise((resolve, reject) => {
    if (!isImageFile(file)) {
      reject(new Error('File is not an image'));
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

/**
 * Compress image file (basic client-side compression)
 * @param {File} file - Image file
 * @param {Object} options - Compression options
 * @returns {Promise<File>} - Compressed file
 */
export const compressImage = (file, options = {}) => {
  return new Promise((resolve, reject) => {
    if (!isImageFile(file)) {
      reject(new Error('File is not an image'));
      return;
    }
    
    const {
      maxWidth = 1920,
      maxHeight = 1080,
      quality = 0.8,
      type = file.type
    } = options;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const compressedFile = new File([blob], file.name, {
            type: type,
            lastModified: Date.now()
          });
          resolve(compressedFile);
        } else {
          reject(new Error('Failed to compress image'));
        }
      }, type, quality);
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

export default {
  FILE_TYPES,
  DEFAULT_ALLOWED_TYPES,
  FILE_SIZE_LIMITS,
  validateFileType,
  validateFileSize,
  validateFile,
  formatFileSize,
  getFileExtension,
  getAllowedExtensions,
  sanitizeFilename,
  generateUniqueFilename,
  isImageFile,
  isDocumentFile,
  isSpreadsheetFile,
  getFileCategory,
  getFileIcon,
  createFilePreview,
  readFileAsDataURL,
  compressImage
};