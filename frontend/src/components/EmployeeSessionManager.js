import React, { useState } from 'react';

const EmployeeSessionManager = ({ companyId, companyStatus, onSessionSetup }) => {
  const [sessionMode, setSessionMode] = useState(null); // 'new' or 'returning'
  const [employeeId, setEmployeeId] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSessionModeSelect = (mode) => {
    setSessionMode(mode);
    setError('');
    setEmployeeId('');
    setSelectedEmployeeId('');
  };

  const handleNewEmployeeStart = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Start new employee session
      await onSessionSetup('new');
      console.log('New employee session started');
    } catch (error) {
      console.error('Error starting new employee session:', error);
      setError('Failed to start new employee session. Please try again.');
    }
    
    setLoading(false);
  };

  const handleReturningEmployeeStart = async () => {
    if (!employeeId.trim()) {
      setError('Please enter your Employee ID');
      return;
    }

    // FIXED: Enhanced validation to explicitly accept 0 as valid Employee ID
    const trimmedId = employeeId.trim();
    const numericId = parseInt(trimmedId);
    
    // Check if it's a valid number (including 0) and not negative
    if (isNaN(numericId) || numericId < 0 || !Number.isInteger(numericId)) {
      setError('Employee ID must be a valid whole number (0, 1, 2, etc.)');
      return;
    }

    // Additional check: ensure the input doesn't contain decimals
    if (trimmedId.includes('.') || trimmedId.includes(',')) {
      setError('Employee ID must be a whole number (no decimals)');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      console.log(`Attempting to load returning employee with ID: ${numericId} (type: ${typeof numericId})`);
      // Try to load returning employee session
      await onSessionSetup('returning', numericId);
      console.log(`Successfully loaded returning employee session for ID: ${numericId}`);
    } catch (error) {
      console.error('Error loading returning employee session:', error);
      setError(`Failed to load employee session for ID ${numericId}. Please check your Employee ID and try again.`);
      setLoading(false);
    }
  };

  const handleEmployeeIdSelect = (id) => {
    setSelectedEmployeeId(id);
    setEmployeeId(id.toString());
    setError('');
  };

  const renderSessionModeSelection = () => (
    <div className="employee-session-manager">
      <div className="glass-card">
        <div className="session-intro">
          <div className="intro-icon">👤</div>
          <h3>Employee Assessment Setup</h3>
          <p>
            Welcome to the employee assessment section. Please choose whether you're 
            starting a new assessment or continuing a previous one.
          </p>
          
          {/* Company Status Summary */}
          <div className="company-stats">
            <div className="stat-item">
              <div className="stat-icon">🏢</div>
              <span className="stat-number">{companyStatus.companyCompleted ? '✓' : '○'}</span>
              <span className="stat-label">Company Assessment</span>
            </div>
            <div className="stat-item">
              <div className="stat-icon">👥</div>
              <span className="stat-number">{companyStatus.employeeCount || 0}</span>
              <span className="stat-label">Employees Assessed</span>
            </div>
            <div className="stat-item">
              <div className="stat-icon">📊</div>
              <span className="stat-number">{companyStatus.employeeIds?.length || 0}</span>
              <span className="stat-label">Active Sessions</span>
            </div>
          </div>
        </div>

        <div className="session-options">
          <div 
            className="session-option"
            onClick={() => handleSessionModeSelect('new')}
          >
            <div className="option-icon">
              <div className="icon-circle new">
                ✨
              </div>
            </div>
            <div className="option-content">
              <h4>New Employee Assessment</h4>
              <p>Start a fresh assessment for a new employee. You'll be assigned a unique Employee ID.</p>
              <div className="option-details">
                <span className="option-badge new">
                  <span>🆕</span>
                  <span>Start Fresh</span>
                </span>
              </div>
            </div>
            <div className="option-arrow">
              <span className="arrow-icon">→</span>
            </div>
          </div>

          <div 
            className="session-option"
            onClick={() => handleSessionModeSelect('returning')}
          >
            <div className="option-icon">
              <div className="icon-circle returning">
                🔄
              </div>
            </div>
            <div className="option-content">
              <h4>Continue Previous Assessment</h4>
              <p>Resume an existing assessment using your previously assigned Employee ID.</p>
              <div className="option-details">
                <span className="option-badge returning">
                  <span>↩️</span>
                  <span>Resume Session</span>
                </span>
              </div>
            </div>
            <div className="option-arrow">
              <span className="arrow-icon">→</span>
            </div>
          </div>
        </div>

        {/* Help Section */}
        <div className="session-help">
          <div className="help-header">
            <span className="help-icon">💡</span>
            <h4>Need Help?</h4>
          </div>
          <div className="help-items">
            <div className="help-item">
              <span className="help-bullet">•</span>
              <span className="help-text">
                <strong>New employees:</strong> Choose "New Employee Assessment" to get started with a fresh assessment.
              </span>
            </div>
            <div className="help-item">
              <span className="help-bullet">•</span>
              <span className="help-text">
                <strong>Returning employees:</strong> Use your previously assigned Employee ID (including 0, 1, 2, etc.) to continue where you left off.
              </span>
            </div>
            <div className="help-item">
              <span className="help-bullet">•</span>
              <span className="help-text">
                <strong>Lost your ID?</strong> Contact your system administrator or start a new assessment.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderNewEmployeeConfirmation = () => (
    <div className="employee-session-manager">
      <div className="glass-card">
        <div className="session-card">
          <div className="session-header">
            <div className="session-icon">✨</div>
            <h3>Start New Employee Assessment</h3>
            <p>You're about to begin a new employee assessment. A unique Employee ID will be assigned to you.</p>
          </div>

          {error && (
            <div className="input-error">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="session-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setSessionMode(null)}
              disabled={loading}
            >
              ← Back to Options
            </button>
            <button
              className="btn btn-primary"
              onClick={handleNewEmployeeStart}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="loading-spinner small"></div>
                  <span>Starting...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>Start Assessment</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderReturningEmployeeForm = () => (
    <div className="employee-session-manager">
      <div className="glass-card">
        <div className="session-card">
          <div className="session-header">
            <div className="session-icon">🔄</div>
            <h3>Continue Previous Assessment</h3>
            <p>Enter your Employee ID to resume your assessment where you left off.</p>
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
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                  setError('');
                }}
                className={`employee-id-input ${error ? 'error' : ''}`}
                placeholder="Enter your Employee ID (e.g., 0, 1, 2...)"
                min="0"
                step="1"
                disabled={loading}
              />
            </div>
            
            {error && (
              <div className="input-error">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
              </div>
            )}
            
            {/* ENHANCED: Better help text for Employee ID validation */}
            <div className="input-help">
              <span className="help-icon">ℹ️</span>
              <span className="help-text">
                Employee IDs are whole numbers starting from 0. Valid examples: 0, 1, 2, 15, 100, etc.
              </span>
            </div>
          </div>

          {/* Show existing employee IDs if available */}
          {companyStatus.employeeIds && companyStatus.employeeIds.length > 0 && (
            <div className="employee-id-help">
              <div className="existing-employees">
                <span className="help-icon">📋</span>
                <div>
                  <strong>Existing Employee IDs for this company:</strong>
                  <div className="employee-ids">
                    {companyStatus.employeeIds.map(id => (
                      <span
                        key={id}
                        className={`employee-id-chip ${selectedEmployeeId === id ? 'selected' : ''}`}
                        onClick={() => handleEmployeeIdSelect(id)}
                      >
                        #{id}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginTop: 'var(--spacing-2)' }}>
                    Click on an ID to select it, or enter your ID manually above.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Show message if no existing employees */}
          {(!companyStatus.employeeIds || companyStatus.employeeIds.length === 0) && (
            <div className="employee-id-help">
              <div className="no-employees">
                <span className="help-icon">ℹ️</span>
                <div>
                  <strong>No existing employee assessments found</strong>
                  <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginTop: 'var(--spacing-2)' }}>
                    If you believe you have a previous assessment, double-check your Employee ID. 
                    Otherwise, consider starting a new assessment.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="session-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setSessionMode(null)}
              disabled={loading}
            >
              ← Back to Options
            </button>
            <button
              className="btn btn-primary"
              onClick={handleReturningEmployeeStart}
              disabled={loading || !employeeId.trim()}
            >
              {loading ? (
                <>
                  <div className="loading-spinner small"></div>
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <span>🔄</span>
                  <span>Continue Assessment</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Render based on current session mode
  if (sessionMode === 'new') {
    return renderNewEmployeeConfirmation();
  } else if (sessionMode === 'returning') {
    return renderReturningEmployeeForm();
  } else {
    return renderSessionModeSelection();
  }
};

export default EmployeeSessionManager;