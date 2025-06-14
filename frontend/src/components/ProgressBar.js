import React from 'react';

const ProgressBar = ({ progress, currentQuestion, totalQuestions }) => {
  const progressPercentage = Math.min(Math.max(progress, 0), 100);
  
  // Calculate completion status
  const isComplete = progressPercentage === 100;
  const isGoodProgress = progressPercentage >= 75;
  const isMidProgress = progressPercentage >= 50;
  
  // Dynamic status text
  const getStatusText = () => {
    if (isComplete) return "🎉 Assessment Complete!";
    if (isGoodProgress) return "🚀 Almost there!";
    if (isMidProgress) return "💪 Great progress!";
    return "🏁 Let's get started!";
  };

  // Dynamic color scheme
  const getProgressClass = () => {
    if (isComplete) return "complete";
    if (isGoodProgress) return "good";
    if (isMidProgress) return "mid";
    return "start";
  };

  return (
    <div className="progress-bar">
      <div className="glass-card">
        <div className="progress-header">
          <div className="progress-text">
            <span className="progress-icon">📊</span>
            <span className="progress-title">Assessment Progress</span>
            <span className="progress-status">{getStatusText()}</span>
          </div>
          <div className="progress-stats">
            <div className="stat-group">
              <span className="stat-value">{Math.round(progressPercentage)}%</span>
              <span className="stat-label">Complete</span>
            </div>
            <div className="stat-divider">•</div>
            <div className="stat-group">
              <span className="stat-value">{currentQuestion}</span>
              <span className="stat-label">of {totalQuestions}</span>
            </div>
          </div>
        </div>

        <div className="progress-track-container">
          <div className="progress-track">
            <div 
              className={`progress-fill ${getProgressClass()}`}
              style={{ width: `${progressPercentage}%` }}
            >
              <div className="progress-shine"></div>
            </div>
          </div>
          
          {/* Progress markers */}
          <div className="progress-markers">
            {[25, 50, 75, 100].map(marker => (
              <div 
                key={marker}
                className={`progress-marker ${progressPercentage >= marker ? 'reached' : 'unreached'}`}
                style={{ left: `${marker}%` }}
              >
                <div className="marker-dot"></div>
                <div className="marker-label">{marker}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* Enhanced percentage display */}
        <div className="progress-percentage-display">
          <div className="percentage-circle">
            <svg className="percentage-svg" viewBox="0 0 36 36">
              <path
                className="circle-bg"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="circle-progress"
                strokeDasharray={`${progressPercentage}, 100`}
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="percentage-text">
              <span className="percentage-number">{Math.round(progressPercentage)}</span>
              <span className="percentage-symbol">%</span>
            </div>
          </div>
        </div>

        {/* Completion milestone indicators */}
        <div className="milestone-indicators">
          <div className={`milestone ${progressPercentage >= 25 ? 'completed' : ''}`}>
            <span className="milestone-icon">🎯</span>
            <span className="milestone-text">Started</span>
          </div>
          <div className={`milestone ${progressPercentage >= 50 ? 'completed' : ''}`}>
            <span className="milestone-icon">⚡</span>
            <span className="milestone-text">Halfway</span>
          </div>
          <div className={`milestone ${progressPercentage >= 75 ? 'completed' : ''}`}>
            <span className="milestone-icon">🚀</span>
            <span className="milestone-text">Nearly Done</span>
          </div>
          <div className={`milestone ${progressPercentage === 100 ? 'completed' : ''}`}>
            <span className="milestone-icon">🏆</span>
            <span className="milestone-text">Complete</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProgressBar;