import React, { useState, useEffect } from 'react';
import './App.css';
import './enhanced-upload.css'; // Import enhanced file upload styles
import FormRenderer from './components/FormRenderer';
import TabNavigation from './components/TabNavigation';
import Logo from './components/Logo';
import ProgressBar from './components/ProgressBar';
import EmployeeSessionManager from './components/EmployeeSessionManager';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://hfrcfsq0v6.execute-api.eu-west-2.amazonaws.com/dev';

function App() {
  const [activeTab, setActiveTab] = useState('company');
  const [companyId, setCompanyId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companyStatus, setCompanyStatus] = useState({ 
    companyCompleted: false, 
    companyInProgress: false,
    employeeCount: 0, 
    employeeIds: [],
    lastModified: null,
    completionPercentage: 0
  });
  
  // FIXED: Separate state management for company vs employee responses
  const [companyResponses, setCompanyResponses] = useState({});
  const [employeeResponses, setEmployeeResponses] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState(''); // 'saving', 'saved', 'error'
  
  // Employee Session Management
  const [employeeSessionMode, setEmployeeSessionMode] = useState(null); // 'new' or 'returning'
  const [currentEmployeeId, setCurrentEmployeeId] = useState(null);
  const [employeeSessionReady, setEmployeeSessionReady] = useState(false);
  const [sessionInitialized, setSessionInitialized] = useState(false);

  // FIXED: Company form state management
  const [companyCanModify, setCompanyCanModify] = useState(true);
  const [companyFormState, setCompanyFormState] = useState('loading'); // 'loading', 'new', 'in_progress', 'completed'
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [unsavedCompanyChanges, setUnsavedCompanyChanges] = useState(false);

  const tabs = [
    { id: 'company', label: 'Company Assessment', icon: '🏢' },
    { id: 'employee', label: 'Employee Assessment', icon: '👤' }
  ];

  // Load questions based on active tab
  useEffect(() => {
    const shouldLoadQuestions = () => {
      if (!companyId || !activeTab) return false;
      
      if (activeTab === 'company') return true;
      if (activeTab === 'employee' && employeeSessionReady && sessionInitialized) return true;
      
      return false;
    };

    if (shouldLoadQuestions()) {
      loadQuestions();
      if (activeTab === 'company') {
        checkCompanyStatus();
      }
    }
  }, [activeTab, companyId, employeeSessionReady, sessionInitialized]);

  // Reset session state when company ID changes
  useEffect(() => {
    if (companyId) {
      resetEmployeeSession();
      checkCompanyStatus();
      setCompanyFormState('loading');
      setCompanyCanModify(true);
      setIsInitialLoad(true);
      setUnsavedCompanyChanges(false);
    } else {
      setCompanyStatus({ 
        companyCompleted: false, 
        companyInProgress: false,
        employeeCount: 0, 
        employeeIds: [],
        lastModified: null,
        completionPercentage: 0
      });
      setCompanyFormState('new');
      setIsInitialLoad(true);
      setUnsavedCompanyChanges(false);
    }
  }, [companyId]);

  const resetEmployeeSession = () => {
    setEmployeeSessionMode(null);
    setCurrentEmployeeId(null);
    setEmployeeSessionReady(false);
    setSessionInitialized(false);
    setEmployeeResponses({});
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

  // Company status checking
  const checkCompanyStatus = async () => {
    if (!companyId) return;
    
    try {
      setCompanyFormState('loading');
      const response = await fetch(`${API_BASE_URL}/responses?companyId=${companyId}`);
      
      if (response.ok) {
        const status = await response.json();
        console.log('Company status received:', status);
        
        setCompanyStatus({
          companyCompleted: status.companyCompleted || false,
          companyInProgress: status.companyInProgress || false,
          employeeCount: status.employeeCount || 0,
          employeeIds: status.employeeIds || [],
          lastModified: status.lastModified || null,
          completionPercentage: status.completionPercentage || 0
        });

        const hasAnyResponses = status.completionPercentage > 0;
        const isFullyComplete = status.completionPercentage === 100 && status.companyCompleted;
        
        if (isFullyComplete) {
          setCompanyFormState('completed');
          setCompanyCanModify(true);
          console.log('Company form is completed but can be modified');
        } else if (hasAnyResponses) {
          setCompanyFormState('in_progress');
          setCompanyCanModify(true);
          console.log('Company form is in progress and editable');
          
          if (isInitialLoad) {
            await loadCompanyResponses();
          }
        } else {
          setCompanyFormState('new');
          setCompanyCanModify(true);
          console.log('New company form - fully editable');
        }
        
        setIsInitialLoad(false);
        
      } else {
        console.error('Failed to check company status:', response.status);
        setCompanyFormState('new');
        setCompanyCanModify(true);
        setIsInitialLoad(false);
      }
    } catch (error) {
      console.error('Error checking company status:', error);
      setCompanyFormState('new');
      setCompanyCanModify(true);
      setIsInitialLoad(false);
    }
  };

  // Load existing company responses
  const loadCompanyResponses = async () => {
    try {
      console.log(`Loading company responses for ID: ${companyId}`);
      const response = await fetch(`${API_BASE_URL}/responses?action=getCompany&companyId=${companyId}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.found && data.responses) {
          setCompanyResponses(data.responses);
          console.log('Company responses loaded:', data.responses);
        }
      }
    } catch (error) {
      console.error('Error loading company responses:', error);
    }
  };

  const loadEmployeeData = async (employeeId) => {
    try {
      console.log(`Loading employee data for ID: ${employeeId}`);
      const response = await fetch(`${API_BASE_URL}/responses?action=getEmployee&companyId=${companyId}&employeeId=${employeeId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.found) {
          setEmployeeResponses(data.responses || {});
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

  // FIXED: Handle company responses locally without auto-saving
  const handleCompanyResponse = (questionId, answer, file = null) => {
    console.log(`Company response change: ${questionId} = ${answer}`);
    
    // Update local state
    const newResponses = { ...companyResponses, [questionId]: answer };
    setCompanyResponses(newResponses);
    setUnsavedCompanyChanges(true);
    
    // Handle file metadata if present
    if (file) {
      console.log('File metadata for company response:', file);
      // Store file metadata locally - will be sent when form is saved
    }
    
    console.log('Company form updated locally (not saved yet)');
  };

  // FIXED: Save company form only when explicitly requested
  const saveCompanyForm = async () => {
    if (!companyId) {
      alert('Please enter a Company ID first');
      return;
    }

    if (!unsavedCompanyChanges && companyFormState !== 'new') {
      alert('No changes to save');
      return;
    }

    try {
      setSaveStatus('saving');
      
      const payload = {
        companyId,
        formType: 'company',
        responses: companyResponses,
        lastModified: new Date().toISOString(),
        explicitSave: true // Flag to indicate this is an explicit save
      };

      const response = await fetch(`${API_BASE_URL}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const responseData = await response.json();
      
      // Update company status based on response
      if (responseData.completionPercentage !== undefined) {
        setCompanyStatus(prev => ({
          ...prev,
          completionPercentage: responseData.completionPercentage,
          companyInProgress: responseData.completionPercentage > 0 && responseData.completionPercentage < 100,
          companyCompleted: responseData.completionPercentage === 100,
          lastModified: new Date().toISOString()
        }));
        
        setCompanyFormState(responseData.completionPercentage === 100 ? 'completed' : 'in_progress');
      }

      setSaveStatus('saved');
      setUnsavedCompanyChanges(false);
      console.log('Company form saved successfully');
      
      setTimeout(() => setSaveStatus(''), 3000);

    } catch (error) {
      console.error('Error saving company form:', error);
      setSaveStatus('error');
      alert(`Error saving company form: ${error.message}`);
      
      setTimeout(() => setSaveStatus(''), 5000);
    }
  };

  // FIXED: Handle employee responses with auto-save (existing behavior)
  const handleEmployeeResponse = async (questionId, answer, file = null) => {
    if (!sessionInitialized) {
      console.warn('Attempted to save response before employee session was initialized');
      return;
    }

    const newResponses = { ...employeeResponses, [questionId]: answer };
    setEmployeeResponses(newResponses);
    setSaveStatus('saving');

    try {
      const payload = {
        companyId,
        formType: 'employee',
        responses: newResponses,
        lastModified: new Date().toISOString(),
        preventAutoComplete: true,
        singleQuestionUpdate: true
      };

      if (file) {
        payload.fileMetadata = {
          questionId,
          ...file
        };
      }

      if (employeeSessionMode === 'returning' && currentEmployeeId !== null) {
        payload.employeeId = currentEmployeeId;
      } else if (employeeSessionMode === 'new') {
        if (currentEmployeeId !== null) {
          payload.employeeId = currentEmployeeId;
        } else {
          payload.isNewEmployee = true;
        }
      } else {
        throw new Error('Employee session not properly initialized');
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
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const responseData = await response.json();
      
      // Capture employee ID for new employees
      if (employeeSessionMode === 'new' && 
          currentEmployeeId === null && 
          responseData.employeeId !== undefined) {
        
        setCurrentEmployeeId(responseData.employeeId);
        console.log(`New employee ID assigned: ${responseData.employeeId}`);
        await checkCompanyStatus();
      }

      setSaveStatus('saved');
      console.log('Employee response saved successfully');
      
      setTimeout(() => setSaveStatus(''), 3000);

    } catch (error) {
      console.error('Error saving employee response:', error);
      setSaveStatus('error');
      alert(`Error saving response: ${error.message}`);
      
      setTimeout(() => setSaveStatus(''), 5000);
    }
  };

  // Tab change handling
  const handleTabChange = (tabId) => {
    if (tabId === 'company' && unsavedCompanyChanges) {
      const proceed = window.confirm(
        'You have unsaved changes in the company form. Do you want to continue without saving?'
      );
      if (!proceed) {
        return;
      }
    }
    
    console.log(`Switching to tab: ${tabId}`);
    setActiveTab(tabId);
    setCurrentQuestionIndex(0);
    setSaveStatus('');
    
    if (tabId === 'employee') {
      setQuestions([]);
      if (!sessionInitialized) {
        resetEmployeeSession();
      }
    } else {
      // Company tab
      setEmployeeSessionReady(true);
      setSessionInitialized(true);
      if (companyFormState === 'in_progress' || companyFormState === 'completed') {
        loadCompanyResponses();
      }
    }
  };

  const handleCompanyIdChange = (e) => {
    const newCompanyId = e.target.value;
    
    if (unsavedCompanyChanges) {
      const proceed = window.confirm(
        'You have unsaved changes in the company form. Do you want to continue without saving?'
      );
      if (!proceed) {
        return;
      }
    }
    
    setCompanyId(newCompanyId);
    console.log(`Company ID changed to: ${newCompanyId}`);
    
    resetEmployeeSession();
    setQuestions([]);
    setCompanyResponses({});
    setEmployeeResponses({});
    setIsInitialLoad(true);
    setUnsavedCompanyChanges(false);
    
    if (activeTab === 'company') {
      setEmployeeSessionReady(true);
      setSessionInitialized(true);
    }
  };

  const handleEmployeeSessionSetup = async (mode, employeeId = null) => {
    console.log(`Setting up employee session: mode=${mode}, employeeId=${employeeId}`);
    
    setEmployeeSessionMode(mode);
    setSaveStatus('');
    
    if (mode === 'new') {
      setCurrentEmployeeId(null);
      setEmployeeResponses({});
      setEmployeeSessionReady(true);
      setSessionInitialized(true);
      console.log('New employee session initialized and ready');
      
    } else if (mode === 'returning' && employeeId !== null) {
      console.log(`Loading returning employee data for ID: ${employeeId}`);
      const employeeData = await loadEmployeeData(employeeId);
      if (employeeData) {
        setEmployeeSessionReady(true);
        setSessionInitialized(true);
        console.log(`Returning employee session loaded for ID: ${employeeId}`);
      } else {
        alert(`No employee found with ID ${employeeId}. Please check your Employee ID or start as a new employee.`);
        resetEmployeeSession();
      }
    }
  };

  const calculateProgress = () => {
    if (questions.length === 0) return 0;
    const currentResponses = activeTab === 'company' ? companyResponses : employeeResponses;
    const answeredQuestions = Object.keys(currentResponses).length;
    return (answeredQuestions / questions.length) * 100;
  };

  // Save status indicator
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

  // Company status indicator
  const renderCompanyStatusIndicator = () => {
    if (!companyId || companyFormState === 'loading') return null;

    const getStatusMessage = () => {
      switch (companyFormState) {
        case 'new':
          return { icon: '🆕', text: 'New Assessment', class: 'status-new' };
        case 'in_progress':
          return { 
            icon: '📝', 
            text: `In Progress (${companyStatus.completionPercentage}% complete)`, 
            class: 'status-in-progress' 
          };
        case 'completed':
          return { 
            icon: '✅', 
            text: `Completed ${companyStatus.lastModified ? new Date(companyStatus.lastModified).toLocaleDateString() : ''}`, 
            class: 'status-completed' 
          };
        default:
          return null;
      }
    };

    const statusInfo = getStatusMessage();
    if (!statusInfo) return null;

    return (
      <div className={`company-status-indicator ${statusInfo.class}`}>
        <span className="status-icon">{statusInfo.icon}</span>
        <span className="status-text">{statusInfo.text}</span>
        {unsavedCompanyChanges && (
          <span className="unsaved-notice">
            (You have unsaved changes)
          </span>
        )}
        {companyFormState === 'completed' && !unsavedCompanyChanges && (
          <span className="modification-notice">
            (Can be modified)
          </span>
        )}
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
                responses={employeeResponses}
                onResponseChange={handleEmployeeResponse}
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
          {/* Company ID Section */}
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
                {renderCompanyStatusIndicator()}
                {companyStatus.employeeCount > 0 && (
                  <div className="employee-summary">
                    👥 {companyStatus.employeeCount} employee(s) have completed assessments
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
                    {/* FIXED: Add explicit Save button for company form */}
                    <div className="company-form-actions">
                      <button
                        onClick={saveCompanyForm}
                        disabled={loading || saveStatus === 'saving'}
                        className={`btn btn-primary save-company-btn ${unsavedCompanyChanges ? 'has-changes' : ''}`}
                      >
                        {saveStatus === 'saving' ? (
                          <>
                            <span className="btn-spinner">💾</span>
                            Saving...
                          </>
                        ) : (
                          <>
                            <span className="btn-icon">💾</span>
                            {unsavedCompanyChanges ? 'Save Changes' : 'Save Company Form'}
                          </>
                        )}
                      </button>
                      {unsavedCompanyChanges && (
                        <span className="unsaved-indicator">
                          You have unsaved changes
                        </span>
                      )}
                    </div>
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
                          responses={companyResponses}
                          onResponseChange={handleCompanyResponse}
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
