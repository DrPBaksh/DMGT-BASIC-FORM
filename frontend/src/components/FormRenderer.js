import React, { useState, useEffect } from 'react';

const FormRenderer = ({ questions, responses, onResponseChange, onQuestionChange, companyId, formType }) => {
  const [uploadedFiles, setUploadedFiles] = useState({});

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
  
  useEffect(() => {
    // Notify parent about current question for progress tracking
    const totalQuestions = questions.length;
    const answeredQuestions = Object.keys(responses).length;
    onQuestionChange(answeredQuestions);
  }, [responses, questions.length, onQuestionChange]);

  const handleInputChange = (questionId, value, file = null) => {
    onResponseChange(questionId, value, file);
    
    if (file) {
      setUploadedFiles(prev => ({
        ...prev,
        [questionId]: file.name
      }));
    }
  };

  const renderQuestion = (question, index) => {
    const value = responses[question.QuestionID] || '';
    const isRequired = question.Required === 'true';
    const allowFileUpload = question.AllowFileUpload === 'true';

    return (
      <div key={question.QuestionID} className="question-item fade-in">
        <div className="question-header">
          <div className="question-text">
            {question.Question}
            {isRequired && <span className="question-required"> *</span>}
          </div>
          <div className="question-number">{question.QuestionOrder}</div>
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
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  handleInputChange(question.QuestionID, value, file);
                }
              }}
            />
            <label htmlFor={`file-${question.QuestionID}`} className="file-upload-button">
              📎 Upload Supporting Document
            </label>
            <div className="file-upload-text">
              Optional: Upload any relevant documents to support your answer
            </div>
            {uploadedFiles[question.QuestionID] && (
              <div className="uploaded-file">
                ✅ Uploaded: {uploadedFiles[question.QuestionID]}
              </div>
            )}
          </div>
        )}
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
          <input
            type={QuestionType}
            value={value}
            onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
            className="input-field"
            placeholder={`Enter your ${QuestionType}...`}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value}
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
            value={value}
            onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
            className="input-field"
            placeholder="Enter a number..."
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
            className="input-field"
          />
        );

      case 'single-choice':
        const singleOptions = QuestionTypeDetails ? QuestionTypeDetails.split('|') : [];
        return (
          <div className="choice-options">
            {singleOptions.map((option, index) => (
              <label key={index} className={`choice-option ${value === option ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name={question.QuestionID}
                  value={option}
                  checked={value === option}
                  onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
                  className="choice-input"
                />
                <span className="choice-label">{option}</span>
              </label>
            ))}
          </div>
        );

      case 'multiple-choice':
        const multipleOptions = QuestionTypeDetails ? QuestionTypeDetails.split('|') : [];
        const selectedValues = typeof value === 'string' ? value.split(',').filter(v => v) : [];
        
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
              </label>
            ))}
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
              value={value || min}
              onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
              className="slider-input"
            />
            <div className="slider-labels">
              <span>{min}</span>
              <span>{max}</span>
            </div>
            <div className="slider-value">
              Current value: {value || min}
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
                  className={`rating-star ${Number(value) >= rating ? 'active' : ''}`}
                  onClick={() => handleInputChange(question.QuestionID, rating.toString())}
                >
                  ⭐
                </button>
              ))}
            </div>
            <span className="rating-label">
              {value ? `${value}/${ratingMax}` : 'Not rated'}
            </span>
          </div>
        );

      case 'yes-no':
        return (
          <div className="choice-options">
            {['Yes', 'No'].map((option) => (
              <label key={option} className={`choice-option ${value === option ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name={question.QuestionID}
                  value={option}
                  checked={value === option}
                  onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
                  className="choice-input"
                />
                <span className="choice-label">{option}</span>
              </label>
            ))}
          </div>
        );

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleInputChange(question.QuestionID, e.target.value)}
            className="input-field"
            placeholder="Enter your response..."
          />
        );
    }
  };

  if (!questions || questions.length === 0) {
    return (
      <div className="empty-state">
        <p>No questions available for this assessment.</p>
      </div>
    );
  }

  return (
    <div className="form-renderer">
      {sortedSections.map((sectionName) => (
        <div key={sectionName} className="question-section">
          <div className="section-header">
            {sectionName}
          </div>
          {groupedQuestions[sectionName]
            .sort((a, b) => Number(a.QuestionOrder) - Number(b.QuestionOrder))
            .map((question, index) => renderQuestion(question, index))}
        </div>
      ))}
    </div>
  );
};

export default FormRenderer;