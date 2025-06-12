import React from 'react';

const ProgressBar = ({ progress, currentQuestion, totalQuestions }) => {
  return (
    <div className="progress-container">
      <div className="progress-header">
        <span className="progress-text">Assessment Progress</span>
        <span className="progress-stats">
          {currentQuestion} of {totalQuestions} questions answered
        </span>
      </div>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${Math.min(progress, 100)}%` }}
        ></div>
      </div>
    </div>
  );
};

export default ProgressBar;