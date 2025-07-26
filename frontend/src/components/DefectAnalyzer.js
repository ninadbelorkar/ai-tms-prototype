// File: frontend/src/components/DefectAnalyzer.js

import React, { useState } from 'react';
import { FaExclamationTriangle, FaInfoCircle, FaCopy } from 'react-icons/fa';
import { copyToClipboard } from '../utils/clipboardUtils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

// This is the component for the 'Defect Analyzer' feature.
function DefectAnalyzer() {
    // --- State Management for the Form ---
    const [failedTest, setFailedTest] = useState('');
    const [errorLogs, setErrorLogs] = useState('');
    const [copyStatus, setCopyStatus] = useState('');
    const [stepsReproduced, setStepsReproduced] = useState('');
    const [analysisResult, setAnalysisResult] = useState(null); // Will store the AI's response object
    const [isRawText, setIsRawText] = useState(false); // For fallback if AI gives non-JSON
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // --- Form Submission Handler (Corresponds to "User Submits Defect" in diagram) ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        // Basic validation as per diagram's "Has Error Logs?" check
        if (!failedTest.trim()) {
            setError("The 'Failed Test Case' field is required.");
            return;
        }
        setIsLoading(true);
        setError('');
        setAnalysisResult(null);
        setIsRawText(false);

        try {
            // "Data Sent to API" step
            const response = await fetch(`${BACKEND_URL}/api/analyze-defect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    failed_test: failedTest,
                    error_logs: errorLogs,
                    steps_reproduced: stepsReproduced
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || `HTTP error! Status: ${response.status}`);
            }

            // Check if the backend had to fallback to raw text
            if (data.warning && typeof data.analysis === 'string') {
                setAnalysisResult(data.analysis);
                setIsRawText(true);
                setError(data.warning);
            } else if (typeof data.analysis === 'object' && data.analysis !== null) {
                setAnalysisResult(data.analysis);
                setIsRawText(false);
            } else {
                setAnalysisResult("No analysis generated or unexpected format.");
                setIsRawText(true);
            }

        } catch (err) {
            console.error("Failed to fetch defect analysis:", err);
            setError(err.message || 'An unknown error occurred while analyzing the defect.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopyOutput = () => {
    let textToCopy = "";
    if (isRawText || typeof analysisResult === 'string') {
        textToCopy = analysisResult;
    } else if (typeof analysisResult === 'object' && analysisResult !== null) {
        // Format the structured object into a readable string for copying
        textToCopy = `AI Defect Analysis Report:\n\n`;
        textToCopy += `Potential Root Cause:\n${analysisResult.potential_root_cause || 'N/A'}\n\n`;
        textToCopy += `Suggested Severity: ${analysisResult.suggested_severity_level || 'N/A'}\n`;
        if (analysisResult.severity_justification) {
            textToCopy += `Justification: ${analysisResult.severity_justification}\n\n`;
        }
        textToCopy += `Defect Summary Draft:\n${analysisResult.defect_summary_draft || 'N/A'}\n`;
    }

    if (textToCopy) {
        copyToClipboard(
            textToCopy,
            () => { setCopyStatus("Copied!"); setTimeout(() => setCopyStatus(''), 2000); },
            (err) => { setCopyStatus(`Error: ${err}`); setTimeout(() => setCopyStatus(''), 3000); }
        );
    } else {
        setCopyStatus("Nothing to copy.");
        setTimeout(() => setCopyStatus(''), 2000);
    }
};

    // --- Helper functions for styling the output card ---
    const getSeverityClass = (severity) => {
        if (!severity) return '';
        const level = severity.toLowerCase();
        if (level === 'critical') return 'severity-critical';
        if (level === 'high') return 'severity-high';
        if (level === 'medium') return 'severity-medium';
        if (level === 'low') return 'severity-low';
        return '';
    };
    
    const getSeverityIcon = (severity) => {
        if (!severity) return null;
        const level = severity.toLowerCase();
        if (level === 'critical' || level === 'high') return <FaExclamationTriangle className="icon" />;
        if (level === 'medium') return <FaInfoCircle className="icon" />;
        return null;
    };


    return (
        <div className="component-section">
            <h2>2. Intelligent Defect Analyzer</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="failedTest">Failed Test Case / Scenario:</label>
                    <input
                        type="text"
                        id="failedTest"
                        value={failedTest}
                        onChange={(e) => setFailedTest(e.target.value)}
                        placeholder="e.g., TC-LOGIN-02: Login with invalid password"
                        required
                        disabled={isLoading}
                    />
                </div>
                 <div className="form-group">
                     <label htmlFor="errorLogs">Error Logs (if available):</label>
                     <textarea
                        id="errorLogs"
                        value={errorLogs}
                        onChange={(e) => setErrorLogs(e.target.value)}
                        placeholder="Paste stack trace or error messages here..."
                        rows={8}
                        disabled={isLoading}
                    />
                 </div>
                 <div className="form-group">
                     <label htmlFor="stepsReproduced">Steps to Reproduce (Optional):</label>
                     <textarea
                        id="stepsReproduced"
                        value={stepsReproduced}
                        onChange={(e) => setStepsReproduced(e.target.value)}
                        placeholder="Describe the steps that led to the error..."
                        rows={4}
                        disabled={isLoading}
                    />
                </div>
                <button type="submit" disabled={isLoading}>
                    {isLoading ? 'Analyzing...' : 'Analyze Defect'}
                </button>
            </form>

            {isLoading && <p className="loading-indicator">AI is investigating the issue...</p>}
            {error && <p className="error">{error}</p>}

            {/* This section corresponds to "Display Analysis Card" in the diagram */}
            {analysisResult && !isLoading && (
                <div className="ai-output-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h3>AI Defect Analysis Report</h3>
                        <button onClick={handleCopyOutput} className="results-action-button" title="Copy Analysis">
                            <FaCopy /> {copyStatus || 'Copy'}
                        </button>
                    </div>
                    {isRawText ? (
                        <pre>{analysisResult}</pre>
                    ) : (
                        <>
                            <div className="info-section">
                                <strong>POTENTIAL ROOT CAUSE:</strong>
                                <p>{analysisResult.potential_root_cause || 'Not provided by AI.'}</p>
                            </div>
                            <div className="info-section">
                                <strong>SUGGESTED SEVERITY:</strong>
                                <p className={getSeverityClass(analysisResult.suggested_severity_level)}>
                                    {getSeverityIcon(analysisResult.suggested_severity_level)}
                                    {analysisResult.suggested_severity_level || 'Not provided by AI.'}
                                </p>
                                {analysisResult.severity_justification && 
                                    <p style={{fontSize: '0.9em', marginLeft: '20px'}}><em>Justification: {analysisResult.severity_justification}</em></p>
                                }
                            </div>
                            <div className="info-section">
                                <strong>DEFECT SUMMARY DRAFT:</strong>
                                <p>{analysisResult.defect_summary_draft || 'Not provided by AI.'}</p>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default DefectAnalyzer;