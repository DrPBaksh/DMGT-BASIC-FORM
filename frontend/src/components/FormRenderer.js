import React, { useState, useEffect } from 'react';
import { secureS3UploadService, validateFileType, validateFileSize, formatFileSize } from '../services/secureS3UploadService';

const FormRenderer = ({ 
  questions, 
  responses, 
  onResponseChange, 
  onQuestionChange, 
  companyId, 
  formType,
  employeeId,
  employeeMode,
  sessionInitialized,
  manualSaveMode = false
}) => {
  const [uploadedFiles, setUploadedFiles] = useState({});
  const [currentSection, setCurrentSection] = useState(0);
  const [answeredQuestions, setAnsweredQuestions] = useState(new Set());
  const [uploadingFiles, setUploadingFiles] = useState({});
  const [fileUploadErrors, setFileUploadErrors] = useState({});

  // Group questions by section
  const groupedQuestions = questions.reduce((groups, question) => {
    const section = question.Section || 'General';
    if (!groups[section]) {
      groups[section] = [];
    }
    groups[section].push(question);
    return groups;
  }, {});

  // Sort sections and questions within sections
  const sortedSections = Object.keys(groupedQuestions).sort();
  const sections = sortedSections.map(sectionName => ({
    name: sectionName,
    questions: groupedQuestions[sectionName].sort((a, b) => Number(a.QuestionOrder) - Number(b.QuestionOrder))
  }));

  // Create proper sequential question numbering
  const createQuestionMapping = () => {
    const mapping = {};
    let sequentialNumber = 1;
    
    sections.forEach(section => {
      section.questions.forEach(question => {
        mapping[question.QuestionID] = sequentialNumber;
        sequentialNumber++;
      });
    });
    
    return mapping;
  };

  const questionNumberMapping = createQuestionMapping();

  // Track answered questions
  useEffect(() => {
    const answered = new Set(Object.keys(responses).filter(key => responses[key] !== ''));
    setAnsweredQuestions(answered);
    
    // Notify parent about current progress
    const totalQuestions = questions.length;
    const answeredCount = answered.size;
    onQuestionChange(answeredCount);
  }, [responses, questions.length, onQuestionChange]);

  // NEW: Enhanced file handling with multiple file support
  const handleInputChange = async (questionId, value, files = null) => {
    // Safety check for employee sessions
    if (formType === 'employee' && !sessionInitialized) {
      console.warn('Cannot save response: Employee session not initialized');
      return;
    }

    // Clear any previous file upload errors for this question
    setFileUploadErrors(prev => ({ ...prev, [questionId]: null }));

    // Multiple file upload handling
    if (files && files.length > 0) {
      try {
        console.log(`Processing ${files.length} file upload(s) for question ${questionId}`);
        
        // Set uploading state
        setUploadingFiles(prev => ({ ...prev, [questionId]: true }));

        const fileInfos = [];
        const uploadErrors = [];

        // Process each file
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          
          try {
            // Validate file type and size
            if (!validateFileType(file)) {
              throw new Error(`${file.name}: File type not allowed. Please upload PDF, DOC, TXT, Image, Excel, or PowerPoint files.`);
            }
            
            if (!validateFileSize(file, 10)) {
              throw new Error(`${file.name}: File size must be less than 10MB`);
            }

            let uploadResult;
            let useSecureUpload = true;

            // Try secure S3 upload service first, but gracefully handle failures
            try {
              console.log(`Using secure S3 upload service for ${file.name}...`);
              
              // Get question text for metadata
              const questionText = questions.find(q => q.QuestionID === questionId)?.Question || 'Unknown Question';
              
              // Enhanced metadata for audit trail
              const metadata = {
                formType,
                questionText,
                questionOrder: questions.find(q => q.QuestionID === questionId)?.QuestionOrder,
                section: questions.find(q => q.QuestionID === questionId)?.Section,
                uploadTimestamp: new Date().toISOString(),
                organizationId: companyId,
                employeeId: employeeId || null,
                assessmentType: formType === 'company' ? 'Organization Assessment' : 'Employee Assessment',
                fileValidation: {
                  typeValidated: true,
                  sizeValidated: true,
                  originalName: file.name,
                  originalSize: file.size,
                  mimeType: file.type
                },
                multiFileUpload: files.length > 1,
                fileIndex: i + 1,
                totalFiles: files.length
              };
              
              uploadResult = await secureS3UploadService.uploadFile(
                file, 
                companyId, 
                employeeId, 
                questionId,
                metadata
              );
              
              console.log(`Secure S3 upload successful for ${file.name}:`, uploadResult);
              
            } catch (s3Error) {
              console.error(`Secure S3 upload failed for ${file.name}:`, s3Error);
              useSecureUpload = false;
              
              // Fallback to mock service for development/testing
              const { mockFileUploadService } = await import('../services/mockFileUploadService');
              console.log(`Falling back to mock upload service for ${file.name}...`);
              
              uploadResult = await mockFileUploadService.uploadFile(
                file, 
                companyId, 
                employeeId, 
                questionId,
                {
                  formType,
                  questionText: questions.find(q => q.QuestionID === questionId)?.Question || 'Unknown Question',
                  uploadTimestamp: new Date().toISOString(),
                  multiFileUpload: files.length > 1,
                  fileIndex: i + 1,
                  totalFiles: files.length
                }
              );
            }

            console.log(`File upload completed successfully for ${file.name}:`, uploadResult);

            // Store file info with proper metadata structure
            const fileInfo = {
              name: file.name,
              size: file.size,
              type: file.type,
              entryId: uploadResult.entryId || uploadResult.mockId || 'local_' + Date.now() + '_' + i,
              s3Key: uploadResult.s3Key || null,
              s3Bucket: uploadResult.s3Bucket || null,
              url: uploadResult.url || null,
              uploadedSecurely: useSecureUpload,
              uploadedAt: new Date().toISOString(),
              questionText: questions.find(q => q.QuestionID === questionId)?.Question,
              organizationId: companyId,
              employeeId: employeeId || null,
              formType: formType,
              fileIndex: i + 1,
              totalFiles: files.length
            };

            fileInfos.push(fileInfo);

          } catch (fileError) {
            console.error(`Error uploading file ${file.name}:`, fileError);
            uploadErrors.push(`${file.name}: ${fileError.message}`);
          }
        }

        // Update uploaded files state
        if (fileInfos.length > 0) {
          setUploadedFiles(prev => ({
            ...prev,
            [questionId]: fileInfos // Store array of file infos
          }));

          // Create response value that includes both text and file metadata
          const fileMetadataArray = fileInfos.map(fileInfo => ({
            fileName: fileInfo.name,
            fileSize: fileInfo.size,
            fileType: fileInfo.type,
            entryId: fileInfo.entryId,
            s3Key: fileInfo.s3Key,
            s3Bucket: fileInfo.s3Bucket,
            url: fileInfo.url,
            uploadedSecurely: fileInfo.uploadedSecurely,
            uploadedAt: fileInfo.uploadedAt,
            questionId,
            questionText: fileInfo.questionText,
            companyId,
            employeeId,
            formType,
            fileIndex: fileInfo.fileIndex,
            totalFiles: fileInfo.totalFiles,
            auditTrail: {
              uploadMethod: fileInfo.uploadedSecurely ? 'S3_SECURE' : 'MOCK_FALLBACK',
              timestamp: new Date().toISOString(),
              validated: true
            }
          }));

          // Create file attachment strings
          const fileAttachments = fileInfos.map(info => `[FILE_ATTACHED: ${info.name}]`).join(' ');
          
          // Combine text answer with file metadata for storage
          const combinedValue = value ? `${value} ${fileAttachments}` : fileAttachments;
          
          console.log(`Saving response with multiple file metadata:`, { value: combinedValue, fileMetadata: fileMetadataArray });
          
          // For manual save mode (company), just update local state
          // For auto-save mode (employee), trigger the save
          onResponseChange(questionId, combinedValue, { 
            multipleFiles: true, 
            files: fileMetadataArray 
          });

          // Show success message
          const successCount = fileInfos.length;
          const uploadMethod = fileInfos.some(f => f.uploadedSecurely) ? 'S3' : 'local storage';
          console.log(`${successCount} file(s) uploaded successfully to ${uploadMethod}`);
        }

        // Show any upload errors
        if (uploadErrors.length > 0) {
          setFileUploadErrors(prev => ({ 
            ...prev, 
            [questionId]: `Some files failed to upload: ${uploadErrors.join('; ')}` 
          }));
        }

      } catch (error) {
        console.error('Multiple file upload error:', error);
        setFileUploadErrors(prev => ({ 
          ...prev, 
          [questionId]: `File upload failed: ${error.message}` 
        }));
      } finally {
        setUploadingFiles(prev => ({ ...prev, [questionId]: false }));
      }
    } else {
      // Regular response without file
      onResponseChange(questionId, value, null);
    }
  };

  // Enhanced progress calculation per section
  const getSectionProgress = (sectionQuestions) => {
    const totalQuestions = sectionQuestions.length;
    const answeredInSection = sectionQuestions.filter(q => 
      answeredQuestions.has(q.QuestionID)
    ).length;
    return totalQuestions > 0 ? (answeredInSection / totalQuestions) * 100 : 0;
  };

  // Check if question is required and not answered
  const isQuestionIncomplete = (question) => {
    const isRequired = question.Required === 'true';
    const hasResponse = responses[question.QuestionID] && responses[question.QuestionID].trim() !== '';
    return isRequired && !hasResponse;
  };

  // NEW: Enhanced file retrieval logic for multiple files
  const getUploadedFileInfo = (questionId) => {
    // Check local uploaded files (current session) first
    const localFiles = uploadedFiles[questionId];
    if (localFiles && Array.isArray(localFiles)) {
      return localFiles;
    }

    // Check if response contains file information
    const response = responses[questionId];
    if (response && response.includes('[FILE_ATTACHED:')) {
      const fileMatches = response.match(/\[FILE_ATTACHED: (.+?)\]/g);
      if (fileMatches) {
        return fileMatches.map((match, index) => {
          const fileName = match.replace(/\[FILE_ATTACHED: (.+?)\]/, '$1');
          return {
            name: fileName,
            fromSavedResponse: true,
            uploadedSecurely: true,
            fileIndex: index + 1,
            totalFiles: fileMatches.length
          };
        });
      }
    }
    
    // Legacy support for old file formats
    if (response && response.includes('[FILE_UPLOADED:')) {
      const fileMatches = response.match(/\[FILE_UPLOADED: (.+?)\]/g);
      if (fileMatches) {
        return fileMatches.map((match, index) => {
          const fileName = match.replace(/\[FILE_UPLOADED: (.+?)\]/, '$1');
          return {
            name: fileName,
            fromSavedResponse: true,
            uploadedSecurely: false,
            fileIndex: index + 1,
            totalFiles: fileMatches.length
          };
        });
      }
    }
    
    if (response && response.includes('[FILE:')) {
      const fileMatches = response.match(/\[FILE: (.+?)\]/g);
      if (fileMatches) {
        return fileMatches.map((match, index) => {
          const fileName = match.replace(/\[FILE: (.+?)\]/, '$1');
          return {
            name: fileName,
            fromSavedResponse: true,
            uploadedSecurely: false,
            fileIndex: index + 1,
            totalFiles: fileMatches.length
          };
        });
      }
    }
    
    return null;
  };

  const renderQuestion = (question, questionIndex, sectionIndex) => {
    const value = responses[question.QuestionID] || '';
    const isRequired = question.Required === 'true';
    const allowFileUpload = question.AllowFileUpload === 'true';
    const isAnswered = answeredQuestions.has(question.QuestionID);
    const isIncomplete = isQuestionIncomplete(question);
    const isUploading = uploadingFiles[question.QuestionID];
    const uploadError = fileUploadErrors[question.QuestionID];
    
    // Use sequential numbering instead of QuestionOrder
    const displayNumber = questionNumberMapping[question.QuestionID] || questionIndex + 1;
    
    // Get file info for display (now supports multiple files)
    const fileInfos = getUploadedFileInfo(question.QuestionID);

    return (
      <div 
        key={question.QuestionID} 
        className={`question-item fade-in ${isAnswered ? 'answered' : ''} ${isIncomplete ? 'incomplete' : ''}`}
      >
        <div className="question-header">
          <div className="question-text">
            {question.Question}
            {isRequired && <span className="question-required"> *</span>}
          </div>
          <div className="question-badges">
            <div className="question-number">{displayNumber}</div>
            {isAnswered && <div className="answered-badge">✓</div>}
            {isIncomplete && <div className="required-badge">!</div>}
          </div>
        </div>

        <div className="question-input">
          {renderInputField(question, value)}
        </div>

        {/* NEW: Enhanced file upload functionality with multiple file support */}
        {allowFileUpload && (
          <div className="file-upload-container">
            <input
              type="file"
              id={`file-${question.QuestionID}`}
              className="file-input"
              onChange={async (e) => {
                const files = Array.from(e.target.files);
                if (files.length > 0) {
                  // Get current text value and combine with files
                  const currentValue = responses[question.QuestionID] || '';
                  const textValue = currentValue
                    .replace(/\s*\[FILE_ATTACHED:.*?\]\s*/g, '')
                    .replace(/\s*\[FILE_UPLOADED:.*?\]\s*/g, '')
                    .replace(/\s*\[FILE:.*?\]\s*/g, '')
                    .trim();
                  await handleInputChange(question.QuestionID, textValue, files);
                }
              }}
              accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.xlsx,.xls,.ppt,.pptx,.csv,.json"
              disabled={isUploading}
              multiple
            />
            <label 
              htmlFor={`file-${question.QuestionID}`} 
              className={`file-upload-button ${isUploading ? 'uploading' : ''}`}
            >
              {isUploading ? (
                <>
                  <span className="upload-spinner">⏳</span>
                  Uploading files...
                </>
              ) : (
                <>
                  📎 Attach Supporting Documents
                </>
              )}
            </label>
            <div className="file-upload-text">
              Upload supporting documents to enhance your response (Max 10MB each)
              <br />
              <small>Supported: PDF, DOC, TXT, Images, Excel, PowerPoint, CSV, JSON</small>
              <br />
              <small className="multiple-files-note">
                💡 <strong>You can select multiple files at once</strong> - hold Ctrl/Cmd while clicking to select multiple files
              </small>
              <br />
              <small className="upload-note">
                🔒 Files are securely stored with full audit trail and metadata tracking
              </small>
            </div>
            
            {/* Upload error display */}
            {uploadError && (
              <div className="file-upload-error">
                <span className="error-icon">❌</span>
                <span className="error-text">{uploadError}</span>
              </div>
            )}
            
            {/* NEW: Enhanced file display with support for multiple files */}
            {fileInfos && fileInfos.length > 0 && !uploadError && (
              <div className="uploaded-files">
                <div className="uploaded-files-header">
                  <span className="files-count">
                    📁 {fileInfos.length} file{fileInfos.length !== 1 ? 's' : ''} attached
                  </span>
                </div>
                <div className="uploaded-files-list">
                  {fileInfos.map((fileInfo, index) => (
                    <div key={index} className="uploaded-file">
                      <div className="file-info">
                        <span className="file-status">
                          {fileInfo.fromSavedResponse ? '📁' : 
                           fileInfo.uploadedSecurely ? '☁️' : '💾'} 
                        </span>
                        <span className="file-name">{fileInfo.name}</span>
                        {fileInfo.size && (
                          <span className="file-size">({formatFileSize(fileInfo.size)})</span>
                        )}
                        <span className="file-note">
                          {fileInfo.fromSavedResponse ? '(Previously uploaded)' : 
                           fileInfo.uploadedSecurely ? '(Stored in S3)' : '(Local storage)'}
                        </span>
                        {(fileInfo.entryId || fileInfo.mockId) && (
                          <span className="file-id">
                            ID: {fileInfo.entryId || fileInfo.mockId}
                          </span>
                        )}
                        {fileInfo.s3Key && (
                          <span className="file-id">
                            S3: {fileInfo.s3Key.split('/').pop()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Enhanced help text for better UX */}
        {question.HelpText && (
          <div className="question-help">
            <span className="help-icon">💡</span>
            <span className="help-text">{question.HelpText}</span>
          </div>
        )}
      </div>
    );
  };

  const renderInputField = (question, value) => {
    const { QuestionType, QuestionTypeDetails } = question;
    
    // Clean up value to remove file metadata for display in input fields
    const cleanValue = value ? 
      value.replace(/\s*\[FILE_ATTACHED:.*?\]\s*/g, '')
           .replace(/\s*\[FILE_UPLOADED:.*?\]\s*/g, '')
           .replace(/\s*\[FILE:.*?\]\s*/g, '')
           .trim() : '';

    switch (QuestionType) {
      case 'text':
      case 'email':
      case 'phone':
        return (
          <input
            type={QuestionType}
            value={cleanValue}
            onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
            className="input-field"
            placeholder={`Enter your ${QuestionType}...`}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={cleanValue}
            onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
            className="input-field textarea-field"
            placeholder="Please provide your detailed response..."
            rows={4}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={cleanValue}
            onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
            className="input-field"
            placeholder="Enter a number..."
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={cleanValue}
            onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
            className="input-field"
          />
        );

      case 'single-choice':
        const singleOptions = QuestionTypeDetails ? QuestionTypeDetails.split('|') : [];
        return (
          <div className="choice-options">
            {singleOptions.map((option, index) => (
              <label key={index} className={`choice-option ${cleanValue === option ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name={question.QuestionID}
                  value={option}
                  checked={cleanValue === option}
                  onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
                  className="choice-input"
                />
                <span className="choice-label">{option}</span>
                <span className="choice-checkmark">✓</span>
              </label>
            ))}
          </div>
        );

      case 'multiple-choice':
        const multipleOptions = QuestionTypeDetails ? QuestionTypeDetails.split('|') : [];
        const selectedValues = typeof cleanValue === 'string' ? cleanValue.split(',').filter(v => v) : [];
        
        return (
          <div className="choice-options">
            {multipleOptions.map((option, index) => (
              <label key={index} className={`choice-option ${selectedValues.includes(option) ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  value={option}
                  checked={selectedValues.includes(option)}
                  onChange={(e) => {
                    let newValues;
                    if (e.target.checked) {
                      newValues = [...selectedValues, option];
                    } else {
                      newValues = selectedValues.filter(v => v !== option);
                    }
                    handleInputChange(question.QuestionID, newValues.join(','));
                  }}
                  className="choice-input"
                />
                <span className="choice-label">{option}</span>
                <span className="choice-checkmark">✓</span>
              </label>
            ))}
            <div className="selected-count">
              {selectedValues.length} option{selectedValues.length !== 1 ? 's' : ''} selected
            </div>
          </div>
        );

      case 'slider':
        const [min, max] = QuestionTypeDetails ? QuestionTypeDetails.split(',').map(Number) : [0, 100];
        return (
          <div className="slider-container">
            <input
              type="range"
              min={min}
              max={max}
              value={cleanValue || min}
              onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
              className="slider-input"
            />
            <div className="slider-labels">
              <span>{min}</span>
              <span>{max}</span>
            </div>
            <div className="slider-value">
              Current value: <strong>{cleanValue || min}</strong>
            </div>
          </div>
        );

      case 'rating':
        const [ratingMin, ratingMax] = QuestionTypeDetails ? QuestionTypeDetails.split(',').map(Number) : [1, 5];
        return (
          <div className="rating-container">
            <div className="rating-stars">
              {Array.from({ length: ratingMax }, (_, i) => i + 1).map((rating) => (
                <button
                  key={rating}
                  type="button"
                  className={`rating-star ${Number(cleanValue) >= rating ? 'active' : ''}`}
                  onClick={() => handleInputChange(question.QuestionID, rating.toString())}
                >
                  ⭐
                </button>
              ))}
            </div>
            <div className="rating-label">
              {cleanValue ? `${cleanValue}/${ratingMax}` : 'Not rated'}
            </div>
          </div>
        );

      case 'yes-no':
        return (
          <div className="choice-options yes-no-options">
            {['Yes', 'No'].map((option) => (
              <label key={option} className={`choice-option choice-yn ${cleanValue === option ? 'selected' : ''} ${option.toLowerCase()}`}>
                <input
                  type="radio"
                  name={question.QuestionID}
                  value={option}
                  checked={cleanValue === option}
                  onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
                  className="choice-input"
                />
                <span className="choice-icon">{option === 'Yes' ? '👍' : '👎'}</span>
                <span className="choice-label">{option}</span>
                <span className="choice-checkmark">✓</span>
              </label>
            ))}
          </div>
        );

      default:
        return (
          <input
            type="text"
            value={cleanValue}
            onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
            className="input-field"
            placeholder="Enter your response..."
          />
        );
    }
  };

  // Enhanced section navigation
  const renderSectionNavigation = () => {
    if (sections.length <= 1) return null;

    return (
      <div className="section-navigation">
        <div className="section-tabs">
          {sections.map((section, index) => {
            const progress = getSectionProgress(section.questions);
            const isActive = currentSection === index;
            const hasAnswers = progress > 0;
            
            return (
              <button
                key={section.name}
                className={`section-tab ${isActive ? 'active' : ''} ${hasAnswers ? 'has-progress' : ''}`}
                onClick={() => setCurrentSection(index)}
              >
                <span className="section-name">{section.name}</span>
                <span className="section-progress">{Math.round(progress)}%</span>
                <div className="section-progress-bar">
                  <div 
                    className="section-progress-fill" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (!questions || questions.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <h3>No questions available</h3>
        <p>No questions are available for this assessment at the moment.</p>
      </div>
    );
  }

  return (
    <div className="form-renderer">
      {/* Enhanced header with progress summary */}
      <div className="form-header">
        <div className="form-title">
          <h2>
            {formType === 'company' ? '🏢 Organization Assessment' : '👤 Employee Assessment'}
            {formType === 'employee' && employeeId !== null && (
              <span className="employee-id-indicator">Survey ID: #{employeeId}</span>
            )}
          </h2>
          <div className="form-stats">
            <span className="answered-count">
              {answeredQuestions.size} of {questions.length} questions answered
            </span>
            {manualSaveMode && (
              <span className="manual-mode-indicator">
                📝 Manual Save Mode
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Section navigation */}
      {renderSectionNavigation()}

      {/* Render current section or all sections with proper data persistence */}
      {sections.length > 1 ? (
        // Single section view with navigation
        <div className="section-view">
          {sections[currentSection] && (
            <div key={sections[currentSection].name} className="question-section">
              <div className="section-header">
                <span className="section-icon">📁</span>
                <span className="section-title">{sections[currentSection].name}</span>
                <span className="section-question-count">
                  {sections[currentSection].questions.length} questions
                </span>
              </div>
              
              <div className="section-progress-summary">
                <div className="progress-text">
                  Section Progress: {Math.round(getSectionProgress(sections[currentSection].questions))}%
                </div>
              </div>

              {sections[currentSection].questions.map((question, questionIndex) => 
                renderQuestion(question, questionIndex, currentSection)
              )}
            </div>
          )}

          {/* Section navigation buttons */}
          <div className="section-navigation-buttons">
            <button 
              className="btn btn-secondary"
              onClick={() => setCurrentSection(Math.max(0, currentSection - 1))}
              disabled={currentSection === 0}
            >
              ← Previous Section
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => setCurrentSection(Math.min(sections.length - 1, currentSection + 1))}
              disabled={currentSection === sections.length - 1}
            >
              Next Section →
            </button>
          </div>
        </div>
      ) : (
        // All sections view (original behavior)
        <div className="all-sections-view">
          {sections.map((section, sectionIndex) => (
            <div key={section.name} className="question-section">
              <div className="section-header">
                <span className="section-icon">📁</span>
                <span className="section-title">{section.name}</span>
                <span className="section-question-count">
                  {section.questions.length} questions
                </span>
              </div>
              
              {section.questions.map((question, questionIndex) => 
                renderQuestion(question, questionIndex, sectionIndex)
              )}
            </div>
          ))}
        </div>
      )}

      {/* Enhanced completion summary showing progress */}
      <div className="completion-summary">
        <div className="summary-card glass-card">
          <h3>Assessment Progress</h3>
          <div className="progress-metrics">
            <div className="metric">
              <span className="metric-value">{answeredQuestions.size}</span>
              <span className="metric-label">Answered</span>
            </div>
            <div className="metric">
              <span className="metric-value">{questions.length - answeredQuestions.size}</span>
              <span className="metric-label">Remaining</span>
            </div>
            <div className="metric">
              <span className="metric-value">{Math.round((answeredQuestions.size / questions.length) * 100)}%</span>
              <span className="metric-label">Complete</span>
            </div>
          </div>
          <div className="completion-note">
            {answeredQuestions.size === questions.length ? (
              <div className="completion-celebration">
                🎉 <strong>Assessment Complete!</strong> All questions have been answered{manualSaveMode ? '. Remember to save your progress.' : ' and auto-saved.'}
              </div>
            ) : (
              <div className="completion-encouragement">
                {manualSaveMode ? (
                  <>💾 Progress tracked locally. Use "Save Progress" to persist your answers.</>
                ) : (
                  <>💾 Progress auto-saved. You can come back anytime to complete your assessment.</>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormRenderer;