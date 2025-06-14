import React, { useState, useEffect } from 'react';

const FormRenderer = ({ questions, responses, onResponseChange, onQuestionChange, companyId, formType }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState({});
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Group questions by section
  const groupedQuestions = questions.reduce((groups, question) => {
    const section = question.Section || 'General';
    if (!groups[section]) {
      groups[section] = [];
    }
    groups[section].push(question);
    return groups;
  }, {});

  // Flatten questions for step-by-step navigation
  const allQuestions = Object.values(groupedQuestions)
    .flat()
    .sort((a, b) => Number(a.QuestionOrder) - Number(b.QuestionOrder));

  const currentQuestion = allQuestions[currentQuestionIndex];
  const totalQuestions = allQuestions.length;
  const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100;

  useEffect(() => {
    onQuestionChange(currentQuestionIndex);
  }, [currentQuestionIndex, onQuestionChange]);

  // Utility function to format option text
  const formatOptionText = (text) => {
    if (!text) return '';
    return text
      .replace(/_/g, ' ') // Replace underscores with spaces
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim() // Remove leading/trailing spaces
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' '); // Proper title case
  };

  const handleInputChange = (questionId, value, file = null) => {
    onResponseChange(questionId, value, file);
    
    if (file) {
      setUploadedFiles(prev => ({
        ...prev,
        [questionId]: file.name
      }));
    }
  };

  const navigateToQuestion = (index) => {
    if (index >= 0 && index < totalQuestions) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentQuestionIndex(index);
        setIsTransitioning(false);
      }, 150);
    }
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      navigateToQuestion(currentQuestionIndex + 1);
    }
  };

  const previousQuestion = () => {
    if (currentQuestionIndex > 0) {
      navigateToQuestion(currentQuestionIndex - 1);
    }
  };

  const isAnswered = (question) => {
    const answer = responses[question.QuestionID];
    return answer !== undefined && answer !== null && answer !== '';
  };

  const renderProgressDots = () => {
    return (
      <div className="progress-dots">
        {allQuestions.map((question, index) => {
          const isActive = index === currentQuestionIndex;
          const isCompleted = isAnswered(question);
          const isAccessible = index <= currentQuestionIndex || isCompleted;

          return (
            <button
              key={question.QuestionID}
              className={`progress-dot ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${!isAccessible ? 'disabled' : ''}`}
              onClick={() => isAccessible && navigateToQuestion(index)}
              disabled={!isAccessible}
              title={`Question ${index + 1}: ${question.Question.substring(0, 50)}...`}
            >
              {isCompleted ? '✓' : index + 1}
            </button>
          );
        })}
      </div>
    );
  };

  const renderInputField = (question, value) => {
    const { QuestionType, QuestionTypeDetails } = question;

    switch (QuestionType) {
      case 'text':
      case 'email':
      case 'phone':
        return (
          <div className="input-wrapper">
            <input
              type={QuestionType}
              value={value}
              onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
              className="modern-input"
              placeholder={`Enter your ${QuestionType}...`}
            />
          </div>
        );

      case 'textarea':
        return (
          <div className="input-wrapper">
            <textarea
              value={value}
              onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
              className="modern-textarea"
              placeholder="Please provide your detailed response..."
              rows={4}
            />
          </div>
        );

      case 'number':
        return (
          <div className="input-wrapper">
            <input
              type="number"
              value={value}
              onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
              className="modern-input"
              placeholder="Enter a number..."
            />
          </div>
        );

      case 'date':
        return (
          <div className="input-wrapper">
            <input
              type="date"
              value={value}
              onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
              className="modern-input"
            />
          </div>
        );

      case 'single-choice':
        const singleOptions = QuestionTypeDetails ? QuestionTypeDetails.split('|') : [];
        return (
          <div className="choice-grid">
            {singleOptions.map((option, index) => {
              const formattedOption = formatOptionText(option);
              const isSelected = value === option;
              
              return (
                <label key={index} className={`choice-card ${isSelected ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name={question.QuestionID}
                    value={option}
                    checked={isSelected}
                    onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
                    className="choice-input-hidden"
                  />
                  <div className="choice-indicator">
                    <div className="choice-dot"></div>
                  </div>
                  <div className="choice-content">
                    <span className="choice-text">{formattedOption}</span>
                  </div>
                </label>
              );
            })}
          </div>
        );

      case 'multiple-choice':
        const multipleOptions = QuestionTypeDetails ? QuestionTypeDetails.split('|') : [];
        const selectedValues = typeof value === 'string' ? value.split(',').filter(v => v) : [];
        
        return (
          <div className="choice-grid multi-select">
            {multipleOptions.map((option, index) => {
              const formattedOption = formatOptionText(option);
              const isSelected = selectedValues.includes(option);
              
              return (
                <label key={index} className={`choice-card ${isSelected ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    value={option}
                    checked={isSelected}
                    onChange={(e) => {
                      let newValues;
                      if (e.target.checked) {
                        newValues = [...selectedValues, option];
                      } else {
                        newValues = selectedValues.filter(v => v !== option);
                      }
                      handleInputChange(question.QuestionID, newValues.join(','));
                    }}
                    className="choice-input-hidden"
                  />
                  <div className="choice-indicator">
                    <div className="choice-check">
                      {isSelected && <span className="checkmark">✓</span>}
                    </div>
                  </div>
                  <div className="choice-content">
                    <span className="choice-text">{formattedOption}</span>
                  </div>
                </label>
              );
            })}
          </div>
        );

      case 'slider':
        const [min, max] = QuestionTypeDetails ? QuestionTypeDetails.split(',').map(Number) : [0, 100];
        const sliderValue = value || min;
        return (
          <div className="slider-wrapper">
            <div className="slider-header">
              <span className="slider-label-min">{min}%</span>
              <div className="slider-value-display">
                <span className="slider-current-value">{sliderValue}%</span>
              </div>
              <span className="slider-label-max">{max}%</span>
            </div>
            <div className="modern-slider-container">
              <input
                type="range"
                min={min}
                max={max}
                value={sliderValue}
                onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
                className="modern-slider"
              />
              <div 
                className="slider-fill" 
                style={{ width: `${((sliderValue - min) / (max - min)) * 100}%` }}
              ></div>
            </div>
          </div>
        );

      case 'rating':
        const [ratingMin, ratingMax] = QuestionTypeDetails ? QuestionTypeDetails.split(',').map(Number) : [1, 5];
        return (
          <div className="rating-wrapper">
            <div className="rating-stars">
              {Array.from({ length: ratingMax }, (_, i) => i + 1).map((rating) => {
                const isActive = Number(value) >= rating;
                return (
                  <button
                    key={rating}
                    type="button"
                    className={`rating-star ${isActive ? 'active' : ''}`}
                    onClick={() => handleInputChange(question.QuestionID, rating.toString())}
                  >
                    <span className="star-icon">★</span>
                  </button>
                );
              })}
            </div>
            <div className="rating-label">
              {value ? `${value} out of ${ratingMax} stars` : 'Click to rate'}
            </div>
          </div>
        );

      case 'yes-no':
        return (
          <div className="yes-no-wrapper">
            {['Yes', 'No'].map((option) => {
              const isSelected = value === option;
              return (
                <label key={option} className={`yes-no-option ${isSelected ? 'selected' : ''} ${option.toLowerCase()}`}>
                  <input
                    type="radio"
                    name={question.QuestionID}
                    value={option}
                    checked={isSelected}
                    onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
                    className="choice-input-hidden"
                  />
                  <div className="yes-no-indicator">
                    <span className="yes-no-icon">
                      {option === 'Yes' ? '✓' : '✗'}
                    </span>
                  </div>
                  <span className="yes-no-text">{option}</span>
                </label>
              );
            })}
          </div>
        );

      default:
        return (
          <div className="input-wrapper">
            <input
              type="text"
              value={value}
              onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
              className="modern-input"
              placeholder="Enter your response..."
            />
          </div>
        );
    }
  };

  const renderFileUpload = (question) => {
    const allowFileUpload = question.AllowFileUpload === 'true';
    if (!allowFileUpload) return null;

    return (
      <div className="file-upload-section">
        <div className="file-upload-header">
          <span className="file-upload-icon">📎</span>
          <span className="file-upload-title">Supporting Documents</span>
        </div>
        
        <div className="file-upload-dropzone">
          <input
            type="file"
            id={`file-${question.QuestionID}`}
            className="file-input-hidden"
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                handleInputChange(question.QuestionID, responses[question.QuestionID] || '', file);
              }
            }}
          />
          <label htmlFor={`file-${question.QuestionID}`} className="file-upload-area">
            <div className="file-upload-content">
              <div className="file-upload-icon-large">📄</div>
              <div className="file-upload-text">
                <span className="file-upload-primary">Click to upload</span>
                <span className="file-upload-secondary">or drag and drop</span>
              </div>
              <div className="file-upload-note">
                Upload any relevant documents to support your answer
              </div>
            </div>
          </label>
        </div>

        {uploadedFiles[question.QuestionID] && (
          <div className="uploaded-file-display">
            <span className="file-success-icon">✅</span>
            <span className="file-name">{uploadedFiles[question.QuestionID]}</span>
          </div>
        )}
      </div>
    );
  };

  if (!questions || questions.length === 0) {
    return (
      <div className="empty-state-modern">
        <div className="empty-icon">📋</div>
        <h3>No Questions Available</h3>
        <p>Please check your configuration or try again later.</p>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="loading-state-modern">
        <div className="loading-spinner-modern"></div>
        <p>Loading questions...</p>
      </div>
    );
  }

  const isRequired = currentQuestion.Required === 'true';
  const value = responses[currentQuestion.QuestionID] || '';
  const sectionName = currentQuestion.Section || 'General';

  return (
    <div className="form-renderer-modern">
      {/* Progress Header */}
      <div className="progress-header">
        <div className="progress-info">
          <span className="progress-step">Question {currentQuestionIndex + 1} of {totalQuestions}</span>
          <span className="progress-section">{sectionName}</span>
        </div>
        <div className="progress-bar-container">
          <div className="progress-bar-track">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <span className="progress-percentage">{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Progress Dots */}
      {renderProgressDots()}

      {/* Question Card */}
      <div className={`question-card ${isTransitioning ? 'transitioning' : ''}`}>
        <div className="question-header-modern">
          <div className="question-badge">
            <span className="question-number">{currentQuestion.QuestionOrder}</span>
          </div>
          <div className="question-content">
            <h2 className="question-title">
              {currentQuestion.Question}
              {isRequired && <span className="required-indicator">*</span>}
            </h2>
          </div>
        </div>

        <div className="question-body">
          {renderInputField(currentQuestion, value)}
          {renderFileUpload(currentQuestion)}
        </div>

        {/* Navigation */}
        <div className="question-navigation">
          <button
            className="nav-button secondary"
            onClick={previousQuestion}
            disabled={currentQuestionIndex === 0}
          >
            <span className="nav-icon">←</span>
            Previous
          </button>
          
          <div className="nav-spacer"></div>
          
          <button
            className="nav-button primary"
            onClick={nextQuestion}
            disabled={currentQuestionIndex === totalQuestions - 1}
          >
            Next
            <span className="nav-icon">→</span>
          </button>
        </div>
      </div>

      {/* Completion Summary */}
      {currentQuestionIndex === totalQuestions - 1 && (
        <div className="completion-summary">
          <div className="completion-icon">🎉</div>
          <h3>Almost Done!</h3>
          <p>You've reached the final question. Review your answers and complete the assessment.</p>
        </div>
      )}
    </div>
  );
};

export default FormRenderer;