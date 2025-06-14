import React, { useState, useEffect } from 'react';
import './App.css';
import './enhanced-upload.css';
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
  const [companyStatus, setCompanyStatus] = useState({ 
    companyCompleted: false, 
    companyInProgress: false,
    employeeCount: 0, 
    employeeIds: [],
    lastModified: null,
    completionPercentage: 0
  });
  const [responses, setResponses] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState(''); // 'saving', 'saved', 'error'
  
  // FIXED: Enhanced Employee Session Management
  const [employeeSessionMode, setEmployeeSessionMode] = useState(null); // 'new' or 'returning'
  const [currentEmployeeId, setCurrentEmployeeId] = useState(null);
  const [employeeSessionReady, setEmployeeSessionReady] = useState(false);
  const [sessionInitialized, setSessionInitialized] = useState(false);

  // FIXED: Company state management
  const [companyCanModify, setCompanyCanModify] = useState(true);
  const [companyFormState, setCompanyFormState] = useState('loading'); // 'loading', 'new', 'in_progress', 'completed'
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [lastSaveTimestamp, setLastSaveTimestamp] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const tabs = [
    { id: 'company', label: 'Company Assessment', icon: '🏢' },
    { id: 'employee', label: 'Employee Assessment', icon: '👤' }
  ];

  // FIXED: Session management for company tab
  useEffect(() => {
    if (activeTab === 'company') {
      setEmployeeSessionReady(true);
      setSessionInitialized(true);
      console.log('Company tab: Session marked as ready');
    } else if (activeTab === 'employee') {
      // Only reset if no session exists
      if (!sessionInitialized) {
        setEmployeeSessionReady(false);
        console.log('Employee tab: Waiting for session setup');
      }
    }
  }, [activeTab, sessionInitialized]);

  // FIXED: Load questions when conditions are met
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

  // FIXED: Reset when company ID changes
  useEffect(() => {
    if (companyId) {
      resetEmployeeSession();
      checkCompanyStatus();
      setCompanyFormState('loading');
      setCompanyCanModify(true);
      setIsInitialLoad(true);
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

  // FIXED: Company status checking with proper logic
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

        // REQUIREMENT: Only one company questionnaire per company ID
        const hasResponses = status.completionPercentage > 0;
        const isCompleted = status.explicitlyCompleted === true;
        
        if (isCompleted) {
          setCompanyFormState('completed');
          setCompanyCanModify(true); // Still allow modifications
          console.log('Company form is completed');
        } else if (hasResponses) {
          setCompanyFormState('in_progress');
          setCompanyCanModify(true);
          console.log('Company form is in progress');
          
          // REQUIREMENT: Load existing responses to continue where left off
          if (isInitialLoad) {
            await loadCompanyResponses();
          }
        } else {
          setCompanyFormState('new');
          setCompanyCanModify(true);
          console.log('New company form');
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

  // FIXED: Load existing company responses 
  const loadCompanyResponses = async () => {
    try {
      console.log(`Loading company responses for ID: ${companyId}`);
      const response = await fetch(`${API_BASE_URL}/responses?action=getCompany&companyId=${companyId}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.found && data.responses) {
          setResponses(data.responses);
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

  // FIXED: Save response with proper logic per requirements
  const saveResponse = async (questionId, answer, file = null) => {
    // Prevent duplicate saves
    const now = Date.now();
    if (isSaving || (now - lastSaveTimestamp < 500)) {
      console.log('Save operation blocked: too frequent or already saving');
      return;
    }
    
    setIsSaving(true);
    setLastSaveTimestamp(now);

    // REQUIREMENT: Validate employee session for employee forms
    if (activeTab === 'employee') {
      if (!sessionInitialized || !employeeSessionMode) {
        console.warn('Cannot save: Employee session not properly initialized');
        setSaveStatus('error');
        alert('Employee session not ready. Please set up your employee session first.');
        setIsSaving(false);
        return;
      }
    }

    // Update local state immediately
    const newResponses = { ...responses, [questionId]: answer };
    setResponses(newResponses);
    setSaveStatus('saving');

    try {
      const payload = {
        companyId,
        formType: activeTab,
        responses: newResponses,
        lastModified: new Date().toISOString(),
        singleQuestionUpdate: true,
        preventAutoComplete: true,
        explicitSubmit: false
      };

      // REQUIREMENT: Handle file metadata if present
      if (file) {
        payload.fileMetadata = {
          questionId,
          ...file
        };
      }

      // REQUIREMENT: Employee session handling
      if (activeTab === 'employee') {
        if (employeeSessionMode === 'returning' && currentEmployeeId !== null) {
          payload.employeeId = currentEmployeeId;
          console.log(`Saving for returning employee ID: ${currentEmployeeId}`);
        } else if (employeeSessionMode === 'new') {
          if (currentEmployeeId !== null) {
            payload.employeeId = currentEmployeeId;
            console.log(`Saving for new employee with assigned ID: ${currentEmployeeId}`);
          } else {
            payload.isNewEmployee = true;
            console.log('First save for new employee - requesting ID assignment');
          }
        } else {
          throw new Error('Employee session not properly initialized');
        }
      } else {
        // REQUIREMENT: Company form handling - only one per company
        payload.allowModification = companyCanModify;
        payload.formState = companyFormState;
        
        const totalQuestions = questions.length;
        const answeredQuestions = Object.keys(newResponses).filter(key => 
          newResponses[key] && newResponses[key].trim() !== ''
        ).length;
        
        payload.inProgress = true;
        payload.completionPercentage = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;
        
        console.log(`Company save: ${answeredQuestions}/${totalQuestions} questions answered (${payload.completionPercentage}%)`);
      }

      console.log('Sending payload to backend:', payload);

      const response = await fetch(`${API_BASE_URL}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      let responseData = null;
      const responseText = await response.text();
      
      if (responseText) {
        try {
          responseData = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Error parsing response JSON:', parseError);
          responseData = { error: 'Invalid response format' };
        }
      }

      if (!response.ok) {
        if (responseData && responseData.error) {
          throw new Error(responseData.error);
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }
      
      // REQUIREMENT: Handle completion status updates
      if (activeTab === 'company' && responseData) {
        if (responseData.completionPercentage !== undefined) {
          setCompanyStatus(prev => ({
            ...prev,
            completionPercentage: responseData.completionPercentage,
            companyInProgress: responseData.completionPercentage > 0 && !responseData.explicitlyComplete,
            companyCompleted: responseData.explicitlyComplete === true,
            lastModified: new Date().toISOString()
          }));
        }
        
        if (responseData.explicitlyComplete === true) {
          setCompanyFormState('completed');
          console.log('Company form marked as completed by backend');
        } else if (responseData.completionPercentage > 0) {
          setCompanyFormState('in_progress');
          console.log('Company form remains in progress');
        }
      }

      // REQUIREMENT: Capture employee ID for new employees (first save only)
      if (activeTab === 'employee' && 
          employeeSessionMode === 'new' && 
          currentEmployeeId === null && 
          responseData && 
          responseData.employeeId !== undefined) {
        
        setCurrentEmployeeId(responseData.employeeId);
        console.log(`New employee ID assigned: ${responseData.employeeId}`);
        
        await checkCompanyStatus();
      }

      setSaveStatus('saved');
      console.log('Response saved successfully');
      
      setTimeout(() => setSaveStatus(''), 3000);

    } catch (error) {
      console.error('Error saving response:', error);
      setSaveStatus('error');
      alert(`Error saving response: ${error.message}. Please try again.`);
      
      setTimeout(() => setSaveStatus(''), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTabChange = (tabId) => {
    console.log(`Switching to tab: ${tabId}`);
    setActiveTab(tabId);
    setCurrentQuestionIndex(0);
    setSaveStatus('');
    
    if (tabId === 'employee') {
      setResponses({});
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
      } else {
        setResponses({});
      }
    }
  };

  const handleCompanyIdChange = (e) => {
    const newCompanyId = e.target.value;
    setCompanyId(newCompanyId);
    console.log(`Company ID changed to: ${newCompanyId}`);
    
    resetEmployeeSession();
    setQuestions([]);
    setResponses({});
    setIsInitialLoad(true);
    
    if (activeTab === 'company') {
      setEmployeeSessionReady(true);
      setSessionInitialized(true);
    }
  };

  // FIXED: Employee session setup with proper state management per requirements
  const handleEmployeeSessionSetup = async (mode, employeeId = null) => {
    console.log(`Setting up employee session: mode=${mode}, employeeId=${employeeId}`);
    
    setEmployeeSessionMode(mode);
    setSaveStatus('');
    
    if (mode === 'new') {
      // REQUIREMENT: New employee - ID will be generated on first save
      setCurrentEmployeeId(null);
      setResponses({});
      setEmployeeSessionReady(true);
      setSessionInitialized(true);
      console.log('New employee session initialized and ready');
      
    } else if (mode === 'returning' && employeeId !== null) {
      // REQUIREMENT: Returning employee - load existing data
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
    const answeredQuestions = Object.keys(responses).length;
    return (answeredQuestions / questions.length) * 100;
  };

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
        {companyFormState === 'completed' && (
          <span className="modification-notice">
            (Can be modified - changes will update last modified date)
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
          {/* REQUIREMENT: Company ID section - only one company questionnaire per ID */}
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
                  placeholder="Enter your assigned Company ID (e.g., Corndel1)"
                  className="company-id-input"
                  required
                />
                {renderCompanyStatusIndicator()}
                {companyStatus.employeeCount > 0 && (
                  <div className="employee-summary">
                    👥 {companyStatus.employeeCount} employee(s) have completed assessments
                    <br />
                    Employee IDs: {companyStatus.employeeIds.join(', ')}
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
