import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

// Updated API URL to match the deployed endpoint
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://p77na43rs7.execute-api.eu-west-2.amazonaws.com/dev';

function App() {
  // Main state management
  const [currentView, setCurrentView] = useState('home');
  const [companyId, setCompanyId] = useState('');
  const [currentEmployeeId, setCurrentEmployeeId] = useState('');
  const [returnEmployeeId, setReturnEmployeeId] = useState('');
  
  // Status and data states
  const [companyStatus, setCompanyStatus] = useState(null);
  const [employeeList, setEmployeeList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Form data states
  const [companyFormData, setCompanyFormData] = useState({
    section1: { companyName: '', industry: '', employees: '', revenue: '' },
    section2: { address: '', phone: '', email: '', website: '' },
    section3: { description: '', established: '', goals: '', challenges: '' }
  });

  const [employeeFormData, setEmployeeFormData] = useState({
    section1: { firstName: '', lastName: '', position: '', department: '' },
    section2: { email: '', phone: '', startDate: '', salary: '' },
    section3: { skills: '', experience: '', notes: '', goals: '' }
  });

  // Current form section tracking
  const [companySection, setCompanySection] = useState(1);
  const [employeeSection, setEmployeeSection] = useState(1);

  // Clear messages after delay
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Generate unique employee ID
  const generateId = () => {
    return 'EMP-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
  };

  // Enhanced API call with better error handling and CORS support
  const apiCall = async (endpoint, options = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Access-Control-Allow-Origin': '*',
          ...options.headers
        },
        mode: 'cors',
        credentials: 'omit',
        ...options
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return await response.text();
    } catch (error) {
      console.error('API Error:', error);
      throw new Error(`API Error: ${error.message}`);
    }
  };

  // Check company status with enhanced error handling
  const checkCompanyStatus = useCallback(async () => {
    if (!companyId.trim()) {
      setCompanyStatus(null);
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      // Use the correct API structure based on actual backend
      const data = await apiCall(`/responses/company-status/${encodeURIComponent(companyId)}`);
      
      setCompanyStatus(data.status || 'not-started');
      
      if (data.formData) {
        setCompanyFormData(data.formData);
      }
      
    } catch (error) {
      console.error('Error checking company status:', error);
      setCompanyStatus('not-started');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Load employee list with enhanced error handling
  const loadEmployeeList = useCallback(async () => {
    if (!companyId.trim()) {
      setEmployeeList([]);
      return;
    }

    try {
      const data = await apiCall(`/responses/employee-list/${encodeURIComponent(companyId)}`);
      setEmployeeList(data.employees || []);
    } catch (error) {
      console.error('Error loading employee list:', error);
      setEmployeeList([]);
    }
  }, [companyId]);

  // Effect for company status checking
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (companyId.trim()) {
        checkCompanyStatus();
        loadEmployeeList();
      } else {
        setCompanyStatus(null);
        setEmployeeList([]);
      }
    }, 300); // Debounce API calls

    return () => clearTimeout(timeoutId);
  }, [companyId, checkCompanyStatus, loadEmployeeList]);

  // Save company section with enhanced feedback
  const saveCompanySection = async () => {
    if (!companyId.trim()) {
      setError('Please enter a Company ID first');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const sectionData = {
        ...companyFormData,
        currentSection: companySection,
        isCompleted: companySection === 3,
        lastSaved: new Date().toISOString()
      };

      await apiCall('/responses/save-company', {
        method: 'POST',
        body: JSON.stringify({
          companyId: companyId.trim(),
          formData: sectionData,
          section: companySection
        })
      });

      if (companySection === 3) {
        setSuccess('Organisation form completed successfully!');
        setCompanyStatus('completed');
        setCurrentView('home');
      } else {
        setSuccess(`Section ${companySection} saved successfully!`);
        setCompanySection(companySection + 1);
      }
      
    } catch (error) {
      setError(`Failed to save organisation data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Save employee section with enhanced feedback
  const saveEmployeeSection = async () => {
    if (!companyId.trim() || !currentEmployeeId) {
      setError('Missing company ID or employee ID');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const sectionData = {
        ...employeeFormData,
        currentSection: employeeSection,
        isCompleted: employeeSection === 3,
        lastSaved: new Date().toISOString(),
        companyId: companyId.trim()
      };

      await apiCall('/responses/save-employee', {
        method: 'POST',
        body: JSON.stringify({
          companyId: companyId.trim(),
          employeeId: currentEmployeeId,
          formData: sectionData,
          section: employeeSection
        })
      });

      if (employeeSection === 3) {
        setSuccess('Employee form completed successfully!');
        setCurrentView('home');
        loadEmployeeList();
      } else {
        setSuccess(`Section ${employeeSection} saved successfully!`);
        setEmployeeSection(employeeSection + 1);
      }
      
    } catch (error) {
      setError(`Failed to save employee data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Load existing employee data
  const loadEmployeeData = async (employeeId) => {
    try {
      setLoading(true);
      const data = await apiCall(`/responses/employee-data/${encodeURIComponent(companyId)}/${encodeURIComponent(employeeId)}`);
      
      if (data.found) {
        setEmployeeFormData(data.formData);
        setEmployeeSection(data.currentSection || 1);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error loading employee data:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Start company form
  const startCompanyForm = (mode) => {
    setError('');
    setSuccess('');
    
    if (mode === 'amend' && companyStatus === 'completed') {
      setCompanySection(1);
    } else if (mode === 'load-previous' && companyStatus === 'in-progress') {
      // Load existing data and continue from current section
      setCompanySection(companyFormData.currentSection || 1);
    } else if (mode === 'start') {
      setCompanyFormData({
        section1: { companyName: '', industry: '', employees: '', revenue: '' },
        section2: { address: '', phone: '', email: '', website: '' },
        section3: { description: '', established: '', goals: '', challenges: '' }
      });
      setCompanySection(1);
    }
    setCurrentView('company-form');
  };

  // Start employee form
  const startEmployeeForm = (mode) => {
    setError('');
    setSuccess('');
    
    if (mode === 'new') {
      const newId = generateId();
      setCurrentEmployeeId(newId);
      setEmployeeFormData({
        section1: { firstName: '', lastName: '', position: '', department: '' },
        section2: { email: '', phone: '', startDate: '', salary: '' },
        section3: { skills: '', experience: '', notes: '', goals: '' }
      });
      setEmployeeSection(1);
      setCurrentView('employee-form');
    }
  };

  // Continue returning employee form
  const continueEmployeeForm = async () => {
    if (!returnEmployeeId.trim()) {
      setError('Please enter your Employee ID');
      return;
    }

    const success = await loadEmployeeData(returnEmployeeId.trim());
    if (success) {
      setCurrentEmployeeId(returnEmployeeId.trim());
      setCurrentView('employee-form');
    } else {
      setError('Employee ID not found. Please check your ID or start a new form.');
    }
  };

  // Enhanced Message Component with beautiful blue/white styling
  const MessageDisplay = () => {
    if (!error && !success) return null;

    return (
      <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-xl max-w-md border-2 backdrop-blur-sm ${ 
        error 
          ? 'bg-white/95 border-red-200 text-red-800' 
          : 'bg-gradient-to-r from-blue-50/95 to-white/95 border-blue-200 text-blue-800'
      }`}>
        <div className="flex items-center">
          <span className="mr-3 text-xl">
            {error ? '⚠️' : '✅'}
          </span>
          <p className="font-semibold">{error || success}</p>
        </div>
      </div>
    );
  };

  // Enhanced Home View with beautiful blue/white design
  const HomeView = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-blue-800 via-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4">
            Data & AI Readiness Assessment 2025
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 max-w-4xl mx-auto leading-relaxed">
            Comprehensive evaluation of your organisation's preparedness for the data-driven future
          </p>
        </div>

        <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-blue-100 p-8 md:p-10 mb-6 max-w-5xl mx-auto">
          <div className="flex items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center mr-6 shadow-lg">
              <span className="text-white text-2xl">🏢</span>
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Organisation Management</h2>
              <p className="text-gray-600 text-lg">Enter your unique organisation identifier to begin the assessment</p>
            </div>
          </div>
          
          <div className="mb-8">
            <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
              Organisation ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              onFocus={() => setError('')}
              className="w-full px-6 py-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-blue-50/50 focus:bg-white text-lg font-medium"
              placeholder="Enter your organisation ID (e.g., DMGT-001)"
              autoComplete="organization"
            />
            <p className="text-sm text-gray-500 mt-2">
              This ID will be used to track and manage all organisation and employee forms
            </p>
          </div>

          {companyId.trim() && (
            <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 rounded-2xl p-8 border-2 border-blue-100">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent mx-auto"></div>
                  <p className="mt-4 text-gray-700 font-semibold text-lg">Checking organisation status...</p>
                </div>
              ) : (
                <>
                  <CompanyStatusDisplay status={companyStatus} />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
                    {companyStatus === 'completed' && (
                      <button
                        onClick={() => startCompanyForm('amend')}
                        className="flex items-center justify-center px-6 py-4 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-xl hover:from-yellow-600 hover:to-yellow-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1 font-bold text-sm"
                      >
                        <span className="mr-2 text-lg">📝</span>
                        Amend Organisation Form
                      </button>
                    )}
                    {companyStatus === 'in-progress' && (
                      <>
                        <button
                          onClick={() => startCompanyForm('load-previous')}
                          className="flex items-center justify-center px-6 py-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1 font-bold text-sm"
                        >
                          <span className="mr-2 text-lg">📂</span>
                          Load Previous Survey
                        </button>
                        <button
                          onClick={() => startCompanyForm('start')}
                          className="flex items-center justify-center px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1 font-bold text-sm"
                        >
                          <span className="mr-2 text-lg">🔄</span>
                          Start Fresh
                        </button>
                      </>
                    )}
                    {companyStatus === 'not-started' && (
                      <button
                        onClick={() => startCompanyForm('start')}
                        className="flex items-center justify-center px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1 font-bold text-sm"
                      >
                        <span className="mr-2 text-lg">▶️</span>
                        Start Organisation Form
                      </button>
                    )}
                    <button
                      onClick={() => setCurrentView('employee-list')}
                      className="flex items-center justify-center px-6 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1 font-bold text-sm"
                    >
                      <span className="mr-2 text-lg">👥</span>
                      Employee Forms
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Enhanced Company Status Display with beautiful blue/white design
  const CompanyStatusDisplay = ({ status }) => {
    const statusConfig = {
      'not-started': { 
        icon: '🆕', 
        text: 'Ready to Start', 
        subtext: 'No form data found for this organisation ID',
        bgColor: 'bg-gradient-to-r from-gray-50 to-blue-50', 
        textColor: 'text-gray-700',
        iconBg: 'bg-gradient-to-r from-gray-400 to-gray-500',
        borderColor: 'border-gray-200'
      },
      'in-progress': { 
        icon: '📝', 
        text: 'Survey In Progress', 
        subtext: 'Organisation assessment started but not yet completed',
        bgColor: 'bg-gradient-to-r from-yellow-50 to-orange-50', 
        textColor: 'text-yellow-800',
        iconBg: 'bg-gradient-to-r from-yellow-400 to-orange-500',
        borderColor: 'border-yellow-200'
      },
      'completed': { 
        icon: '✅', 
        text: 'Survey Completed', 
        subtext: 'Organisation assessment successfully submitted',
        bgColor: 'bg-gradient-to-r from-green-50 to-emerald-50', 
        textColor: 'text-green-800',
        iconBg: 'bg-gradient-to-r from-green-400 to-emerald-500',
        borderColor: 'border-green-200'
      }
    };

    const config = statusConfig[status] || statusConfig['not-started'];

    return (
      <div className={`flex items-center p-6 rounded-2xl ${config.bgColor} border-2 ${config.borderColor} shadow-lg`}>
        <div className={`w-14 h-14 ${config.iconBg} rounded-xl flex items-center justify-center mr-6 shadow-md`}>
          <span className="text-white text-2xl">{config.icon}</span>
        </div>
        <div>
          <p className={`font-bold text-xl ${config.textColor} mb-1`}>Organisation Survey Status</p>
          <p className={`${config.textColor} font-bold text-lg`}>{config.text}</p>
          <p className={`${config.textColor} opacity-90 text-sm`}>{config.subtext}</p>
        </div>
      </div>
    );
  };

  // Enhanced Employee List View with beautiful blue/white theme
  const EmployeeListView = () => (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => setCurrentView('home')}
            className="flex items-center text-blue-600 hover:text-blue-800 mb-4 transition-colors font-semibold text-lg"
          >
            <span className="mr-2 text-xl">←</span>
            Back to Home
          </button>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-green-800 via-green-600 to-emerald-600 bg-clip-text text-transparent mb-2">Employee Forms</h1>
          <p className="text-gray-600 text-lg">Organisation ID: <span className="font-bold text-blue-700">{companyId}</span></p>
        </div>

        <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-green-100 p-8 md:p-10">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 lg:mb-0 text-gray-900">Employee Management</h2>
            <button
              onClick={() => startEmployeeForm('new')}
              className="flex items-center justify-center px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1 font-bold"
            >
              <span className="mr-2 text-lg">➕</span>
              Start New Employee Form
            </button>
          </div>

          {employeeList.length > 0 && (
            <div className="mb-8">
              <h3 className="text-2xl md:text-3xl font-bold mb-6 text-gray-900">Previous Employee Forms</h3>
              <div className="grid gap-4">
                {employeeList.map(employee => (
                  <div key={employee.id} className="border-2 border-blue-100 rounded-2xl p-6 flex justify-between items-center hover:shadow-lg transition-all duration-300 bg-gradient-to-r from-blue-50/50 to-white">
                    <div>
                      <p className="font-bold text-xl text-gray-900">Employee ID: {employee.id}</p>
                      <p className="text-gray-800 font-semibold text-lg">{employee.name || 'Name not provided'}</p>
                      <p className="text-gray-600 mt-1">
                        Status: <span className={`font-bold ${employee.completed ? 'text-green-600' : 'text-yellow-600'}`}>
                          {employee.completed ? 'Completed' : 'In Progress'}
                        </span>
                        {employee.lastSaved && (
                          <span className="text-gray-500 ml-2">
                            • Last saved: {new Date(employee.lastSaved).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    {employee.completed && (
                      <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                        <span className="text-white text-xl">✅</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t-2 border-blue-100 pt-8">
            <h3 className="text-2xl md:text-3xl font-bold mb-4 text-gray-900">Continue Previous Form</h3>
            <p className="text-gray-600 mb-6 text-lg">
              If you have started a form and need to continue, enter your Employee ID below:
            </p>
            <div className="flex flex-col md:flex-row gap-4 max-w-lg">
              <input
                type="text"
                value={returnEmployeeId}
                onChange={(e) => setReturnEmployeeId(e.target.value)}
                placeholder="Enter your Employee ID"
                className="flex-1 px-6 py-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all duration-300 bg-blue-50/50 focus:bg-white text-lg"
              />
              <button
                onClick={continueEmployeeForm}
                className="px-8 py-4 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 transition-all duration-300 shadow-lg hover:shadow-xl font-bold"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Enhanced Company Form View with beautiful blue/white styling
  const CompanyFormView = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <button
            onClick={() => setCurrentView('home')}
            className="flex items-center text-blue-600 hover:text-blue-800 mb-4 transition-colors font-semibold text-lg"
          >
            <span className="mr-2 text-xl">←</span>
            Back to Home
          </button>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-800 via-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">Organisation Information Form</h1>
          <p className="text-gray-600 text-lg">Organisation ID: <span className="font-bold text-blue-700">{companyId}</span></p>
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-blue-100 p-8 md:p-10 max-w-6xl mx-auto">
          {/* Beautiful Progress Indicator */}
          <div className="mb-10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Section {companySection} of 3</h2>
              <div className="flex space-x-3">
                {[1, 2, 3].map(step => (
                  <div
                    key={step}
                    className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center font-bold text-lg transition-all duration-500 ${ 
                      step <= companySection 
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg scale-105' 
                        : 'bg-gray-100 text-gray-400 border-2 border-gray-200'
                    }`}
                  >
                    {step}
                  </div>
                ))}</div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-gradient-to-r from-blue-600 to-blue-700 h-4 rounded-full transition-all duration-700 shadow-md"
                style={{ width: `${(companySection / 3) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Form Sections with beautiful styling */}
          {companySection === 1 && (
            <div className="space-y-8">
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">Basic Organisation Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Organisation Name *</label>
                  <input
                    type="text"
                    value={companyFormData.section1.companyName}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section1: { ...companyFormData.section1, companyName: e.target.value }
                    })}
                    className="w-full px-6 py-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-blue-50/30 focus:bg-white text-lg"
                    placeholder="Enter organisation name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Industry *</label>
                  <input
                    type="text"
                    value={companyFormData.section1.industry}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section1: { ...companyFormData.section1, industry: e.target.value }
                    })}
                    className="w-full px-6 py-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-blue-50/30 focus:bg-white text-lg"
                    placeholder="e.g., Technology, Healthcare"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Number of Employees *</label>
                  <select
                    value={companyFormData.section1.employees}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section1: { ...companyFormData.section1, employees: e.target.value }
                    })}
                    className="w-full px-6 py-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-blue-50/30 focus:bg-white text-lg"
                  >
                    <option value="">Select range</option>
                    <option value="1-10">1-10</option>
                    <option value="11-50">11-50</option>
                    <option value="51-200">51-200</option>
                    <option value="201-1000">201-1000</option>
                    <option value="1000+">1000+</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Annual Revenue</label>
                  <select
                    value={companyFormData.section1.revenue}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section1: { ...companyFormData.section1, revenue: e.target.value }
                    })}
                    className="w-full px-6 py-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-blue-50/30 focus:bg-white text-lg"
                  >
                    <option value="">Select range</option>
                    <option value="Under £1M">Under £1M</option>
                    <option value="£1M-£10M">£1M-£10M</option>
                    <option value="£10M-£100M">£10M-£100M</option>
                    <option value="£100M-£1B">£100M-£1B</option>
                    <option value="Over £1B">Over £1B</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {companySection === 2 && (
            <div className="space-y-8">
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">Contact Information</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Organisation Address *</label>
                  <textarea
                    value={companyFormData.section2.address}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section2: { ...companyFormData.section2, address: e.target.value }
                    })}
                    rows="4"
                    className="w-full px-6 py-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-blue-50/30 focus:bg-white text-lg"
                    placeholder="Enter full organisation address"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Phone Number</label>
                    <input
                      type="tel"
                      value={companyFormData.section2.phone}
                      onChange={(e) => setCompanyFormData({
                        ...companyFormData,
                        section2: { ...companyFormData.section2, phone: e.target.value }
                      })}
                      className="w-full px-6 py-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-blue-50/30 focus:bg-white text-lg"
                      placeholder="+44 20 1234 5678"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Email Address *</label>
                    <input
                      type="email"
                      value={companyFormData.section2.email}
                      onChange={(e) => setCompanyFormData({
                        ...companyFormData,
                        section2: { ...companyFormData.section2, email: e.target.value }
                      })}
                      className="w-full px-6 py-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-blue-50/30 focus:bg-white text-lg"
                      placeholder="contact@organisation.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Website</label>
                  <input
                    type="url"
                    value={companyFormData.section2.website}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section2: { ...companyFormData.section2, website: e.target.value }
                    })}
                    className="w-full px-6 py-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-blue-50/30 focus:bg-white text-lg"
                    placeholder="https://www.organisation.com"
                  />
                </div>
              </div>
            </div>
          )}

          {companySection === 3 && (
            <div className="space-y-8">
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">Additional Details</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Organisation Description *</label>
                  <textarea
                    value={companyFormData.section3.description}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section3: { ...companyFormData.section3, description: e.target.value }
                    })}
                    rows="5"
                    className="w-full px-6 py-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-blue-50/30 focus:bg-white text-lg"
                    placeholder="Describe your organisation's main business activities..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Year Established</label>
                  <input
                    type="number"
                    value={companyFormData.section3.established}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section3: { ...companyFormData.section3, established: e.target.value }
                    })}
                    className="w-full px-6 py-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-blue-50/30 focus:bg-white text-lg"
                    placeholder="e.g., 2020"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Data & AI Goals</label>
                  <textarea
                    value={companyFormData.section3.goals}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section3: { ...companyFormData.section3, goals: e.target.value }
                    })}
                    rows="4"
                    className="w-full px-6 py-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-blue-50/30 focus:bg-white text-lg"
                    placeholder="What are your data and AI objectives?"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Current Challenges</label>
                  <textarea
                    value={companyFormData.section3.challenges}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section3: { ...companyFormData.section3, challenges: e.target.value }
                    })}
                    rows="4"
                    className="w-full px-6 py-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-blue-50/30 focus:bg-white text-lg"
                    placeholder="What challenges do you face with data and AI?"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Beautiful Save Button */}
          <div className="mt-12 pt-8 border-t-2 border-blue-100">
            <button
              onClick={saveCompanySection}
              disabled={loading}
              className="w-full flex items-center justify-center px-8 py-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl hover:from-blue-700 hover:to-blue-800 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-xl font-bold shadow-xl hover:shadow-2xl transform hover:-translate-y-1"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-6 w-6 border-3 border-white border-t-transparent mr-4"></div>
                  Saving...
                </>
              ) : (
                <>
                  <span className="mr-4 text-2xl">💾</span>
                  {companySection === 3 ? 'Complete & Save Form' : 'Save Progress & Continue'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Enhanced Employee Form View with beautiful green/white styling
  const EmployeeFormView = () => (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <button
            onClick={() => setCurrentView('employee-list')}
            className="flex items-center text-green-600 hover:text-green-800 mb-4 transition-colors font-semibold text-lg"
          >
            <span className="mr-2 text-xl">←</span>
            Back to Employee List
          </button>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-green-800 via-green-600 to-emerald-600 bg-clip-text text-transparent mb-4">Employee Information Form</h1>
          
          <div className="bg-gradient-to-r from-blue-100/80 to-green-100/80 border-2 border-blue-200 rounded-2xl p-6 mt-4 max-w-3xl shadow-lg">
            <p className="text-blue-800 font-bold text-lg">Your Employee ID: {currentEmployeeId}</p>
            <p className="text-blue-600 mt-1">Please save this ID to continue your form later if needed.</p>
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-green-100 p-8 md:p-10 max-w-6xl mx-auto">
          {/* Beautiful Progress Indicator */}
          <div className="mb-10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Section {employeeSection} of 3</h2>
              <div className="flex space-x-3">
                {[1, 2, 3].map(step => (
                  <div
                    key={step}
                    className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center font-bold text-lg transition-all duration-500 ${ 
                      step <= employeeSection 
                        ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-lg scale-105' 
                        : 'bg-gray-100 text-gray-400 border-2 border-gray-200'
                    }`}
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-gradient-to-r from-green-600 to-green-700 h-4 rounded-full transition-all duration-700 shadow-md"
                style={{ width: `${(employeeSection / 3) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Form Sections with beautiful styling */}
          {employeeSection === 1 && (
            <div className="space-y-8">
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">First Name *</label>
                  <input
                    type="text"
                    value={employeeFormData.section1.firstName}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section1: { ...employeeFormData.section1, firstName: e.target.value }
                    })}
                    className="w-full px-6 py-4 border-2 border-green-200 rounded-xl focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all duration-300 bg-green-50/30 focus:bg-white text-lg"
                    placeholder="Enter first name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Last Name *</label>
                  <input
                    type="text"
                    value={employeeFormData.section1.lastName}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section1: { ...employeeFormData.section1, lastName: e.target.value }
                    })}
                    className="w-full px-6 py-4 border-2 border-green-200 rounded-xl focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all duration-300 bg-green-50/30 focus:bg-white text-lg"
                    placeholder="Enter last name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Job Title *</label>
                  <input
                    type="text"
                    value={employeeFormData.section1.position}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section1: { ...employeeFormData.section1, position: e.target.value }
                    })}
                    className="w-full px-6 py-4 border-2 border-green-200 rounded-xl focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all duration-300 bg-green-50/30 focus:bg-white text-lg"
                    placeholder="e.g., Software Engineer"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Department *</label>
                  <input
                    type="text"
                    value={employeeFormData.section1.department}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section1: { ...employeeFormData.section1, department: e.target.value }
                    })}
                    className="w-full px-6 py-4 border-2 border-green-200 rounded-xl focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all duration-300 bg-green-50/30 focus:bg-white text-lg"
                    placeholder="e.g., Engineering"
                  />
                </div>
              </div>
            </div>
          )}

          {employeeSection === 2 && (
            <div className="space-y-8">
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">Contact & Employment Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Email Address *</label>
                  <input
                    type="email"
                    value={employeeFormData.section2.email}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section2: { ...employeeFormData.section2, email: e.target.value }
                    })}
                    className="w-full px-6 py-4 border-2 border-green-200 rounded-xl focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all duration-300 bg-green-50/30 focus:bg-white text-lg"
                    placeholder="email@organisation.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Phone Number</label>
                  <input
                    type="tel"
                    value={employeeFormData.section2.phone}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section2: { ...employeeFormData.section2, phone: e.target.value }
                    })}
                    className="w-full px-6 py-4 border-2 border-green-200 rounded-xl focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all duration-300 bg-green-50/30 focus:bg-white text-lg"
                    placeholder="+44 7xxx xxx xxx"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Start Date</label>
                  <input
                    type="date"
                    value={employeeFormData.section2.startDate}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section2: { ...employeeFormData.section2, startDate: e.target.value }
                    })}
                    className="w-full px-6 py-4 border-2 border-green-200 rounded-xl focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all duration-300 bg-green-50/30 focus:bg-white text-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Salary Range (Optional)</label>
                  <select
                    value={employeeFormData.section2.salary}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section2: { ...employeeFormData.section2, salary: e.target.value }
                    })}
                    className="w-full px-6 py-4 border-2 border-green-200 rounded-xl focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all duration-300 bg-green-50/30 focus:bg-white text-lg"
                  >
                    <option value="">Prefer not to say</option>
                    <option value="Under £30k">Under £30k</option>
                    <option value="£30k-£50k">£30k-£50k</option>
                    <option value="£50k-£75k">£50k-£75k</option>
                    <option value="£75k-£100k">£75k-£100k</option>
                    <option value="Over £100k">Over £100k</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {employeeSection === 3 && (
            <div className="space-y-8">
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">Skills & Experience</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Key Skills *</label>
                  <textarea
                    value={employeeFormData.section3.skills}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section3: { ...employeeFormData.section3, skills: e.target.value }
                    })}
                    rows="4"
                    className="w-full px-6 py-4 border-2 border-green-200 rounded-xl focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all duration-300 bg-green-50/30 focus:bg-white text-lg"
                    placeholder="List your key skills and technologies..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Experience with Data/AI</label>
                  <textarea
                    value={employeeFormData.section3.experience}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section3: { ...employeeFormData.section3, experience: e.target.value }
                    })}
                    rows="4"
                    className="w-full px-6 py-4 border-2 border-green-200 rounded-xl focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all duration-300 bg-green-50/30 focus:bg-white text-lg"
                    placeholder="Describe your experience with data analysis, AI, or machine learning..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Professional Goals</label>
                  <textarea
                    value={employeeFormData.section3.goals}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section3: { ...employeeFormData.section3, goals: e.target.value }
                    })}
                    rows="4"
                    className="w-full px-6 py-4 border-2 border-green-200 rounded-xl focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all duration-300 bg-green-50/30 focus:bg-white text-lg"
                    placeholder="What are your career goals related to data and AI?"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Additional Notes</label>
                  <textarea
                    value={employeeFormData.section3.notes}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section3: { ...employeeFormData.section3, notes: e.target.value }
                    })}
                    rows="4"
                    className="w-full px-6 py-4 border-2 border-green-200 rounded-xl focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all duration-300 bg-green-50/30 focus:bg-white text-lg"
                    placeholder="Any additional information you'd like to share..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Beautiful Save Button */}
          <div className="mt-12 pt-8 border-t-2 border-green-100">
            <button
              onClick={saveEmployeeSection}
              disabled={loading}
              className="w-full flex items-center justify-center px-8 py-6 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-2xl hover:from-green-700 hover:to-green-800 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-xl font-bold shadow-xl hover:shadow-2xl transform hover:-translate-y-1"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-6 w-6 border-3 border-white border-t-transparent mr-4"></div>
                  Saving...
                </>
              ) : (
                <>
                  <span className="mr-4 text-2xl">💾</span>
                  {employeeSection === 3 ? 'Complete & Save Form' : 'Save Progress & Continue'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Main render with beautiful blue/white theme
  return (
    <div className="font-sans antialiased bg-gradient-to-br from-blue-50 via-white to-indigo-50 min-h-screen">
      <MessageDisplay />
      {currentView === 'home' && <HomeView />}
      {currentView === 'company-form' && <CompanyFormView />}
      {currentView === 'employee-list' && <EmployeeListView />}
      {currentView === 'employee-form' && <EmployeeFormView />}
    </div>
  );
}

export default App;
