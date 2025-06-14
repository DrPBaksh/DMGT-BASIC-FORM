import React from 'react';

const ProgressBar = ({ progress, currentQuestion, totalQuestions }) => {
  const progressPercentage = Math.round(progress);
  
  return (
    <div className="progress-bar">
      <div className="progress-header">
        <div className="progress-text">
          Assessment Progress
        </div>
        <div className="progress-stats">
          Question {currentQuestion} of {totalQuestions} • {progressPercentage}% Complete
        </div>
      </div>
      
      <div className="progress-track">
        <div 
          className="progress-fill" 
          style={{ width: `${progressPercentage}%` }}
        ></div>
      </div>

      <div className="progress-milestones">
        <div className="milestone">
          <div className={`milestone-marker ${progressPercentage >= 25 ? 'completed' : ''}`}>
            <span className="milestone-icon">
              {progressPercentage >= 25 ? '✓' : '1'}
            </span>
          </div>
          <span className="milestone-label">Getting Started</span>
        </div>
        
        <div className="milestone">
          <div className={`milestone-marker ${progressPercentage >= 50 ? 'completed' : ''}`}>
            <span className="milestone-icon">
              {progressPercentage >= 50 ? '✓' : '2'}
            </span>
          </div>
          <span className="milestone-label">Halfway There</span>
        </div>
        
        <div className="milestone">
          <div className={`milestone-marker ${progressPercentage >= 75 ? 'completed' : ''}`}>
            <span className="milestone-icon">
              {progressPercentage >= 75 ? '✓' : '3'}
            </span>
          </div>
          <span className="milestone-label">Almost Done</span>
        </div>
        
        <div className="milestone">
          <div className={`milestone-marker ${progressPercentage >= 100 ? 'completed' : ''}`}>
            <span className="milestone-icon">
              {progressPercentage >= 100 ? '✓' : '🎉'}
            </span>
          </div>
          <span className="milestone-label">Complete!</span>
        </div>
      </div>
    </div>
  );
};

export default ProgressBar;