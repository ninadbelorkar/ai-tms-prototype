// File: frontend/src/App.js (Additions)
import React from 'react';
import './App.css';
import TestCaseSuggester from './components/TestCaseSuggester';
import DefectAnalyzer from './components/DefectAnalyzer';
import AutomationRecommender from './components/AutomationRecommender';
import CodeChangeAnalyzer from './components/CodeChangeAnalyzer';
import FigmaInputter from './components/FigmaInputter'; // <-- Import new component

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>AI-Integrated Test Case Management System (Prototype)</h1>
      </header>
      <main>
        <TestCaseSuggester />
        <hr /> {/* Add separator */}
        <FigmaInputter /> {/* <-- Add the new component */}
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