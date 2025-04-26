import React from 'react';
import './App.css'; // Import main styles
import TestCaseSuggester from './components/TestCaseSuggester';
import DefectAnalyzer from './components/DefectAnalyzer';
import AutomationRecommender from './components/AutomationRecommender';
import CodeChangeAnalyzer from './components/CodeChangeAnalyzer'; // Import the new component

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>AI-Integrated Test Case Management System (Prototype)</h1>
      </header>
      <main>
        {/* Each component is wrapped in a div for consistent spacing/styling */}
        <TestCaseSuggester />

        <DefectAnalyzer />

        <AutomationRecommender />

        <CodeChangeAnalyzer />
      </main>
    </div>
  );
}

export default App;