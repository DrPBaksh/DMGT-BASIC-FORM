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
  const [responses, setResponses] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState(''); // 'saving', 'saved', 'error'
  
  // ENHANCED: Better Employee Session Management
  const [employeeSessionMode, setEmployeeSessionMode] = useState(null); // 'new' or 'returning'
  const [currentEmployeeId, setCurrentEmployeeId] = useState(null);
  const [employeeSessionReady, setEmployeeSessionReady] = useState(false);
  const [sessionInitialized, setSessionInitialized] = useState(false);

  // NEW: Manual save functionality for company audit
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [manualSaveInProgress, setManualSaveInProgress] = useState(false);

  // FIXED: Company modification tracking - now allows modification of completed assessments
  const [companyCanModify, setCompanyCanModify] = useState(true);
  const [companyFormState, setCompanyFormState] = useState('loading'); // 'loading', 'new', 'existing', 'can_continue'
  const [isInitialLoad, setIsInitialLoad] = useState(true); // Track if this is the first load

  // NEW: Employee ID notification state
  const [showEmployeeIdNotification, setShowEmployeeIdNotification] = useState(false);

  const tabs = [
    { id: 'company', label: 'Organization Assessment', icon: '🏢' },
    { id: 'employee', label: 'Employee Assessment', icon: '👤' }
  ];

  // ENHANCED: Improved question loading with better dependency management
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

  // ENHANCED: Reset session state when company ID changes
  useEffect(() => {
    if (companyId) {
      resetEmployeeSession();
      checkCompanyStatus();
      // Reset company state
      setCompanyFormState('loading');
      setCompanyCanModify(true);
      setIsInitialLoad(true); // Mark as initial load
      setHasUnsavedChanges(false);
      setLastSavedTime(null);
    } else {
      // Clear everything if no company ID
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
      setHasUnsavedChanges(false);
      setLastSavedTime(null);
    }
  }, [companyId]);

  // NEW: Show employee ID notification when ID is assigned
  useEffect(() => {
    if (currentEmployeeId !== null && employeeSessionMode === 'new' && activeTab === 'employee') {
      setShowEmployeeIdNotification(true);
      // Auto-hide after 10 seconds
      const timer = setTimeout(() => {
        setShowEmployeeIdNotification(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [currentEmployeeId, employeeSessionMode, activeTab]);

  const resetEmployeeSession = () => {
    setEmployeeSessionMode(null);
    setCurrentEmployeeId(null);
    setEmployeeSessionReady(false);
    setSessionInitialized(false);
    setResponses({});
    setSaveStatus('');
    setShowEmployeeIdNotification(false);
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

  // FIXED: Better company status checking with proper completion logic
  const checkCompanyStatus = async () => {
    if (!companyId) return;
    
    try {
      setCompanyFormState('loading');
      const response = await fetch(`${API_BASE_URL}/responses?companyId=${companyId}`);
      
      if (response.ok) {
        const status = await response.json();
        console.log('Company status received:', status);
        
        // Update company status state
        setCompanyStatus({
          companyCompleted: status.companyCompleted || false,
          companyInProgress: status.companyInProgress || false,
          employeeCount: status.employeeCount || 0,
          employeeIds: status.employeeIds || [],
          lastModified: status.lastModified || null,
          completionPercentage: status.completionPercentage || 0
        });

        // Update last saved time from status
        if (status.lastModified) {
          setLastSavedTime(status.lastModified);
        }

        // FIXED: New logic - always allow modification, show appropriate messaging
        const hasAnyResponses = status.completionPercentage > 0;
        
        if (hasAnyResponses) {
          // File exists - ask if user wants to continue/update
          const shouldContinue = window.confirm(
            `An assessment already exists for Organization ID: ${companyId} (${status.completionPercentage}% complete).\n\n` +
            `Last modified: ${status.lastModified ? new Date(status.lastModified).toLocaleString() : 'Unknown'}\n\n` +
            `Do you want to CONTINUE/UPDATE this existing assessment?\n\n` +
            `• Click OK to load and continue the existing assessment\n` +
            `• Click Cancel to start fresh (existing data will not be affected)`
          );
          
          if (shouldContinue) {
            setCompanyFormState('existing');
            setCompanyCanModify(true);
            console.log('User chose to continue existing assessment');
            
            // Load existing responses
            if (isInitialLoad) {
              await loadCompanyResponses();
            }
          } else {
            setCompanyFormState('new');
            setCompanyCanModify(true);
            setResponses({}); // Clear responses for fresh start
            console.log('User chose to start fresh assessment');
          }
        } else {
          // No responses yet - new assessment
          setCompanyFormState('new');
          setCompanyCanModify(true);
          console.log('New company assessment - no existing data');
        }
        
        setIsInitialLoad(false); // Mark initial load as complete
        
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

  // ENHANCED: Load existing company responses
  const loadCompanyResponses = async () => {
    try {
      console.log(`Loading company responses for ID: ${companyId}`);
      const response = await fetch(`${API_BASE_URL}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'getCompany',
          companyId: companyId
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.found && data.responses) {
          setResponses(data.responses);
          setHasUnsavedChanges(false); // Mark as no unsaved changes since we just loaded
          console.log('Company responses loaded:', data.responses);
          
          // Show confirmation that existing data was loaded
          const responseCount = Object.keys(data.responses).length;
          alert(`Existing assessment loaded successfully!\n\nFound ${responseCount} previous responses.\nYou can now continue where you left off or modify any responses.`);
        }
      }
    } catch (error) {
      console.error('Error loading company responses:', error);
    }
  };

  const loadEmployeeData = async (employeeId) => {
    try {
      console.log(`Loading employee data for ID: ${employeeId}`);
      const response = await fetch(`${API_BASE_URL}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'getEmployee',
          companyId: companyId,
          employeeId: employeeId
        })
      });
      
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

  // NEW: Manual save function for company audit
  const manualSaveCompany = async () => {
    if (!companyId.trim()) {
      alert('Please enter a Company ID first');
      return;
    }

    if (!hasUnsavedChanges && companyFormState !== 'new') {
      alert('No changes to save');
      return;
    }

    try {
      setManualSaveInProgress(true);
      setSaveStatus('saving');

      const payload = {
        companyId,
        formType: 'company',
        responses,
        lastModified: new Date().toISOString(),
        manualSave: true,
        preventAutoComplete: true, // Prevent auto-completion
        singleQuestionUpdate: false // This is a full save
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
      
      // Update status
      if (responseData.completionPercentage !== undefined) {
        setCompanyStatus(prev => ({
          ...prev,
          completionPercentage: responseData.completionPercentage,
          companyInProgress: responseData.completionPercentage > 0 && responseData.completionPercentage < 100,
          companyCompleted: false, // Manual save never completes automatically
          lastModified: new Date().toISOString()
        }));
      }

      setCompanyFormState('existing');
      setHasUnsavedChanges(false);
      setLastSavedTime(new Date().toISOString());
      setSaveStatus('saved');
      
      setTimeout(() => setSaveStatus(''), 3000);
      console.log('Manual save completed successfully');

    } catch (error) {
      console.error('Error during manual save:', error);
      setSaveStatus('error');
      alert(`Error saving: ${error.message}`);
      setTimeout(() => setSaveStatus(''), 5000);
    } finally {
      setManualSaveInProgress(false);
    }
  };

  // NEW: Complete company audit function
  const completeCompanyAudit = async () => {
    if (!companyId.trim()) {
      alert('Please enter a Company ID first');
      return;
    }

    // Check if all required questions are answered
    const totalQuestions = questions.length;
    const answeredQuestions = Object.keys(responses).filter(key => 
      responses[key] && responses[key].trim() !== ''
    ).length;

    if (answeredQuestions < totalQuestions) {
      const confirm = window.confirm(
        `You have answered ${answeredQuestions} out of ${totalQuestions} questions. Do you want to complete the audit anyway?`
      );
      if (!confirm) return;
    }

    try {
      setManualSaveInProgress(true);
      setSaveStatus('saving');

      const payload = {
        companyId,
        formType: 'company',
        responses,
        lastModified: new Date().toISOString(),
        completeAudit: true,
        forceComplete: true
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

      // Update status to completed
      setCompanyStatus(prev => ({
        ...prev,
        completionPercentage: 100,
        companyInProgress: false,
        companyCompleted: true,
        lastModified: new Date().toISOString()
      }));

      setCompanyFormState('existing');
      setHasUnsavedChanges(false);
      setLastSavedTime(new Date().toISOString());
      setSaveStatus('saved');
      
      alert('Company audit completed and submitted successfully!\n\nYou can still make changes and save them if needed.');
      setTimeout(() => setSaveStatus(''), 3000);

    } catch (error) {
      console.error('Error completing audit:', error);
      setSaveStatus('error');
      alert(`Error completing audit: ${error.message}`);
      setTimeout(() => setSaveStatus(''), 5000);
    } finally {
      setManualSaveInProgress(false);
    }
  };

  // MODIFIED: Enhanced response handler for manual save workflow
  const handleResponseChange = async (questionId, answer, file = null) => {
    const newResponses = { ...responses, [questionId]: answer };
    setResponses(newResponses);

    if (activeTab === 'company') {
      // For company audit: only mark as unsaved, don't auto-save
      setHasUnsavedChanges(true);
      console.log('Company response changed - marked as unsaved');
    } else {
      // For employee assessment: keep auto-save functionality
      await saveEmployeeResponse(questionId, answer, file);
    }
  };

  // NEW: Separate save function for employee responses (keeps auto-save)
  const saveEmployeeResponse = async (questionId, answer, file = null) => {
    // CRITICAL FIX: Don't allow saving if employee session not properly initialized
    if (!sessionInitialized) {
      console.warn('Attempted to save response before employee session was initialized');
      return;
    }

    setSaveStatus('saving');

    try {
      const payload = {
        companyId,
        formType: 'employee',
        responses: { ...responses, [questionId]: answer },
        lastModified: new Date().toISOString(),
        preventAutoComplete: true,
        singleQuestionUpdate: true
      };

      // ENHANCED: Include file metadata if present
      if (file) {
        payload.fileMetadata = {
          questionId,
          ...file
        };
      }

      // ENHANCED: Proper employee session handling
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

      // ENHANCED: Capture employee ID for new employees (first save only)
      if (employeeSessionMode === 'new' && 
          currentEmployeeId === null && 
          responseData.employeeId !== undefined) {
        
        setCurrentEmployeeId(responseData.employeeId);
        console.log(`New employee ID assigned: ${responseData.employeeId}`);
        
        // Update company status to reflect new employee
        await checkCompanyStatus();
      }

      setSaveStatus('saved');
      console.log('Employee response saved successfully');
      
      // Auto-clear save status after a moment
      setTimeout(() => setSaveStatus(''), 3000);

    } catch (error) {
      console.error('Error saving employee response:', error);
      setSaveStatus('error');
      alert(`Error saving response: ${error.message}. Please try again.`);
      
      // Auto-clear error status
      setTimeout(() => setSaveStatus(''), 5000);
    }
  };

  // ENHANCED: Better tab change handling with unsaved changes warning
  const handleTabChange = (tabId) => {
    // Warn about unsaved changes for company audit
    if (activeTab === 'company' && hasUnsavedChanges) {
      const proceed = window.confirm(
        'You have unsaved changes in the company audit. Do you want to continue without saving?'
      );
      if (!proceed) return;
    }
    
    console.log(`Switching to tab: ${tabId}`);
    setActiveTab(tabId);
    setCurrentQuestionIndex(0);
    setSaveStatus('');
    
    // ENHANCED: Better state management when switching tabs
    if (tabId === 'employee') {
      // Clear responses when switching to employee tab
      setResponses({});
      setQuestions([]);
      // Only reset if no session exists
      if (!sessionInitialized) {
        resetEmployeeSession();
      }
    } else {
      // Company tab
      setEmployeeSessionReady(true);
      setSessionInitialized(true);
      // Load company responses if they exist
      if (companyFormState === 'existing') {
        loadCompanyResponses();
      } else {
        setResponses({});
      }
    }
  };

  const handleCompanyIdChange = (e) => {
    const newCompanyId = e.target.value.toUpperCase();
    setCompanyId(newCompanyId);
    console.log(`Company ID changed to: ${newCompanyId}`);
    
    // Reset everything when company ID changes
    resetEmployeeSession();
    setQuestions([]);
    setResponses({});
    setIsInitialLoad(true); // Reset initial load flag
    setHasUnsavedChanges(false);
    setLastSavedTime(null);
    
    // If we're on company tab, set ready immediately
    if (activeTab === 'company') {
      setEmployeeSessionReady(true);
      setSessionInitialized(true);
    }
  };

  // ENHANCED: Enhanced employee session setup with proper state management
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

  // ENHANCED: Enhanced save status indicator with better styling
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

  // NEW: Employee ID notification for new employees
  const renderEmployeeIdNotification = () => {
    if (!showEmployeeIdNotification || currentEmployeeId === null) return null;

    return (
      <div className="employee-id-notification">
        <div className="notification-content">
          <div className="notification-header">
            <span className="notification-icon">🎯</span>
            <h3>Your Survey ID</h3>
            <button 
              className="notification-close"
              onClick={() => setShowEmployeeIdNotification(false)}
            >
              ×
            </button>
          </div>
          <div className="notification-body">
            <div className="survey-id-display">
              <span className="survey-id-label">Survey ID:</span>
              <span className="survey-id-value">#{currentEmployeeId}</span>
            </div>
            <p className="survey-id-instructions">
              📝 <strong>Important:</strong> Please save this Survey ID: <strong>#{currentEmployeeId}</strong>
            </p>
            <p className="survey-id-note">
              You can use this ID to return and complete your assessment later if needed.
            </p>
            <div className="notification-actions">
              <button 
                className="btn btn-small btn-primary"
                onClick={() => {
                  navigator.clipboard.writeText(currentEmployeeId.toString());
                  alert('Survey ID copied to clipboard!');
                }}
              >
                📋 Copy ID
              </button>
              <button 
                className="btn btn-small btn-secondary"
                onClick={() => setShowEmployeeIdNotification(false)}
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ENHANCED: Company status indicator with modification support
  const renderCompanyStatusIndicator = () => {
    if (!companyId || companyFormState === 'loading') return null;

    const getStatusMessage = () => {
      switch (companyFormState) {
        case 'new':
          return { icon: '🆕', text: 'New Assessment', class: 'status-new' };
        case 'existing':
          return { 
            icon: '📝', 
            text: `Continuing Assessment (${companyStatus.completionPercentage}% complete)`, 
            class: 'status-existing' 
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
        {lastSavedTime && (
          <span className="last-saved">
            Last saved: {new Date(lastSavedTime).toLocaleString()}
          </span>
        )}
        {hasUnsavedChanges && activeTab === 'company' && (
          <span className="unsaved-warning">
            ⚠️ Unsaved changes
          </span>
        )}
        {companyFormState === 'existing' && (
          <span className="modification-notice">
            (You can modify any responses and save them)
          </span>
        )}
      </div>
    );
  };

  // NEW: Manual save controls for company audit
  const renderManualSaveControls = () => {
    if (activeTab !== 'company') return null;

    return (
      <div className="manual-save-controls">
        <div className="save-controls-group">
          <button
            onClick={manualSaveCompany}
            disabled={manualSaveInProgress || (!hasUnsavedChanges && companyFormState !== 'new')}
            className="btn btn-primary save-progress-btn"
          >
            {manualSaveInProgress ? (
              <>
                <span className="spinner">⏳</span>
                Saving...
              </>
            ) : (
              <>
                💾 Save Progress
                {hasUnsavedChanges && <span className="unsaved-indicator">*</span>}
              </>
            )}
          </button>

          <button
            onClick={completeCompanyAudit}
            disabled={manualSaveInProgress}
            className="btn btn-success complete-audit-btn"
          >
            {manualSaveInProgress ? (
              <>
                <span className="spinner">⏳</span>
                Completing...
              </>
            ) : (
              <>
                🎯 Complete & Submit Audit
              </>
            )}
          </button>
        </div>
        
        <div className="save-info">
          <p className="save-note">
            📝 <strong>Manual Save Mode:</strong> Your progress will only be saved when you click "Save Progress" or "Complete & Submit Audit"
          </p>
          {hasUnsavedChanges && (
            <p className="unsaved-warning-text">
              ⚠️ You have unsaved changes. Remember to save your progress before leaving this page.
            </p>
          )}
          {companyFormState === 'existing' && (
            <p className="continue-note">
              🔄 <strong>Continuing Existing Assessment:</strong> You can modify any responses and save your changes.
            </p>
          )}
        </div>
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
                {currentEmployeeId !== null && ` - Survey ID: #${currentEmployeeId}`}
              </span>
            ) : (
              <span className="badge badge-returning">
                🔄 Returning Employee - Survey ID: #{currentEmployeeId}
              </span>
            )}
          </div>
          {renderSaveStatus()}
          <div className="auto-save-notice">
            💾 Employee assessments are automatically saved as you complete each question
          </div>
        </div>

        {/* NEW: Employee ID notification */}
        {renderEmployeeIdNotification()}

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
                onResponseChange={handleResponseChange}
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
          <h1>DMGT Data & AI Readiness Assessment 2025</h1>
          <p className="subtitle">Enterprise-grade evaluation platform for FTSE-100 organizations</p>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          {/* Company ID Section with enhanced glass-card styling */}
          <div className="company-id-section">
            <div className="glass-card">
              <div className="company-id-header">
                <h2>🏢 Organization Identification</h2>
                <p>Enter your assigned Organization ID to access the assessment portal</p>
              </div>
              <div className="company-id-input-group">
                <label htmlFor="companyId" className="company-id-label">
                  Organization ID <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="companyId"
                  value={companyId}
                  onChange={handleCompanyIdChange}
                  placeholder="Enter your Organization ID (e.g., DMGT-2025-001)"
                  className="company-id-input"
                  required
                />
                {renderCompanyStatusIndicator()}
                {companyStatus.employeeCount > 0 && (
                  <div className="employee-summary">
                    👥 {companyStatus.employeeCount} employee assessment(s) completed
                    <div className="employee-ids-preview">
                      Employee IDs: {companyStatus.employeeIds.slice(0, 3).join(', ')}
                      {companyStatus.employeeIds.length > 3 && ` +${companyStatus.employeeIds.length - 3} more`}
                    </div>
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
                    {renderManualSaveControls()}
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
                          <p>Loading assessment questions...</p>
                        </div>
                      ) : questions.length > 0 ? (
                        <FormRenderer
                          questions={questions}
                          responses={responses}
                          onResponseChange={handleResponseChange}
                          onQuestionChange={setCurrentQuestionIndex}
                          companyId={companyId}
                          formType={activeTab}
                          manualSaveMode={true}
                        />
                      ) : (
                        <div className="empty-state">
                          <p>No questions available for this assessment type.</p>
                          <p>Please ensure you have a valid Organization ID and try refreshing the page.</p>
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
        <p>&copy; 2025 DMGT. All rights reserved. | Professional Data & AI Readiness Assessment Platform</p>
      </footer>
    </div>
  );
}

export default App;