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
  
  // Employee session management
  const [employeeSessionMode, setEmployeeSessionMode] = useState(null); // 'new' or 'returning'
  const [currentEmployeeId, setCurrentEmployeeId] = useState(null);
  const [employeeSessionReady, setEmployeeSessionReady] = useState(false);

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
          return data.employeeData;
        }
      }
      return null;
    } catch (error) {
      console.error('Error loading employee data:', error);
      return null;
    }
  };

  const saveResponse = async (questionId, answer, file = null) => {
    const newResponses = { ...responses, [questionId]: answer };
    setResponses(newResponses);

    // Auto-save to backend
    try {
      const payload = {
        companyId,
        formType: activeTab,
        responses: newResponses
      };

      // For employee forms, include employee ID if available
      if (activeTab === 'employee' && currentEmployeeId !== null) {
        payload.employeeId = currentEmployeeId;
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
          return;
        }
        throw new Error(errorData.error);
      }

      // If this was a new employee's first save, update the employee ID
      if (activeTab === 'employee' && currentEmployeeId === null) {
        const responseData = await response.json();
        if (responseData.employeeId !== undefined) {
          setCurrentEmployeeId(responseData.employeeId);
        }
      }
    } catch (error) {
      console.error('Error saving response:', error);
      alert('Error saving response. Please try again.');
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
    
    // Reset employee session when switching tabs
    if (tabId === 'employee') {
      setEmployeeSessionMode(null);
      setCurrentEmployeeId(null);
      setEmployeeSessionReady(false);
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
    setResponses({});
  };

  const handleEmployeeSessionSetup = async (mode, employeeId = null) => {
    setEmployeeSessionMode(mode);
    
    if (mode === 'new') {
      setCurrentEmployeeId(null);
      setResponses({});
      setEmployeeSessionReady(true);
    } else if (mode === 'returning' && employeeId !== null) {
      const employeeData = await loadEmployeeData(employeeId);
      if (employeeData) {
        setEmployeeSessionReady(true);
      } else {
        alert(`No employee found with ID ${employeeId}. Please check your Employee ID or start as a new employee.`);
        setEmployeeSessionMode(null);
      }
    }
  };

  const calculateProgress = () => {
    if (questions.length === 0) return 0;
    const answeredQuestions = Object.keys(responses).length;
    return (answeredQuestions / questions.length) * 100;
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
              <span className="badge badge-new">New Employee Assessment</span>
            ) : (
              <span className="badge badge-returning">
                Returning Employee #{currentEmployeeId}
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
