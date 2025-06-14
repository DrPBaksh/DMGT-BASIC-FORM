import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://your-api-gateway-url.amazonaws.com/prod';

function App() {
  // Main state management
  const [currentView, setCurrentView] = useState('home'); // home, company-form, employee-form, employee-list
  const [companyId, setCompanyId] = useState('');
  const [currentEmployeeId, setCurrentEmployeeId] = useState('');
  const [isReturningEmployee, setIsReturningEmployee] = useState(false);
  const [returnEmployeeId, setReturnEmployeeId] = useState('');

  // Form data states - divided into sections as requested
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

  // Status tracking
  const [companyStatus, setCompanyStatus] = useState(null); // null, 'not-started', 'in-progress', 'completed'
  const [employeeList, setEmployeeList] = useState([]);
  const [loading, setLoading] = useState(false);

  // Current form section tracking
  const [companySection, setCompanySection] = useState(1);
  const [employeeSection, setEmployeeSection] = useState(1);

  // Generate unique ID
  const generateId = () => {
    return 'EMP-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
  };

  // Check company status when company ID changes
  useEffect(() => {
    if (companyId) {
      checkCompanyStatus();
      loadEmployeeList();
    } else {
      setCompanyStatus(null);
      setEmployeeList([]);
    }
  }, [companyId]);

  // Check company completion status
  const checkCompanyStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/company-status/${companyId}`);
      
      if (response.ok) {
        const data = await response.json();
        setCompanyStatus(data.status); // 'not-started', 'in-progress', 'completed'
        
        // Load existing form data if in progress or completed
        if (data.status === 'in-progress' || data.status === 'completed') {
          setCompanyFormData(data.formData || companyFormData);
        }
      } else {
        setCompanyStatus('not-started');
      }
    } catch (error) {
      console.error('Error checking company status:', error);
      setCompanyStatus('not-started');
    } finally {
      setLoading(false);
    }
  };

  // Load employee list for this company
  const loadEmployeeList = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/employee-list/${companyId}`);
      if (response.ok) {
        const data = await response.json();
        setEmployeeList(data.employees || []);
      }
    } catch (error) {
      console.error('Error loading employee list:', error);
      setEmployeeList([]);
    }
  };

  // Save company form section to S3
  const saveCompanySection = async () => {
    if (!companyId) {
      alert('Please enter a Company ID first');
      return;
    }

    try {
      setLoading(true);
      
      const sectionData = {
        section1: companyFormData.section1,
        section2: companyFormData.section2,
        section3: companyFormData.section3,
        currentSection: companySection,
        isCompleted: companySection === 3,
        lastSaved: new Date().toISOString()
      };

      const response = await fetch(`${API_BASE_URL}/save-company`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyId,
          formData: sectionData,
          section: companySection
        }),
      });

      if (response.ok) {
        if (companySection === 3) {
          alert('Company form completed successfully!');
          setCompanyStatus('completed');
          setCurrentView('home');
        } else {
          alert(`Section ${companySection} saved successfully!`);
          setCompanySection(companySection + 1);
        }
      } else {
        throw new Error('Failed to save form data');
      }
    } catch (error) {
      console.error('Error saving company section:', error);
      alert('Error saving form data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Save employee form section to S3
  const saveEmployeeSection = async () => {
    if (!companyId || !currentEmployeeId) {
      alert('Missing company ID or employee ID');
      return;
    }

    try {
      setLoading(true);
      
      const sectionData = {
        section1: employeeFormData.section1,
        section2: employeeFormData.section2,
        section3: employeeFormData.section3,
        currentSection: employeeSection,
        isCompleted: employeeSection === 3,
        lastSaved: new Date().toISOString(),
        companyId
      };

      const response = await fetch(`${API_BASE_URL}/save-employee`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyId,
          employeeId: currentEmployeeId,
          formData: sectionData,
          section: employeeSection
        }),
      });

      if (response.ok) {
        if (employeeSection === 3) {
          alert('Employee form completed successfully!');
          setCurrentView('home');
          loadEmployeeList(); // Refresh employee list
        } else {
          alert(`Section ${employeeSection} saved successfully!`);
          setEmployeeSection(employeeSection + 1);
        }
      } else {
        throw new Error('Failed to save employee data');
      }
    } catch (error) {
      console.error('Error saving employee section:', error);
      alert('Error saving employee data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load existing employee data
  const loadEmployeeData = async (employeeId) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/employee-data/${companyId}/${employeeId}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.found) {
          setEmployeeFormData(data.formData);
          setEmployeeSection(data.formData.currentSection || 1);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Error loading employee data:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Start company form (new or amend)
  const startCompanyForm = (mode) => {
    if (mode === 'amend' && companyStatus === 'completed') {
      // Load existing data for amendment
      setCompanySection(1);
    } else if (mode === 'start') {
      // Reset form for new start
      setCompanyFormData({
        section1: { companyName: '', industry: '', employees: '', revenue: '' },
        section2: { address: '', phone: '', email: '', website: '' },
        section3: { description: '', established: '', goals: '', challenges: '' }
      });
      setCompanySection(1);
    }
    setCurrentView('company-form');
  };

  // Start employee form (new or returning)
  const startEmployeeForm = (mode) => {
    if (mode === 'new') {
      const newId = generateId();
      setCurrentEmployeeId(newId);
      setIsReturningEmployee(false);
      setEmployeeFormData({
        section1: { firstName: '', lastName: '', position: '', department: '' },
        section2: { email: '', phone: '', startDate: '', salary: '' },
        section3: { skills: '', experience: '', notes: '', goals: '' }
      });
      setEmployeeSection(1);
      setCurrentView('employee-form');
    } else if (mode === 'return') {
      setIsReturningEmployee(true);
    }
  };

  // Continue returning employee form
  const continueEmployeeForm = async () => {
    if (!returnEmployeeId) {
      alert('Please enter your Employee ID');
      return;
    }

    const success = await loadEmployeeData(returnEmployeeId);
    if (success) {
      setCurrentEmployeeId(returnEmployeeId);
      setCurrentView('employee-form');
    } else {
      alert('Employee ID not found. Please check your ID or start a new form.');
    }
  };

  // Home View
  const HomeView = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Data & AI Readiness Assessment 2025
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Evaluate your organization's preparedness for the data-driven future
          </p>
        </div>

        {/* Company ID Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 max-w-2xl mx-auto">
          <div className="flex items-center mb-6">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mr-4">
              <span className="text-white text-xl">🏢</span>
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Company Management</h2>
              <p className="text-gray-600">Enter your company ID to begin</p>
            </div>
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value.trim())}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
              placeholder="Enter your company ID (e.g., DMGT-001)"
            />
          </div>

          {companyId && (
            <div className="bg-gray-50 rounded-lg p-6">
              {loading ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Checking status...</p>
                </div>
              ) : (
                <>
                  <CompanyStatusDisplay status={companyStatus} />
                  <div className="flex flex-wrap gap-4 mt-6">
                    {companyStatus === 'completed' && (
                      <button
                        onClick={() => startCompanyForm('amend')}
                        className="flex items-center px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                      >
                        <span className="mr-2">📝</span>
                        Amend Company Form
                      </button>
                    )}
                    {companyStatus !== 'completed' && (
                      <button
                        onClick={() => startCompanyForm('start')}
                        className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <span className="mr-2">▶️</span>
                        {companyStatus === 'in-progress' ? 'Continue Company Form' : 'Start Company Form'}
                      </button>
                    )}
                    <button
                      onClick={() => setCurrentView('employee-list')}
                      className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <span className="mr-2">👥</span>
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

  // Company Status Display Component
  const CompanyStatusDisplay = ({ status }) => {
    const statusConfig = {
      'not-started': { icon: '🆕', text: 'Ready to Start', bgColor: 'bg-gray-100', textColor: 'text-gray-700' },
      'in-progress': { icon: '📝', text: 'Form In Progress', bgColor: 'bg-yellow-100', textColor: 'text-yellow-700' },
      'completed': { icon: '✅', text: 'Form Completed', bgColor: 'bg-green-100', textColor: 'text-green-700' }
    };

    const config = statusConfig[status] || statusConfig['not-started'];

    return (
      <div className={`flex items-center p-4 rounded-lg ${config.bgColor}`}>
        <span className="text-2xl mr-3">{config.icon}</span>
        <div>
          <p className={`font-semibold ${config.textColor}`}>Company Form Status</p>
          <p className={config.textColor}>{config.text}</p>
        </div>
      </div>
    );
  };

  // Employee List View
  const EmployeeListView = () => (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-8">
          <button
            onClick={() => setCurrentView('home')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <span className="mr-2">←</span>
            Back to Home
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Employee Forms</h1>
          <p className="text-gray-600">Company ID: {companyId}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-8">
            <h2 className="text-2xl font-semibold mb-4 lg:mb-0">Employee Management</h2>
            <button
              onClick={() => startEmployeeForm('new')}
              className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <span className="mr-2">➕</span>
              Start New Employee Form
            </button>
          </div>

          {/* Previous Employee Forms */}
          {employeeList.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4">Previous Employee Forms</h3>
              <div className="grid gap-4">
                {employeeList.map(employee => (
                  <div key={employee.id} className="border border-gray-200 rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <p className="font-medium">Employee ID: {employee.id}</p>
                      <p className="text-gray-600">{employee.name || 'Name not provided'}</p>
                      <p className="text-sm text-gray-500">
                        Status: {employee.completed ? 'Completed' : 'In Progress'} 
                        {employee.lastSaved && ` • Last saved: ${new Date(employee.lastSaved).toLocaleDateString()}`}
                      </p>
                    </div>
                    {employee.completed && (
                      <span className="text-green-500 text-2xl">✅</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Return to Form Section */}
          <div className="border-t pt-8">
            <h3 className="text-lg font-semibold mb-4">Continue Previous Form</h3>
            <p className="text-gray-600 mb-4">
              If you have started a form and need to continue, enter your Employee ID below:
            </p>
            <div className="flex gap-4 max-w-md">
              <input
                type="text"
                value={returnEmployeeId}
                onChange={(e) => setReturnEmployeeId(e.target.value.trim())}
                placeholder="Enter your Employee ID"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
              <button
                onClick={continueEmployeeForm}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Company Form View
  const CompanyFormView = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-8">
          <button
            onClick={() => setCurrentView('home')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <span className="mr-2">←</span>
            Back to Home
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Company Information Form</h1>
          <p className="text-gray-600">Company ID: {companyId}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-4xl mx-auto">
          {/* Progress Indicator */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Section {companySection} of 3</h2>
              <div className="flex space-x-2">
                {[1, 2, 3].map(step => (
                  <div
                    key={step}
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                      step <= companySection 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${(companySection / 3) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Form Sections */}
          {companySection === 1 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Basic Company Information</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Company Name *</label>
                  <input
                    type="text"
                    value={companyFormData.section1.companyName}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section1: { ...companyFormData.section1, companyName: e.target.value }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Industry *</label>
                  <input
                    type="text"
                    value={companyFormData.section1.industry}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section1: { ...companyFormData.section1, industry: e.target.value }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Technology, Healthcare"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Number of Employees *</label>
                  <select
                    value={companyFormData.section1.employees}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section1: { ...companyFormData.section1, employees: e.target.value }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Annual Revenue</label>
                  <select
                    value={companyFormData.section1.revenue}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section1: { ...companyFormData.section1, revenue: e.target.value }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Contact Information</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Company Address *</label>
                  <textarea
                    value={companyFormData.section2.address}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section2: { ...companyFormData.section2, address: e.target.value }
                    })}
                    rows="3"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter full company address"
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                    <input
                      type="tel"
                      value={companyFormData.section2.phone}
                      onChange={(e) => setCompanyFormData({
                        ...companyFormData,
                        section2: { ...companyFormData.section2, phone: e.target.value }
                      })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="+44 20 1234 5678"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                    <input
                      type="email"
                      value={companyFormData.section2.email}
                      onChange={(e) => setCompanyFormData({
                        ...companyFormData,
                        section2: { ...companyFormData.section2, email: e.target.value }
                      })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="contact@company.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Website</label>
                  <input
                    type="url"
                    value={companyFormData.section2.website}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section2: { ...companyFormData.section2, website: e.target.value }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="https://www.company.com"
                  />
                </div>
              </div>
            </div>
          )}

          {companySection === 3 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Additional Details</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Company Description *</label>
                  <textarea
                    value={companyFormData.section3.description}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section3: { ...companyFormData.section3, description: e.target.value }
                    })}
                    rows="4"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Describe your company's main business activities..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Year Established</label>
                  <input
                    type="number"
                    value={companyFormData.section3.established}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section3: { ...companyFormData.section3, established: e.target.value }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 2020"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Data & AI Goals</label>
                  <textarea
                    value={companyFormData.section3.goals}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section3: { ...companyFormData.section3, goals: e.target.value }
                    })}
                    rows="3"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="What are your data and AI objectives?"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Current Challenges</label>
                  <textarea
                    value={companyFormData.section3.challenges}
                    onChange={(e) => setCompanyFormData({
                      ...companyFormData,
                      section3: { ...companyFormData.section3, challenges: e.target.value }
                    })}
                    rows="3"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="What challenges do you face with data and AI?"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={saveCompanySection}
              disabled={loading}
              className="w-full flex items-center justify-center px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg font-medium"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <span className="mr-2">💾</span>
                  {companySection === 3 ? 'Complete & Save Form' : 'Save Progress & Continue'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Employee Form View
  const EmployeeFormView = () => (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-8">
          <button
            onClick={() => setCurrentView('employee-list')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <span className="mr-2">←</span>
            Back to Employee List
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Employee Information Form</h1>
          
          {/* Employee ID Display */}
          <div className="bg-blue-100 border border-blue-200 rounded-lg p-4 mt-4 max-w-md">
            <p className="text-blue-800 font-medium">Your Employee ID: {currentEmployeeId}</p>
            <p className="text-blue-600 text-sm">Please save this ID to continue your form later if needed.</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-4xl mx-auto">
          {/* Progress Indicator */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Section {employeeSection} of 3</h2>
              <div className="flex space-x-2">
                {[1, 2, 3].map(step => (
                  <div
                    key={step}
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                      step <= employeeSection 
                        ? 'bg-green-600 text-white' 
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-green-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${(employeeSection / 3) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Form Sections */}
          {employeeSection === 1 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Personal Information</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">First Name *</label>
                  <input
                    type="text"
                    value={employeeFormData.section1.firstName}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section1: { ...employeeFormData.section1, firstName: e.target.value }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="Enter first name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Last Name *</label>
                  <input
                    type="text"
                    value={employeeFormData.section1.lastName}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section1: { ...employeeFormData.section1, lastName: e.target.value }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="Enter last name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Job Title *</label>
                  <input
                    type="text"
                    value={employeeFormData.section1.position}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section1: { ...employeeFormData.section1, position: e.target.value }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="e.g., Software Engineer"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Department *</label>
                  <input
                    type="text"
                    value={employeeFormData.section1.department}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section1: { ...employeeFormData.section1, department: e.target.value }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="e.g., Engineering"
                  />
                </div>
              </div>
            </div>
          )}

          {employeeSection === 2 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Contact & Employment Details</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                  <input
                    type="email"
                    value={employeeFormData.section2.email}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section2: { ...employeeFormData.section2, email: e.target.value }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="email@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={employeeFormData.section2.phone}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section2: { ...employeeFormData.section2, phone: e.target.value }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="+44 7xxx xxx xxx"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={employeeFormData.section2.startDate}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section2: { ...employeeFormData.section2, startDate: e.target.value }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Salary Range (Optional)</label>
                  <select
                    value={employeeFormData.section2.salary}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section2: { ...employeeFormData.section2, salary: e.target.value }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Skills & Experience</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Key Skills *</label>
                  <textarea
                    value={employeeFormData.section3.skills}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section3: { ...employeeFormData.section3, skills: e.target.value }
                    })}
                    rows="3"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="List your key skills and technologies..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Experience with Data/AI</label>
                  <textarea
                    value={employeeFormData.section3.experience}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section3: { ...employeeFormData.section3, experience: e.target.value }
                    })}
                    rows="3"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="Describe your experience with data analysis, AI, or machine learning..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Professional Goals</label>
                  <textarea
                    value={employeeFormData.section3.goals}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section3: { ...employeeFormData.section3, goals: e.target.value }
                    })}
                    rows="3"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="What are your career goals related to data and AI?"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label>
                  <textarea
                    value={employeeFormData.section3.notes}
                    onChange={(e) => setEmployeeFormData({
                      ...employeeFormData,
                      section3: { ...employeeFormData.section3, notes: e.target.value }
                    })}
                    rows="3"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="Any additional information you'd like to share..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={saveEmployeeSection}
              disabled={loading}
              className="w-full flex items-center justify-center px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg font-medium"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <span className="mr-2">💾</span>
                  {employeeSection === 3 ? 'Complete & Save Form' : 'Save Progress & Continue'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Render current view
  return (
    <div className="font-sans">
      {currentView === 'home' && <HomeView />}
      {currentView === 'company-form' && <CompanyFormView />}
      {currentView === 'employee-list' && <EmployeeListView />}
      {currentView === 'employee-form' && <EmployeeFormView />}
    </div>
  );
}

export default App;