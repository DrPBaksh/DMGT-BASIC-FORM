import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Add professional metadata to document
document.title = 'DMGT Data & AI Readiness Assessment 2025';
document.querySelector('meta[name="description"]')?.setAttribute('content', 
  'Enterprise-grade Data & AI Readiness Assessment Platform for FTSE-100 organizations. Comprehensive evaluation of data maturity and AI capabilities.'
);

// Add professional favicon if not exists
if (!document.querySelector('link[rel="icon"]')) {
  const favicon = document.createElement('link');
  favicon.rel = 'icon';
  favicon.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:%232563eb;stop-opacity:1" /><stop offset="100%" style="stop-color:%231d4ed8;stop-opacity:1" /></linearGradient></defs><rect width="100" height="100" fill="url(%23grad1)" rx="20"/><text x="50" y="50" text-anchor="middle" dy="0.35em" font-family="Inter, sans-serif" font-size="32" font-weight="800" fill="white">D</text></svg>';
  document.head.appendChild(favicon);
}

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);