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
  const [viewMode, setViewMode] = useState('adaptive'); // 'adaptive', 'compact', 'detailed'

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

  // ENHANCED: Smart question categorization for layout optimization
  const categorizeQuestion = (question) => {
    const { QuestionType, Question, QuestionTypeDetails, AllowFileUpload } = question;
    const questionLength = Question ? Question.length : 0;
    const hasLongText = questionLength > 100;
    const hasFileUpload = AllowFileUpload === 'true';
    
    // Determine question complexity and optimal layout
    if (hasFileUpload || QuestionType === 'textarea' || hasLongText) {
      return { size: 'full', complexity: 'high' };
    } else if (QuestionType === 'yes-no' || QuestionType === 'rating' || (QuestionType === 'single-choice' && questionLength < 60)) {
      return { size: 'compact', complexity: 'low' };
    } else if (QuestionType === 'multiple-choice' || QuestionType === 'slider') {
      return { size: 'medium', complexity: 'medium' };
    } else {
      return { size: 'medium', complexity: 'medium' };
    }
  };

  // ENHANCED: Create optimized question layout groups
  const createQuestionLayout = (sectionQuestions) => {
    const layout = [];
    let currentRow = [];
    let currentRowWidth = 0;
    const maxRowWidth = 12; // Using 12-column grid system

    sectionQuestions.forEach((question) => {
      const category = categorizeQuestion(question);
      let questionWidth;

      switch (category.size) {
        case 'compact':
          questionWidth = 4; // 1/3 width
          break;
        case 'medium':
          questionWidth = 6; // 1/2 width
          break;
        case 'full':
        default:
          questionWidth = 12; // full width
          break;
      }

      // If adding this question would exceed row width, start new row
      if (currentRowWidth + questionWidth > maxRowWidth || questionWidth === 12) {
        if (currentRow.length > 0) {
          layout.push([...currentRow]);
          currentRow = [];
          currentRowWidth = 0;
        }
      }

      currentRow.push({ question, width: questionWidth, category });
      currentRowWidth += questionWidth;

      // If this question takes full width, complete the row
      if (questionWidth === 12) {
        layout.push([...currentRow]);
        currentRow = [];
        currentRowWidth = 0;
      }
    });

    // Add any remaining questions in current row
    if (currentRow.length > 0) {
      layout.push(currentRow);
    }

    return layout;
  };

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

  // ENHANCED: File handling with robust CORS fallback
  const handleInputChange = async (questionId, value, file = null) => {
    // Safety check for employee sessions
    if (formType === 'employee' && !sessionInitialized) {
      console.warn('Cannot save response: Employee session not initialized');
      return;
    }

    // Clear any previous file upload errors for this question
    setFileUploadErrors(prev => ({ ...prev, [questionId]: null }));

    // File upload handling
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

        // Use mock service for file handling
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

        if (useLocalStorage) {
          console.log('File stored locally successfully');
        }

      } catch (error) {
        console.error('File upload error:', error);
        setFileUploadErrors(prev => ({ 
          ...prev, 
          [questionId]: error.message 
        }));
        
        let userMessage = 'File upload failed: ' + error.message;
        
        if (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('execute-api')) {
          userMessage = 'Backend upload service is not available. Files are being stored locally for now.';
          console.warn('CORS/Network error detected, file upload service not configured properly');
        }
        
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

  // Get uploaded file info for display
  const getUploadedFileInfo = (questionId) => {
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
    
    return uploadedFiles[questionId] || null;
  };

  // ENHANCED: Modern question rendering with adaptive layouts
  const renderQuestion = (question, questionIndex, sectionIndex, width = 12, category = null) => {
    const value = responses[question.QuestionID] || '';
    const isRequired = question.Required === 'true';
    const allowFileUpload = question.AllowFileUpload === 'true';
    const isAnswered = answeredQuestions.has(question.QuestionID);
    const isIncomplete = isQuestionIncomplete(question);
    const isUploading = uploadingFiles[question.QuestionID];
    const uploadError = fileUploadErrors[question.QuestionID];
    
    const displayNumber = questionNumberMapping[question.QuestionID] || questionIndex + 1;
    const fileInfo = getUploadedFileInfo(question.QuestionID);
    
    // Determine card size class
    const sizeClass = width === 4 ? 'compact' : width === 6 ? 'medium' : 'full';
    const complexityClass = category?.complexity || 'medium';

    return (
      <div 
        key={question.QuestionID} 
        className={`question-card question-${sizeClass} question-${complexityClass} ${isAnswered ? 'answered' : ''} ${isIncomplete ? 'incomplete' : ''}`}
        style={{ '--grid-width': width }}
      >
        <div className="question-card-inner">
          <div className="question-header-compact">
            <div className="question-info">
              <div className="question-number-badge">{displayNumber}</div>
              <div className="question-text-wrapper">
                <div className="question-text">
                  {question.Question}
                  {isRequired && <span className="question-required"> *</span>}
                </div>
                {question.HelpText && (
                  <div className="question-help-inline">
                    <span className="help-icon">💡</span>
                    <span className="help-text">{question.HelpText}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="question-status">
              {isAnswered && <div className="answered-indicator">✓</div>}
              {isIncomplete && <div className="required-indicator">!</div>}
            </div>
          </div>

          <div className="question-input-wrapper">
            {renderInputField(question, value, sizeClass)}
          </div>

          {allowFileUpload && (
            <div className={`file-upload-section ${sizeClass === 'compact' ? 'compact' : ''}`}>
              <input
                type="file"
                id={`file-${question.QuestionID}`}
                className="file-input"
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (file) {
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
                className={`file-upload-btn ${isUploading ? 'uploading' : ''} ${sizeClass}`}
              >
                {isUploading ? (
                  <>
                    <span className="upload-spinner">⏳</span>
                    Processing...
                  </>
                ) : (
                  <>
                    📎 Attach
                  </>
                )}
              </label>

              {uploadError && !uploadError.includes('CORS') && !uploadError.includes('Failed to fetch') && (
                <div className="file-error-compact">
                  <span className="error-icon">❌</span>
                  <span className="error-text">{uploadError}</span>
                </div>
              )}
              
              {fileInfo && !uploadError && (
                <div className="uploaded-file-compact">
                  <span className="file-status">
                    {fileInfo.fromSavedResponse ? '📁' : '✅'} 
                  </span>
                  <span className="file-name">{fileInfo.name}</span>
                  {fileInfo.size && (
                    <span className="file-size">({formatFileSize(fileInfo.size)})</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ENHANCED: Input field rendering with size-aware layouts
  const renderInputField = (question, value, sizeClass = 'full') => {
    const { QuestionType, QuestionTypeDetails } = question;
    
    // Clean up value to remove file metadata for display in input fields
    const cleanValue = value ? 
      value.replace(/\s*\[FILE_ATTACHED:.*?\]\s*/, '')
           .replace(/\s*\[FILE_UPLOADED:.*?\]\s*/, '')
           .replace(/\s*\[FILE:.*?\]\s*/, '')
           .trim() : '';

    const isCompact = sizeClass === 'compact';

    switch (QuestionType) {
      case 'text':
      case 'email':
      case 'phone':
        return (
          <input
            type={QuestionType}
            value={cleanValue}
            onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
            className={`input-field ${isCompact ? 'compact' : ''}`}
            placeholder={isCompact ? `Enter ${QuestionType}...` : `Enter your ${QuestionType}...`}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={cleanValue}
            onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
            className="input-field textarea-field"
            placeholder="Please provide your detailed response..."
            rows={isCompact ? 3 : 4}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={cleanValue}
            onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
            className={`input-field ${isCompact ? 'compact' : ''}`}
            placeholder="Enter number..."
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={cleanValue}
            onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
            className={`input-field ${isCompact ? 'compact' : ''}`}
          />
        );

      case 'single-choice':
        const singleOptions = QuestionTypeDetails ? QuestionTypeDetails.split('|') : [];
        return (
          <div className={`choice-options ${isCompact ? 'compact' : ''}`}>
            {singleOptions.map((option, index) => (
              <label key={index} className={`choice-option ${cleanValue === option ? 'selected' : ''} ${isCompact ? 'compact' : ''}`}>
                <input
                  type="radio"
                  name={question.QuestionID}
                  value={option}
                  checked={cleanValue === option}
                  onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
                  className="choice-input"
                />
                <span className="choice-label">{option}</span>
                {!isCompact && <span className="choice-checkmark">✓</span>}
              </label>
            ))}
          </div>
        );

      case 'multiple-choice':
        const multipleOptions = QuestionTypeDetails ? QuestionTypeDetails.split('|') : [];
        const selectedValues = typeof cleanValue === 'string' ? cleanValue.split(',').filter(v => v) : [];
        
        return (
          <div className={`choice-options ${isCompact ? 'compact' : ''}`}>
            {multipleOptions.map((option, index) => (
              <label key={index} className={`choice-option ${selectedValues.includes(option) ? 'selected' : ''} ${isCompact ? 'compact' : ''}`}>
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
                {!isCompact && <span className="choice-checkmark">✓</span>}
              </label>
            ))}
            {!isCompact && (
              <div className="selected-count">
                {selectedValues.length} option{selectedValues.length !== 1 ? 's' : ''} selected
              </div>
            )}
          </div>
        );

      case 'slider':
        const [min, max] = QuestionTypeDetails ? QuestionTypeDetails.split(',').map(Number) : [0, 100];
        return (
          <div className={`slider-container ${isCompact ? 'compact' : ''}`}>
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
              <strong>{cleanValue || min}</strong>
            </div>
          </div>
        );

      case 'rating':
        const [ratingMin, ratingMax] = QuestionTypeDetails ? QuestionTypeDetails.split(',').map(Number) : [1, 5];
        return (
          <div className={`rating-container ${isCompact ? 'compact' : ''}`}>
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
          <div className={`choice-options yes-no-options ${isCompact ? 'compact' : ''}`}>
            {['Yes', 'No'].map((option) => (
              <label key={option} className={`choice-option choice-yn ${cleanValue === option ? 'selected' : ''} ${option.toLowerCase()} ${isCompact ? 'compact' : ''}`}>
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
                {!isCompact && <span className="choice-checkmark">✓</span>}
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
            className={`input-field ${isCompact ? 'compact' : ''}`}
            placeholder="Enter your response..."
          />
        );
    }
  };

  // ENHANCED: Modern section navigation with better visual design
  const renderSectionNavigation = () => {
    if (sections.length <= 1) return null;

    return (
      <div className="section-navigation-modern">
        <div className="section-nav-header">
          <h3>Assessment Sections</h3>
          <div className="view-mode-toggle">
            <button 
              className={`view-btn ${viewMode === 'adaptive' ? 'active' : ''}`}
              onClick={() => setViewMode('adaptive')}
              title="Adaptive Layout"
            >
              📱
            </button>
            <button 
              className={`view-btn ${viewMode === 'compact' ? 'active' : ''}`}
              onClick={() => setViewMode('compact')}
              title="Compact View"
            >
              📋
            </button>
            <button 
              className={`view-btn ${viewMode === 'detailed' ? 'active' : ''}`}
              onClick={() => setViewMode('detailed')}
              title="Detailed View"
            >
              📄
            </button>
          </div>
        </div>
        
        <div className="section-tabs-modern">
          {sections.map((section, index) => {
            const progress = getSectionProgress(section.questions);
            const isActive = currentSection === index;
            const hasAnswers = progress > 0;
            const isComplete = progress === 100;
            
            return (
              <button
                key={section.name}
                className={`section-tab-modern ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''} ${hasAnswers ? 'has-progress' : ''}`}
                onClick={() => setCurrentSection(index)}
              >
                <div className="tab-content">
                  <div className="tab-header">
                    <span className="section-name">{section.name}</span>
                    <span className="question-count">{section.questions.length} questions</span>
                  </div>
                  <div className="tab-progress">
                    <div className="progress-bar-mini">
                      <div 
                        className="progress-fill-mini" 
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="progress-text">{Math.round(progress)}%</span>
                  </div>
                </div>
                {isComplete && <div className="completion-badge">✓</div>}
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
    <div className="form-renderer-modern">
      {/* Modern header with enhanced stats */}
      <div className="form-header-modern">
        <div className="form-title-section">
          <h2>
            {formType === 'company' ? '🏢 Company Assessment' : '👤 Employee Assessment'}
            {formType === 'employee' && employeeId !== null && (
              <span className="employee-id-indicator">#{employeeId}</span>
            )}
          </h2>
          <div className="form-stats-modern">
            <div className="stat-item">
              <span className="stat-number">{answeredQuestions.size}</span>
              <span className="stat-label">Answered</span>
            </div>
            <div className="stat-divider">of</div>
            <div className="stat-item">
              <span className="stat-number">{questions.length}</span>
              <span className="stat-label">Total</span>
            </div>
            <div className="completion-percentage">
              {Math.round((answeredQuestions.size / questions.length) * 100)}% Complete
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced section navigation */}
      {renderSectionNavigation()}

      {/* ENHANCED: Modern responsive question grid layout */}
      {sections.length > 1 ? (
        // Single section view with modern grid
        <div className="section-view-modern">
          {sections[currentSection] && (
            <div key={sections[currentSection].name} className="question-section-modern">
              <div className="section-header-modern">
                <div className="section-info">
                  <h3 className="section-title">{sections[currentSection].name}</h3>
                  <div className="section-meta">
                    <span className="question-count">{sections[currentSection].questions.length} questions</span>
                    <span className="progress-indicator">
                      {Math.round(getSectionProgress(sections[currentSection].questions))}% complete
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Smart grid layout based on view mode */}
              <div className={`questions-grid questions-grid-${viewMode}`}>
                {viewMode === 'adaptive' ? (
                  // Adaptive layout with intelligent grouping
                  createQuestionLayout(sections[currentSection].questions).map((row, rowIndex) => (
                    <div key={rowIndex} className="question-row">
                      {row.map(({ question, width, category }, questionIndex) => 
                        renderQuestion(question, questionIndex, currentSection, width, category)
                      )}
                    </div>
                  ))
                ) : viewMode === 'compact' ? (
                  // Compact layout - maximum questions per row
                  <div className="questions-grid-compact">
                    {sections[currentSection].questions.map((question, questionIndex) => 
                      renderQuestion(question, questionIndex, currentSection, 6, { size: 'compact', complexity: 'low' })
                    )}
                  </div>
                ) : (
                  // Detailed layout - one question per row
                  <div className="questions-grid-detailed">
                    {sections[currentSection].questions.map((question, questionIndex) => 
                      renderQuestion(question, questionIndex, currentSection, 12, { size: 'full', complexity: 'high' })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Modern section navigation */}
          <div className="section-nav-controls">
            <button 
              className="nav-btn nav-btn-prev"
              onClick={() => setCurrentSection(Math.max(0, currentSection - 1))}
              disabled={currentSection === 0}
            >
              ← Previous Section
            </button>
            <div className="section-progress-indicator">
              Section {currentSection + 1} of {sections.length}
            </div>
            <button 
              className="nav-btn nav-btn-next"
              onClick={() => setCurrentSection(Math.min(sections.length - 1, currentSection + 1))}
              disabled={currentSection === sections.length - 1}
            >
              Next Section →
            </button>
          </div>
        </div>
      ) : (
        // All sections view with modern grid
        <div className="all-sections-view-modern">
          {sections.map((section, sectionIndex) => (
            <div key={section.name} className="question-section-modern">
              <div className="section-header-modern">
                <div className="section-info">
                  <h3 className="section-title">{section.name}</h3>
                  <div className="section-meta">
                    <span className="question-count">{section.questions.length} questions</span>
                    <span className="progress-indicator">
                      {Math.round(getSectionProgress(section.questions))}% complete
                    </span>
                  </div>
                </div>
              </div>
              
              <div className={`questions-grid questions-grid-${viewMode}`}>
                {viewMode === 'adaptive' ? (
                  createQuestionLayout(section.questions).map((row, rowIndex) => (
                    <div key={rowIndex} className="question-row">
                      {row.map(({ question, width, category }, questionIndex) => 
                        renderQuestion(question, questionIndex, sectionIndex, width, category)
                      )}
                    </div>
                  ))
                ) : viewMode === 'compact' ? (
                  <div className="questions-grid-compact">
                    {section.questions.map((question, questionIndex) => 
                      renderQuestion(question, questionIndex, sectionIndex, 6, { size: 'compact', complexity: 'low' })
                    )}
                  </div>
                ) : (
                  <div className="questions-grid-detailed">
                    {section.questions.map((question, questionIndex) => 
                      renderQuestion(question, questionIndex, sectionIndex, 12, { size: 'full', complexity: 'high' })
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modern completion summary */}
      <div className="completion-summary-modern">
        <div className="summary-card-modern">
          <div className="summary-header">
            <h3>Assessment Progress</h3>
            <div className="progress-ring">
              <svg className="progress-ring-svg" width="60" height="60">
                <circle
                  className="progress-ring-bg"
                  stroke="#e5e7eb"
                  strokeWidth="4"
                  fill="transparent"
                  r="26"
                  cx="30"
                  cy="30"
                />
                <circle
                  className="progress-ring-progress"
                  stroke="#3b82f6"
                  strokeWidth="4"
                  fill="transparent"
                  r="26"
                  cx="30"
                  cy="30"
                  strokeDasharray={`${Math.round((answeredQuestions.size / questions.length) * 163.36)} 163.36`}
                  transform="rotate(-90 30 30)"
                />
              </svg>
              <div className="progress-ring-text">
                {Math.round((answeredQuestions.size / questions.length) * 100)}%
              </div>
            </div>
          </div>
          
          <div className="progress-details">
            <div className="detail-item">
              <span className="detail-number">{answeredQuestions.size}</span>
              <span className="detail-label">Questions Answered</span>
            </div>
            <div className="detail-item">
              <span className="detail-number">{questions.length - answeredQuestions.size}</span>
              <span className="detail-label">Remaining</span>
            </div>
          </div>

          <div className="completion-status">
            {answeredQuestions.size === questions.length ? (
              <div className="completion-celebration">
                🎉 <strong>Assessment Complete!</strong> All questions have been answered.
              </div>
            ) : (
              <div className="completion-encouragement">
                Keep going! You're making excellent progress.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormRenderer;