import React, { useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

function DefectAnalyzer() {
    const [failedTest, setFailedTest] = useState('');
    const [errorLogs, setErrorLogs] = useState('');
    const [stepsReproduced, setStepsReproduced] = useState('');
    const [analysis, setAnalysis] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!failedTest.trim() || !errorLogs.trim()) {
            setError("Failed Test Case and Error Logs cannot be empty.");
            return;
        }
        setIsLoading(true);
        setError('');
        setAnalysis('');

        try {
            const response = await fetch(`${BACKEND_URL}/api/analyze-defect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    failed_test: failedTest,
                    error_logs: errorLogs,
                    steps_reproduced: stepsReproduced // Backend handles if empty
                 }),
            });

            const data = await response.json();

            if (!response.ok) {
                 throw new Error(data.error || `HTTP error! Status: ${response.status}`);
            }

            setAnalysis(data.analysis || "No analysis generated.");

        } catch (err) {
            console.error("Failed to fetch analysis:", err);
            setError(err.message || 'An unknown error occurred while analyzing defect.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="component-section">
            <h2>2. Intelligent Defect Analyzer</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="failedTest">Failed Test Case Name/ID:</label>
                    <input
                        type="text"
                        id="failedTest"
                        value={failedTest}
                        onChange={(e) => setFailedTest(e.target.value)}
                        placeholder="e.g., TC-001: User Login Test"
                        required
                        disabled={isLoading}
                    />
                </div>
                 <div className="form-group">
                     <label htmlFor="errorLogs">Relevant Error Logs:</label>
                     <textarea
                        id="errorLogs"
                        value={errorLogs}
                        onChange={(e) => setErrorLogs(e.target.value)}
                        placeholder="Paste stack trace or error messages here..."
                        required
                        rows={6}
                        disabled={isLoading}
                    />
                 </div>
                 <div className="form-group">
                     <label htmlFor="stepsReproduced">Steps to Reproduce (Optional):</label>
                     <textarea
                        id="stepsReproduced"
                        value={stepsReproduced}
                        onChange={(e) => setStepsReproduced(e.target.value)}
                        placeholder="Describe steps that lead to the error, if known..."
                        rows={4}
                        disabled={isLoading}
                    />
                </div>
                <button type="submit" disabled={isLoading || !failedTest.trim() || !errorLogs.trim()}>
                    {isLoading ? 'Analyzing...' : 'Analyze Defect'}
                </button>
            </form>

            {isLoading && <p className="loading-indicator">AI is investigating...</p>}
            {error && <p className="error">{error}</p>}

            {analysis && !isLoading && (
                <div className="results">
                    <h3>AI Analysis:</h3>
                    <pre>{analysis}</pre>
                </div>
            )}
        </div>
    );
}

export default DefectAnalyzer;