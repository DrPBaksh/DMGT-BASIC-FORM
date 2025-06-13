import React, { useState, useEffect } from 'react';
import './App.css';
import FormRenderer from './components/FormRenderer';
import TabNavigation from './components/TabNavigation';
import Logo from './components/Logo';
import ProgressBar from './components/ProgressBar';
import EmployeeSessionManager from './components/EmployeeSessionManager';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://your-api-gateway-url.amazonaws.com/prod';

function App() {
  const [activeTab, setActiveTab] = useState('company');
  const [companyId, setCompanyId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companyStatus, setCompanyStatus] = useState({ companyCompleted: false, employeeCount: 0, employeeIds: [] });
  const [responses, setResponses] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState(''); // 'saving', 'saved', 'error'
  
  // Employee session management - Enhanced
  const [employeeSessionMode, setEmployeeSessionMode] = useState(null); // 'new' or 'returning'
  const [currentEmployeeId, setCurrentEmployeeId] = useState(null);
  const [employeeSessionReady, setEmployeeSessionReady] = useState(false);
  const [sessionPersisted, setSessionPersisted] = useState(false); // Track if session has been saved to backend

  const tabs = [
    { id: 'company', label: 'Company Assessment', icon: '🏢' },
    { id: 'employee', label: 'Employee Assessment', icon: '👤' }
  ];

  useEffect(() => {
    if (companyId && activeTab) {
      if (activeTab === 'company' || (activeTab === 'employee' && employeeSessionReady)) {
        loadQuestions();
        checkCompanyStatus();
      }
    }
  }, [activeTab, companyId, employeeSessionReady]);

  // Enhanced session persistence
  useEffect(() => {
    if (employeeSessionMode === 'new' && currentEmployeeId !== null && !sessionPersisted) {
      setSessionPersisted(true);
    }
  }, [currentEmployeeId, employeeSessionMode, sessionPersisted]);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/config/${activeTab}`);
      if (response.ok) {
        const data = await response.json();
        setQuestions(data);
      } else {
        console.error('Failed to load questions');
      }
    } catch (error) {
      console.error('Error loading questions:', error);
    }
    setLoading(false);
  };

  const checkCompanyStatus = async () => {
    if (companyId) {
      try {
        const response = await fetch(`${API_BASE_URL}/responses?companyId=${companyId}`);
        if (response.ok) {
          const status = await response.json();
          setCompanyStatus(status);
        }
      } catch (error) {
        console.error('Error checking company status:', error);
      }
    }
  };

  const loadEmployeeData = async (employeeId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/responses?action=getEmployee&companyId=${companyId}&employeeId=${employeeId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.found) {
          setResponses(data.responses || {});
          setCurrentEmployeeId(employeeId);
          setSessionPersisted(true); // Existing employee session is already persisted
          return data.employeeData;
        }
      }
      return null;
    } catch (error) {
      console.error('Error loading employee data:', error);
      return null;
    }
  };

  // Enhanced saveResponse function - Fixed the main bug
  const saveResponse = async (questionId, answer, file = null) => {
    const newResponses = { ...responses, [questionId]: answer };
    setResponses(newResponses);
    setSaveStatus('saving');

    try {
      const payload = {
        companyId,
        formType: activeTab,
        responses: newResponses
      };

      // Critical fix: For employee forms, handle session management properly
      if (activeTab === 'employee') {
        // If we have an established employee session, use that ID
        if (currentEmployeeId !== null) {
          payload.employeeId = currentEmployeeId;
        } else if (employeeSessionMode === 'new') {
          // For new employees, don't send employeeId on first save - let backend assign
          // This ensures we don't create multiple employee IDs
          payload.isNewEmployee = true;
        } else {
          // This shouldn't happen, but handle gracefully
          console.error('Employee session not properly initialized');
          setSaveStatus('error');
          return;
        }
      }

      const response = await fetch(`${API_BASE_URL}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error.includes('already completed')) {
          alert('Company questionnaire has already been completed for this Company ID.');
          setSaveStatus('error');
          return;
        }
        throw new Error(errorData.error);
      }

      const responseData = await response.json();

      // Critical fix: For new employees, capture and store the assigned employee ID
      if (activeTab === 'employee' && employeeSessionMode === 'new' && currentEmployeeId === null) {
        if (responseData.employeeId !== undefined) {
          setCurrentEmployeeId(responseData.employeeId);
          setSessionPersisted(true);
          console.log(`New employee session established with ID: ${responseData.employeeId}`);
        }
      }

      setSaveStatus('saved');
      
      // Auto-clear save status after a moment
      setTimeout(() => setSaveStatus(''), 2000);

    } catch (error) {
      console.error('Error saving response:', error);
      setSaveStatus('error');
      alert('Error saving response. Please try again.');
      
      // Auto-clear error status
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const handleTabChange = (tabId) => {
    if (tabId === 'company' && companyStatus.companyCompleted) {
      alert('Company questionnaire has already been completed for this Company ID.');
      return;
    }
    
    setActiveTab(tabId);
    setResponses({});
    setCurrentQuestionIndex(0);
    setSaveStatus('');
    
    // Reset employee session when switching tabs
    if (tabId === 'employee') {
      setEmployeeSessionMode(null);
      setCurrentEmployeeId(null);
      setEmployeeSessionReady(false);
      setSessionPersisted(false);
    } else {
      setEmployeeSessionReady(true);
    }
  };

  const handleCompanyIdChange = (e) => {
    setCompanyId(e.target.value);
    // Reset everything when company ID changes
    setEmployeeSessionMode(null);
    setCurrentEmployeeId(null);
    setEmployeeSessionReady(false);
    setSessionPersisted(false);
    setResponses({});
    setSaveStatus('');
  };

  // Enhanced employee session setup
  const handleEmployeeSessionSetup = async (mode, employeeId = null) => {
    setEmployeeSessionMode(mode);
    setSaveStatus('');
    
    if (mode === 'new') {
      setCurrentEmployeeId(null); // Will be assigned on first save
      setResponses({});
      setSessionPersisted(false);
      setEmployeeSessionReady(true);
      console.log('New employee session initialized');
    } else if (mode === 'returning' && employeeId !== null) {
      const employeeData = await loadEmployeeData(employeeId);
      if (employeeData) {
        setEmployeeSessionReady(true);
        console.log(`Returning employee session loaded for ID: ${employeeId}`);
      } else {
        alert(`No employee found with ID ${employeeId}. Please check your Employee ID or start as a new employee.`);
        setEmployeeSessionMode(null);
        setCurrentEmployeeId(null);
        setSessionPersisted(false);
      }
    }
  };

  const calculateProgress = () => {
    if (questions.length === 0) return 0;
    const answeredQuestions = Object.keys(responses).length;
    return (answeredQuestions / questions.length) * 100;
  };

  // Enhanced save status indicator
  const renderSaveStatus = () => {
    if (!saveStatus) return null;
    
    const statusConfig = {
      saving: { icon: '💾', text: 'Saving...', class: 'save-status saving' },
      saved: { icon: '✅', text: 'Saved', class: 'save-status saved' },
      error: { icon: '❌', text: 'Save failed', class: 'save-status error' }
    };
    
    const config = statusConfig[saveStatus];
    return (
      <div className={config.class}>
        <span className="save-icon">{config.icon}</span>
        <span className="save-text">{config.text}</span>
      </div>
    );
  };

  const renderEmployeeSection = () => {
    if (!employeeSessionReady) {
      return (
        <EmployeeSessionManager
          companyId={companyId}
          companyStatus={companyStatus}
          onSessionSetup={handleEmployeeSessionSetup}
        />
      );
    }

    return (
      <>
        <div className="employee-session-info">
          <div className="session-badge">
            {employeeSessionMode === 'new' ? (
              <span className="badge badge-new">
                New Employee Assessment
                {currentEmployeeId !== null && ` - ID: ${currentEmployeeId}`}
              </span>
            ) : (
              <span className="badge badge-returning">
                Returning Employee #{currentEmployeeId}
              </span>
            )}
          </div>
          {renderSaveStatus()}
        </div>

        <ProgressBar 
          progress={calculateProgress()}
          currentQuestion={currentQuestionIndex + 1}
          totalQuestions={questions.length}
        />

        <div className="form-container">
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading questions...</p>
            </div>
          ) : questions.length > 0 ? (
            <FormRenderer
              questions={questions}
              responses={responses}
              onResponseChange={saveResponse}
              onQuestionChange={setCurrentQuestionIndex}
              companyId={companyId}
              formType={activeTab}
              employeeId={currentEmployeeId}
              employeeMode={employeeSessionMode}
              sessionPersisted={sessionPersisted}
            />
          ) : (
            <div className="empty-state">
              <p>No questions available for this form type.</p>
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <Logo />
        <div className="header-content">
          <h1>Data & AI Readiness Assessment 2025</h1>
          <p className="subtitle">Evaluate your organization's preparedness for the data-driven future</p>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          <div className="company-id-section">
            <label htmlFor="companyId" className="company-id-label">
              Company ID <span className="required">*</span>
            </label>
            <input
              type="text"
              id="companyId"
              value={companyId}
              onChange={handleCompanyIdChange}
              placeholder="Enter your assigned Company ID"
              className="company-id-input"
              required
            />
            {companyStatus.companyCompleted && (
              <div className="status-warning">
                ⚠️ Company assessment completed. {companyStatus.employeeCount} employee(s) assessed.
              </div>
            )}
          </div>

          {companyId && (
            <>
              <TabNavigation
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={handleTabChange}
              />

              {activeTab === 'company' && (
                <>
                  <div className="form-header">
                    {renderSaveStatus()}
                  </div>
                  
                  <ProgressBar 
                    progress={calculateProgress()}
                    currentQuestion={currentQuestionIndex + 1}
                    totalQuestions={questions.length}
                  />

                  <div className="form-container">
                    {loading ? (
                      <div className="loading-state">
                        <div className="loading-spinner"></div>
                        <p>Loading questions...</p>
                      </div>
                    ) : questions.length > 0 ? (
                      <FormRenderer
                        questions={questions}
                        responses={responses}
                        onResponseChange={saveResponse}
                        onQuestionChange={setCurrentQuestionIndex}
                        companyId={companyId}
                        formType={activeTab}
                      />
                    ) : (
                      <div className="empty-state">
                        <p>No questions available for this form type.</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'employee' && renderEmployeeSection()}
            </>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>&copy; 2025 DMGT. All rights reserved. | Data & AI Readiness Assessment</p>
      </footer>
    </div>
  );
}

export default App;