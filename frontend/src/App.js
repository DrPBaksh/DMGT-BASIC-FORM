import React, { useState, useEffect } from 'react';
import './App.css';
import FormRenderer from './components/FormRenderer';
import TabNavigation from './components/TabNavigation';
import Logo from './components/Logo';
import ProgressBar from './components/ProgressBar';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://your-api-gateway-url.amazonaws.com/prod';

function App() {
  const [activeTab, setActiveTab] = useState('company');
  const [companyId, setCompanyId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companyStatus, setCompanyStatus] = useState({ companyCompleted: false, employeeCount: 0 });
  const [responses, setResponses] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const tabs = [
    { id: 'company', label: 'Company Assessment', icon: '🏢' },
    { id: 'employee', label: 'Employee Assessment', icon: '👤' }
  ];

  useEffect(() => {
    if (companyId && activeTab) {
      loadQuestions();
      checkCompanyStatus();
    }
  }, [activeTab, companyId]);

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
  };

  const handleCompanyIdChange = (e) => {
    setCompanyId(e.target.value);
  };

  const calculateProgress = () => {
    if (questions.length === 0) return 0;
    const answeredQuestions = Object.keys(responses).length;
    return (answeredQuestions / questions.length) * 100;
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
            {companyStatus.employeeCount > 0 && activeTab === 'employee' && (
              <div className="status-info">
                👥 You will be Employee #{companyStatus.employeeCount + 1} for this company
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
        </div>
      </main>

      <footer className="app-footer">
        <p>&copy; 2025 DMGT. All rights reserved. | Data & AI Readiness Assessment</p>
      </footer>
    </div>
  );
}

export default App;