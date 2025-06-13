import React, { useState, useEffect } from 'react';

const EmployeeSessionManager = ({ companyId, companyStatus, onSessionSetup }) => {
  const [sessionMode, setSessionMode] = useState(null); // 'new' or 'returning'
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Clear validation error when employee ID changes
  useEffect(() => {
    setValidationError('');
  }, [employeeId]);

  const handleNewEmployee = () => {
    console.log('New employee button clicked');
    setSessionMode('new');
    // Call onSessionSetup immediately for new employees
    onSessionSetup('new');
  };

  const handleReturningEmployee = () => {
    console.log('Returning employee button clicked');
    setSessionMode('returning');
    setValidationError('');
  };

  const validateEmployeeId = () => {
    if (!employeeId.trim()) {
      setValidationError('Please enter your Employee ID');
      return false;
    }

    const employeeIdNum = parseInt(employeeId);
    if (isNaN(employeeIdNum) || employeeIdNum < 0) {
      setValidationError('Please enter a valid Employee ID (number)');
      return false;
    }

    // Check if the employee ID exists in the company's employee list
    if (companyStatus.employeeIds && companyStatus.employeeIds.length > 0 && !companyStatus.employeeIds.includes(employeeIdNum)) {
      setValidationError(`Employee ID ${employeeIdNum} not found for this company. Available IDs: ${companyStatus.employeeIds.join(', ')}`);
      return false;
    }

    return true;
  };

  const handleEmployeeIdSubmit = async () => {
    if (!validateEmployeeId()) return;

    const employeeIdNum = parseInt(employeeId);
    setLoading(true);
    setValidationError('');
    
    console.log(`Submitting returning employee ID: ${employeeIdNum}`);
    
    try {
      await onSessionSetup('returning', employeeIdNum);
    } catch (error) {
      console.error('Error setting up returning employee session:', error);
      setValidationError('Failed to load employee data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToSelection = () => {
    setSessionMode(null);
    setEmployeeId('');
    setValidationError('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleEmployeeIdSubmit();
    }
  };

  const handleEmployeeIdChipClick = (id) => {
    setEmployeeId(id.toString());
  };

  if (sessionMode === 'returning') {
    return (
      <div className="employee-session-manager">
        <div className="session-card">
          <div className="session-header">
            <div className="session-icon">👋</div>
            <h3>Welcome Back!</h3>
            <p>Enter your Employee ID to continue where you left off</p>
          </div>

          <div className="employee-id-input-section">
            <label htmlFor="employeeId" className="employee-id-label">
              Employee ID <span className="required">*</span>
            </label>
            <div className="input-wrapper">
              <input
                type="number"
                id="employeeId"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="e.g., 0, 1, 2..."
                className={`employee-id-input ${validationError ? 'error' : ''}`}
                min="0"
                disabled={loading}
                autoFocus
              />
              {validationError && (
                <div className="input-error">
                  <span className="error-icon">⚠️</span>
                  {validationError}
                </div>
              )}
            </div>
            
            <div className="employee-id-help">
              {companyStatus.employeeIds && companyStatus.employeeIds.length > 0 ? (
                <div className="existing-employees">
                  <div className="help-icon">📋</div>
                  <div>
                    <strong>Existing employees for this company:</strong>
                    <div className="employee-ids">
                      {companyStatus.employeeIds.map(id => (
                        <span 
                          key={id} 
                          className={`employee-id-chip ${parseInt(employeeId) === id ? 'selected' : ''}`}
                          onClick={() => handleEmployeeIdChipClick(id)}
                        >
                          #{id}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="no-employees">
                  <div className="help-icon">ℹ️</div>
                  <p>No employees have started assessments for this company yet.</p>
                </div>
              )}
            </div>
          </div>

          <div className="session-actions">
            <button
              onClick={handleEmployeeIdSubmit}
              className="btn btn-primary"
              disabled={loading || !employeeId.trim() || !!validationError}
            >
              {loading ? (
                <>
                  <span className="loading-spinner small"></span>
                  Loading...
                </>
              ) : (
                <>
                  <span className="btn-icon">▶️</span>
                  Continue Assessment
                </>
              )}
            </button>
            <button
              onClick={handleBackToSelection}
              className="btn btn-secondary"
              disabled={loading}
            >
              <span className="btn-icon">⬅️</span>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="employee-session-manager">
      <div className="session-intro">
        <div className="intro-icon">🚀</div>
        <h3>Employee Assessment Setup</h3>
        <p>Are you starting a new assessment or continuing a previous one?</p>
        
        {companyStatus.employeeCount > 0 && (
          <div className="company-stats">
            <div className="stat-item">
              <div className="stat-icon">👥</div>
              <span className="stat-number">{companyStatus.employeeCount}</span>
              <span className="stat-label">Employee{companyStatus.employeeCount === 1 ? '' : 's'} Assessed</span>
            </div>
            <div className="stat-item">
              <div className="stat-icon">🆔</div>
              <span className="stat-number">{companyStatus.nextEmployeeId || 0}</span>
              <span className="stat-label">Next Employee ID</span>
            </div>
          </div>
        )}
      </div>

      <div className="session-options">
        <div className="session-option new-employee" onClick={handleNewEmployee}>
          <div className="option-icon">
            <div className="icon-circle new">
              🆕
            </div>
          </div>
          <div className="option-content">
            <h4>New Employee</h4>
            <p>Start a fresh assessment with a new employee ID</p>
            <div className="option-details">
              <span className="option-badge new">
                🎯 You'll be Employee #{companyStatus.nextEmployeeId || 0}
              </span>
            </div>
          </div>
          <div className="option-arrow">
            <span className="arrow-icon">→</span>
          </div>
        </div>

        <div className="session-option returning-employee" onClick={handleReturningEmployee}>
          <div className="option-icon">
            <div className="icon-circle returning">
              🔄
            </div>
          </div>
          <div className="option-content">
            <h4>Returning Employee</h4>
            <p>Continue your partially completed assessment</p>
            <div className="option-details">
              <span className="option-badge returning">
                📋 Resume where you left off
              </span>
            </div>
          </div>
          <div className="option-arrow">
            <span className="arrow-icon">→</span>
          </div>
        </div>
      </div>

      <div className="session-help">
        <div className="help-header">
          <span className="help-icon">💡</span>
          <h4>Quick Guide</h4>
        </div>
        <div className="help-items">
          <div className="help-item">
            <span className="help-bullet">🆕</span>
            <div className="help-text">
              <strong>New Employee:</strong> Choose this if you haven't started an assessment before. You'll receive a unique employee ID automatically.
            </div>
          </div>
          <div className="help-item">
            <span className="help-bullet">🔄</span>
            <div className="help-text">
              <strong>Returning Employee:</strong> Choose this to continue a partially completed assessment using your existing employee ID.
            </div>
          </div>
          <div className="help-item">
            <span className="help-bullet">💾</span>
            <div className="help-text">
              <strong>Auto-Save:</strong> Your progress is automatically saved as you complete each question.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeSessionManager;