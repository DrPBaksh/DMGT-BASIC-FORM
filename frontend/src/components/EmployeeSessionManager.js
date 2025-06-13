import React, { useState } from 'react';

const EmployeeSessionManager = ({ companyId, companyStatus, onSessionSetup }) => {
  const [sessionMode, setSessionMode] = useState(null); // 'new' or 'returning'
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNewEmployee = () => {
    setSessionMode('new');
    onSessionSetup('new');
  };

  const handleReturningEmployee = () => {
    setSessionMode('returning');
  };

  const handleEmployeeIdSubmit = async () => {
    if (!employeeId.trim()) {
      alert('Please enter your Employee ID');
      return;
    }

    const employeeIdNum = parseInt(employeeId);
    if (isNaN(employeeIdNum) || employeeIdNum < 0) {
      alert('Please enter a valid Employee ID (number)');
      return;
    }

    setLoading(true);
    await onSessionSetup('returning', employeeIdNum);
    setLoading(false);
  };

  const handleBackToSelection = () => {
    setSessionMode(null);
    setEmployeeId('');
  };

  if (sessionMode === 'returning') {
    return (
      <div className="employee-session-manager">
        <div className="session-card">
          <div className="session-header">
            <h3>Welcome Back! 👋</h3>
            <p>Enter your Employee ID to continue where you left off</p>
          </div>

          <div className="employee-id-input-section">
            <label htmlFor="employeeId" className="employee-id-label">
              Employee ID
            </label>
            <input
              type="number"
              id="employeeId"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="e.g., 0, 1, 2..."
              className="employee-id-input"
              min="0"
              disabled={loading}
            />
            <div className="employee-id-help">
              {companyStatus.employeeIds.length > 0 ? (
                <div className="existing-employees">
                  <p>Existing employees for this company: {companyStatus.employeeIds.join(', ')}</p>
                </div>
              ) : (
                <p>No employees have started assessments for this company yet.</p>
              )}
            </div>
          </div>

          <div className="session-actions">
            <button
              onClick={handleEmployeeIdSubmit}
              className="btn btn-primary"
              disabled={loading || !employeeId.trim()}
            >
              {loading ? (
                <>
                  <span className="loading-spinner small"></span>
                  Loading...
                </>
              ) : (
                'Continue Assessment'
              )}
            </button>
            <button
              onClick={handleBackToSelection}
              className="btn btn-secondary"
              disabled={loading}
            >
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
        <h3>Employee Assessment Setup</h3>
        <p>Are you starting a new assessment or continuing a previous one?</p>
        
        {companyStatus.employeeCount > 0 && (
          <div className="company-stats">
            <div className="stat-item">
              <span className="stat-number">{companyStatus.employeeCount}</span>
              <span className="stat-label">Employee{companyStatus.employeeCount === 1 ? '' : 's'} Assessed</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{companyStatus.nextEmployeeId}</span>
              <span className="stat-label">Next Employee ID</span>
            </div>
          </div>
        )}
      </div>

      <div className="session-options">
        <div className="session-option new-employee" onClick={handleNewEmployee}>
          <div className="option-icon">🆕</div>
          <div className="option-content">
            <h4>New Employee</h4>
            <p>Start a fresh assessment</p>
            <span className="option-badge">
              You'll be Employee #{companyStatus.nextEmployeeId || 0}
            </span>
          </div>
          <div className="option-arrow">→</div>
        </div>

        <div className="session-option returning-employee" onClick={handleReturningEmployee}>
          <div className="option-icon">🔄</div>
          <div className="option-content">
            <h4>Returning Employee</h4>
            <p>Continue previous assessment</p>
            <span className="option-badge">
              Resume where you left off
            </span>
          </div>
          <div className="option-arrow">→</div>
        </div>
      </div>

      <div className="session-help">
        <div className="help-item">
          <strong>New Employee:</strong> Choose this if you haven't started an assessment before
        </div>
        <div className="help-item">
          <strong>Returning Employee:</strong> Choose this to continue a partially completed assessment
        </div>
      </div>
    </div>
  );
};

export default EmployeeSessionManager;
