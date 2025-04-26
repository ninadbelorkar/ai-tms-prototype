import React, { useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

function CodeChangeAnalyzer() {
    const [codeChange, setCodeChange] = useState('');
    const [testCase, setTestCase] = useState('');
    const [impactAnalysis, setImpactAnalysis] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!codeChange.trim() || !testCase.trim()) {
            setError("Code Change Description and Test Case Description cannot be empty.");
            return;
        }
        setIsLoading(true);
        setError('');
        setImpactAnalysis('');

        try {
            const response = await fetch(`${BACKEND_URL}/api/analyze-code-change-impact`, { // Matches backend endpoint
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code_change_description: codeChange,
                    test_case_description: testCase
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP error! Status: ${response.status}`);
            }

            setImpactAnalysis(data.impact_analysis || "No analysis generated.");

        } catch (err) {
            console.error("Failed to fetch impact analysis:", err);
            setError(err.message || 'An unknown error occurred while analyzing impact.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="component-section">
            <h2>4. Test Case Adaptation (Simplified Impact Analysis)</h2>
            <p><i>Note: This is a simplified text-based analysis. Real implementation would need Git integration.</i></p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="codeChange">Code Change Description:</label>
                    <textarea
                        id="codeChange"
                        value={codeChange}
                        onChange={(e) => setCodeChange(e.target.value)}
                        placeholder="Describe the code change, e.g., 'Refactored login logic to use new auth provider'"
                        required
                        rows={4}
                        disabled={isLoading}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="testCaseDesc">Test Case Description:</label>
                    <textarea
                        id="testCaseDesc"
                        value={testCase}
                        onChange={(e) => setTestCase(e.target.value)}
                        placeholder="Enter the description of the test case to check, e.g., 'Verify successful login with valid credentials'"
                        required
                        rows={4}
                        disabled={isLoading}
                    />
                </div>
                <button type="submit" disabled={isLoading || !codeChange.trim() || !testCase.trim()}>
                    {isLoading ? 'Analyzing Impact...' : 'Analyze Impact'}
                </button>
            </form>

            {isLoading && <p className="loading-indicator">AI is checking for conflicts...</p>}
            {error && <p className="error">{error}</p>}

            {impactAnalysis && !isLoading && (
                <div className="results">
                    <h3>AI Impact Analysis:</h3>
                    <pre>{impactAnalysis}</pre>
                </div>
            )}
        </div>
    );
}

export default CodeChangeAnalyzer;