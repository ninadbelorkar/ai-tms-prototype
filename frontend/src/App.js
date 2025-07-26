// File: frontend/src/App.js (Additions)
import React from 'react';
import './App.css';
import TestCaseSuggester from './components/TestCaseSuggester';
import DefectAnalyzer from './components/DefectAnalyzer';
import AutomationRecommender from './components/AutomationRecommender';
import CodeChangeAnalyzer from './components/CodeChangeAnalyzer';
import Dashboard from './components/Dashboard';
// import FigmaInputter from './components/FigmaInputter'; 

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>AI-Integrated Test Case Management System (Prototype)</h1>
      </header>
      <main>
        <Dashboard />
        <hr />
        <TestCaseSuggester />
        <hr /> {/* Add separator */}
        <DefectAnalyzer />
        <hr />
        <AutomationRecommender />
        <hr />
        <CodeChangeAnalyzer />
      </main>
    </div>
  );
}

export default App;