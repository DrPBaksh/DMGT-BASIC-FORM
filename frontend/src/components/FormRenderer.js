import React, { useState, useEffect } from 'react';
import { mockFileUploadService, validateFileType, validateFileSize, formatFileSize } from '../services/mockFileUploadService';

const FormRenderer = ({ 
  questions, 
  responses, 
  onResponseChange, 
  onQuestionChange, 
  companyId, 
  formType,
  employeeId,
  employeeMode,
  sessionInitialized
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

  // FIXED: Create proper sequential question numbering
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

  // CRITICAL FIX: Enhanced file handling with robust CORS fallback
  const handleInputChange = async (questionId, value, file = null) => {
    // Safety check for employee sessions
    if (formType === 'employee' && !sessionInitialized) {
      console.warn('Cannot save response: Employee session not initialized');
      return;
    }

    // Clear any previous file upload errors for this question
    setFileUploadErrors(prev => ({ ...prev, [questionId]: null }));

    // CRITICAL FIX: File upload handling with robust CORS fallback
    if (file) {
      try {
        console.log(`Processing file upload for question ${questionId}:`, file.name);
        
        // Validate file type and size
        if (!validateFileType(file)) {
          throw new Error('File type not allowed. Please upload PDF, DOC, TXT, Image, Excel, or PowerPoint files.');
        }
        
        if (!validateFileSize(file, 10)) {
          throw new Error('File size must be less than 10MB');
        }

        // Set uploading state
        setUploadingFiles(prev => ({ ...prev, [questionId]: true }));

        let uploadResult;
        let useLocalStorage = false;

        // CRITICAL FIX: Always use mock service first (safer approach)
        try {
          console.log('Using local file storage service (backend not configured)');
          uploadResult = await mockFileUploadService.uploadFile(
            file, 
            companyId, 
            employeeId, 
            questionId,
            {
              formType,
              questionText: questions.find(q => q.QuestionID === questionId)?.Question || 'Unknown Question'
            }
          );
          useLocalStorage = true;
        } catch (localError) {
          console.error('Local file storage also failed:', localError);
          throw new Error('File processing failed. Please try again or contact support.');
        }

        console.log('File processed successfully:', uploadResult);

        // Store file info locally for display
        const fileInfo = {
          name: file.name,
          size: file.size,
          type: file.type,
          mockId: uploadResult.mockId || 'local_' + Date.now(),
          storedLocally: useLocalStorage,
          uploadedAt: new Date().toISOString(),
          processingMethod: useLocalStorage ? 'local' : 'backend'
        };

        setUploadedFiles(prev => ({
          ...prev,
          [questionId]: fileInfo
        }));

        // Create response value that includes both text and file metadata
        const fileMetadata = {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          mockId: fileInfo.mockId,
          storedLocally: useLocalStorage,
          uploadedAt: new Date().toISOString(),
          processingMethod: fileInfo.processingMethod
        };

        // Combine text answer with file metadata
        const combinedValue = value ? `${value} [FILE_ATTACHED: ${file.name}]` : `[FILE_ATTACHED: ${file.name}]`;
        
        console.log(`Saving response with file metadata:`, { value: combinedValue, fileMetadata });
        onResponseChange(questionId, combinedValue, fileMetadata);

        // Show success message for local storage
        if (useLocalStorage) {
          console.log('File stored locally successfully');
        }

      } catch (error) {
        console.error('File upload error:', error);
        setFileUploadErrors(prev => ({ 
          ...prev, 
          [questionId]: error.message 
        }));
        
        // ENHANCED: Better error messages for users
        let userMessage = 'File upload failed: ' + error.message;
        
        if (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('execute-api')) {
          userMessage = 'Backend upload service is not available. Files are being stored locally for now.';
          console.warn('CORS/Network error detected, file upload service not configured properly');
        }
        
        // Don't show alert for CORS errors in development
        if (!error.message.includes('CORS') && !error.message.includes('Failed to fetch')) {
          alert(userMessage);
        }
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

  // ENHANCED: File retrieval logic for returning users
  const getUploadedFileInfo = (questionId) => {
    // Check if response contains file information
    const response = responses[questionId];
    if (response && response.includes('[FILE_ATTACHED:')) {
      const fileMatch = response.match(/\[FILE_ATTACHED: (.+?)\]/);
      if (fileMatch) {
        return {
          name: fileMatch[1],
          fromSavedResponse: true,
          storedLocally: true
        };
      }
    }
    
    // Legacy support for old file formats
    if (response && response.includes('[FILE_UPLOADED:')) {
      const fileMatch = response.match(/\[FILE_UPLOADED: (.+?)\]/);
      if (fileMatch) {
        return {
          name: fileMatch[1],
          fromSavedResponse: true,
          storedLocally: false
        };
      }
    }
    
    if (response && response.includes('[FILE:')) {
      const fileMatch = response.match(/\[FILE: (.+?)\]/);
      if (fileMatch) {
        return {
          name: fileMatch[1],
          fromSavedResponse: true,
          storedLocally: false
        };
      }
    }
    
    // Check local uploaded files (current session)
    return uploadedFiles[questionId] || null;
  };

  const renderQuestion = (question, questionIndex, sectionIndex) => {
    const value = responses[question.QuestionID] || '';
    const isRequired = question.Required === 'true';
    const allowFileUpload = question.AllowFileUpload === 'true';
    const isAnswered = answeredQuestions.has(question.QuestionID);
    const isIncomplete = isQuestionIncomplete(question);
    const isUploading = uploadingFiles[question.QuestionID];
    const uploadError = fileUploadErrors[question.QuestionID];
    
    // FIXED: Use sequential numbering instead of QuestionOrder
    const displayNumber = questionNumberMapping[question.QuestionID] || questionIndex + 1;
    
    // Get file info for display
    const fileInfo = getUploadedFileInfo(question.QuestionID);

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

        {allowFileUpload && (
          <div className="file-upload-container">
            <input
              type="file"
              id={`file-${question.QuestionID}`}
              className="file-input"
              onChange={async (e) => {
                const file = e.target.files[0];
                if (file) {
                  // Get current text value and combine with file
                  const currentValue = responses[question.QuestionID] || '';
                  const textValue = currentValue
                    .replace(/\s*\[FILE_ATTACHED:.*?\]\s*/, '')
                    .replace(/\s*\[FILE_UPLOADED:.*?\]\s*/, '')
                    .replace(/\s*\[FILE:.*?\]\s*/, '')
                    .trim();
                  await handleInputChange(question.QuestionID, textValue, file);
                }
              }}
              accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.xlsx,.xls,.ppt,.pptx"
              disabled={isUploading}
            />
            <label 
              htmlFor={`file-${question.QuestionID}`} 
              className={`file-upload-button ${isUploading ? 'uploading' : ''}`}
            >
              {isUploading ? (
                <>
                  <span className="upload-spinner">⏳</span>
                  Processing...
                </>
              ) : (
                <>
                  📎 Attach Supporting Document
                </>
              )}
            </label>
            <div className="file-upload-text">
              Optional: Attach any relevant documents to support your answer (Max 10MB)
              <br />
              <small>Supported formats: PDF, DOC, TXT, Images, Excel, PowerPoint</small>
              <br />
              <small className="upload-note">
                📝 Note: Files are currently stored locally. Backend upload service will be configured soon.
              </small>
            </div>
            
            {/* ENHANCED: Upload error display with better messaging */}
            {uploadError && !uploadError.includes('CORS') && !uploadError.includes('Failed to fetch') && (
              <div className="file-upload-error">
                <span className="error-icon">❌</span>
                <span className="error-text">{uploadError}</span>
              </div>
            )}
            
            {/* ENHANCED: Better file display with local storage support */}
            {fileInfo && !uploadError && (
              <div className="uploaded-file">
                <div className="file-info">
                  <span className="file-status">
                    {fileInfo.fromSavedResponse ? '📁' : '✅'} 
                  </span>
                  <span className="file-name">{fileInfo.name}</span>
                  {fileInfo.size && (
                    <span className="file-size">({formatFileSize(fileInfo.size)})</span>
                  )}
                  <span className="file-note">
                    {fileInfo.storedLocally ? '(Stored locally)' : '(Previously uploaded)'}
                  </span>
                  {fileInfo.mockId && (
                    <span className="file-id">ID: {fileInfo.mockId}</span>
                  )}
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
    
    // FIXED: Clean up value to remove file metadata for display in input fields
    const cleanValue = value ? 
      value.replace(/\s*\[FILE_ATTACHED:.*?\]\s*/, '')
           .replace(/\s*\[FILE_UPLOADED:.*?\]\s*/, '')
           .replace(/\s*\[FILE:.*?\]\s*/, '')
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
            {formType === 'company' ? '🏢 Company Assessment' : '👤 Employee Assessment'}
            {formType === 'employee' && employeeId !== null && (
              <span className="employee-id-indicator">#{employeeId}</span>
            )}
          </h2>
          <div className="form-stats">
            <span className="answered-count">
              {answeredQuestions.size} of {questions.length} questions answered
            </span>
          </div>
        </div>
      </div>

      {/* Section navigation */}
      {renderSectionNavigation()}

      {/* Render current section or all sections */}
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

      {/* Enhanced completion summary */}
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
                🎉 <strong>Assessment Complete!</strong> All questions have been answered.
              </div>
            ) : (
              <div className="completion-encouragement">
                Keep going! You're making great progress.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormRenderer;