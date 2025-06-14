import React from 'react';

const TabNavigation = ({ tabs, activeTab, onTabChange }) => {
  return (
    <div className="tab-navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-text">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

export default TabNavigation;