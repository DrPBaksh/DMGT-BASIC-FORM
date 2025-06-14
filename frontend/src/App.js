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
  
  // FIXED: Enhanced Employee Session Management
  const [employeeSessionMode, setEmployeeSessionMode] = useState(null); // 'new' or 'returning'
  const [currentEmployeeId, setCurrentEmployeeId] = useState(null);
  const [employeeSessionReady, setEmployeeSessionReady] = useState(false);
  const [sessionInitialized, setSessionInitialized] = useState(false); // Prevents duplicate initialization

  const tabs = [
    { id: 'company', label: 'Company Assessment', icon: '🏢' },
    { id: 'employee', label: 'Employee Assessment', icon: '👤' }
  ];

  // FIXED: Improved question loading with better dependency management
  useEffect(() => {
    const shouldLoadQuestions = () => {
      if (!companyId || !activeTab) return false;
      
      if (activeTab === 'company') return true;
      if (activeTab === 'employee' && employeeSessionReady && sessionInitialized) return true;
      
      return false;
    };

    if (shouldLoadQuestions()) {
      loadQuestions();
      checkCompanyStatus();
    }
  }, [activeTab, companyId, employeeSessionReady, sessionInitialized]);

  // FIXED: Reset session state when company ID changes
  useEffect(() => {
    if (companyId) {
      resetEmployeeSession();
      checkCompanyStatus();
    }
  }, [companyId]);

  const resetEmployeeSession = () => {
    setEmployeeSessionMode(null);
    setCurrentEmployeeId(null);
    setEmployeeSessionReady(false);
    setSessionInitialized(false);
    setResponses({});
    setSaveStatus('');
    console.log('Employee session reset');
  };

  const loadQuestions = async () => {
    setLoading(true);
    console.log(`Loading questions for activeTab: ${activeTab}, companyId: ${companyId}`);
    
    try {
      const response = await fetch(`${API_BASE_URL}/config/${activeTab}`);
      if (response.ok) {
        const data = await response.json();
        setQuestions(data);
        console.log(`Loaded ${data.length} questions for ${activeTab}`);
      } else {
        console.error('Failed to load questions:', response.status);
        alert('Failed to load questions. Please check your connection and try again.');
      }
    } catch (error) {
      console.error('Error loading questions:', error);
      alert('Error loading questions. Please check your connection and try again.');
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
          console.log('Company status updated:', status);
        }
      } catch (error) {
        console.error('Error checking company status:', error);
      }
    }
  };

  const loadEmployeeData = async (employeeId) => {
    try {
      console.log(`Loading employee data for ID: ${employeeId}`);
      const response = await fetch(`${API_BASE_URL}/responses?action=getEmployee&companyId=${companyId}&employeeId=${employeeId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.found) {
          setResponses(data.responses || {});
          setCurrentEmployeeId(employeeId);
          console.log(`Employee data loaded for ID: ${employeeId}`, data.responses);
          return data.employeeData;
        }
      }
      return null;
    } catch (error) {
      console.error('Error loading employee data:', error);
      return null;
    }
  };

  // FIXED: Enhanced saveResponse function with better employee session handling
  const saveResponse = async (questionId, answer, file = null) => {
    // CRITICAL FIX: Don't allow saving if employee session not properly initialized
    if (activeTab === 'employee' && !sessionInitialized) {
      console.warn('Attempted to save response before employee session was initialized');
      return;
    }

    const newResponses = { ...responses, [questionId]: answer };
    setResponses(newResponses);
    setSaveStatus('saving');

    try {
      const payload = {
        companyId,
        formType: activeTab,
        responses: newResponses
      };

      // FIXED: Proper employee session handling
      if (activeTab === 'employee') {
        if (employeeSessionMode === 'returning' && currentEmployeeId !== null) {
          // Returning employee - use existing ID
          payload.employeeId = currentEmployeeId;
          console.log(`Saving for returning employee ID: ${currentEmployeeId}`);
        } else if (employeeSessionMode === 'new') {
          if (currentEmployeeId !== null) {
            // New employee with assigned ID (subsequent saves)
            payload.employeeId = currentEmployeeId;
            console.log(`Saving for new employee with assigned ID: ${currentEmployeeId}`);
          } else {
            // First save for new employee - request ID assignment
            payload.isNewEmployee = true;
            console.log('First save for new employee - requesting ID assignment');
          }
        } else {
          throw new Error('Employee session not properly initialized');
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
        if (errorData.error && errorData.error.includes('already completed')) {
          alert('Company questionnaire has already been completed for this Company ID.');
          setSaveStatus('error');
          return;
        }
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const responseData = await response.json();

      // FIXED: Capture employee ID for new employees (first save only)
      if (activeTab === 'employee' && 
          employeeSessionMode === 'new' && 
          currentEmployeeId === null && 
          responseData.employeeId !== undefined) {
        
        setCurrentEmployeeId(responseData.employeeId);
        console.log(`New employee ID assigned: ${responseData.employeeId}`);
        
        // Update company status to reflect new employee
        await checkCompanyStatus();
      }

      setSaveStatus('saved');
      console.log('Response saved successfully');
      
      // Auto-clear save status after a moment
      setTimeout(() => setSaveStatus(''), 3000);

    } catch (error) {
      console.error('Error saving response:', error);
      setSaveStatus('error');
      alert(`Error saving response: ${error.message}. Please try again.`);
      
      // Auto-clear error status
      setTimeout(() => setSaveStatus(''), 5000);
    }
  };

  const handleTabChange = (tabId) => {
    if (tabId === 'company' && companyStatus.companyCompleted) {
      alert('Company questionnaire has already been completed for this Company ID.');
      return;
    }
    
    console.log(`Switching to tab: ${tabId}`);
    setActiveTab(tabId);
    setResponses({});
    setCurrentQuestionIndex(0);
    setSaveStatus('');
    setQuestions([]); // Clear questions when switching tabs
    
    // FIXED: Proper session handling when switching tabs
    if (tabId === 'employee') {
      // Only reset if no session exists
      if (!sessionInitialized) {
        resetEmployeeSession();
      }
    } else {
      // Company tab doesn't need employee session
      setEmployeeSessionReady(true);
      setSessionInitialized(true);
    }
  };

  const handleCompanyIdChange = (e) => {
    const newCompanyId = e.target.value;
    setCompanyId(newCompanyId);
    console.log(`Company ID changed to: ${newCompanyId}`);
    
    // Reset everything when company ID changes
    resetEmployeeSession();
    setQuestions([]);
    
    // If we're on company tab, set ready immediately
    if (activeTab === 'company') {
      setEmployeeSessionReady(true);
      setSessionInitialized(true);
    }
  };

  // FIXED: Enhanced employee session setup with proper state management
  const handleEmployeeSessionSetup = async (mode, employeeId = null) => {
    console.log(`Setting up employee session: mode=${mode}, employeeId=${employeeId}`);
    
    setEmployeeSessionMode(mode);
    setSaveStatus('');
    
    if (mode === 'new') {
      setCurrentEmployeeId(null); // Will be assigned on first save
      setResponses({});
      setEmployeeSessionReady(true);
      setSessionInitialized(true); // CRITICAL FIX: Mark session as initialized
      console.log('New employee session initialized and ready');
      
    } else if (mode === 'returning' && employeeId !== null) {
      console.log(`Loading returning employee data for ID: ${employeeId}`);
      const employeeData = await loadEmployeeData(employeeId);
      if (employeeData) {
        setEmployeeSessionReady(true);
        setSessionInitialized(true); // CRITICAL FIX: Mark session as initialized
        console.log(`Returning employee session loaded for ID: ${employeeId}`);
      } else {
        alert(`No employee found with ID ${employeeId}. Please check your Employee ID or start as a new employee.`);
        resetEmployeeSession();
      }
    }
  };

  const calculateProgress = () => {
    if (questions.length === 0) return 0;
    const answeredQuestions = Object.keys(responses).length;
    return (answeredQuestions / questions.length) * 100;
  };

  // Enhanced save status indicator with new styling
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
    console.log(`Rendering employee section - sessionReady: ${employeeSessionReady}, initialized: ${sessionInitialized}, mode: ${employeeSessionMode}`);
    
    if (!employeeSessionReady || !sessionInitialized) {
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
                ✨ New Employee Assessment
                {currentEmployeeId !== null && ` - ID: #${currentEmployeeId}`}
              </span>
            ) : (
              <span className="badge badge-returning">
                🔄 Returning Employee #{currentEmployeeId}
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
          <div className="glass-card">
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
                sessionInitialized={sessionInitialized}
              />
            ) : (
              <div className="empty-state">
                <p>No questions available for this form type.</p>
                <p>Please ensure you have a valid Company ID and try refreshing the page.</p>
              </div>
            )}
          </div>
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
          {/* Company ID Section with new glass-card styling */}
          <div className="company-id-section">
            <div className="glass-card">
              <div className="company-id-header">
                <h2>🏢 Company Identification</h2>
                <p>Enter your assigned Company ID to begin the assessment</p>
              </div>
              <div className="company-id-input-group">
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
            </div>
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
                    <div className="glass-card">
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
                          <p>Please ensure you have a valid Company ID and try refreshing the page.</p>
                        </div>
                      )}
                    </div>
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