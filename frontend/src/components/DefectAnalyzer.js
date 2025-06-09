import React, { useState } from 'react';
import { FaExclamationTriangle, FaInfoCircle, FaCopy } from 'react-icons/fa';
import { copyToClipboard } from '../utils/clipboardUtils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

function DefectAnalyzer() {
    const [failedTest, setFailedTest] = useState('');
    const [errorLogs, setErrorLogs] = useState('');
    const [stepsReproduced, setStepsReproduced] = useState('');
    const [analysisResult, setAnalysisResult] = useState(null);
    const [isRawText, setIsRawText] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [copyStatus, setCopyStatus] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!failedTest.trim() || !errorLogs.trim()) {
            setError("Failed Test Case and Error Logs cannot be empty.");
            return;
        }
        setIsLoading(true);
        setError('');
        setAnalysisResult(null);
        setIsRawText(false);
        setCopyStatus('');

        try {
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
            console.error("Failed to fetch analysis:", err);
            setError(err.message || 'An unknown error occurred.');
            setAnalysisResult(null);
            setIsRawText(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = () => {
        let textToCopy = "";
        if (isRawText || typeof analysisResult === 'string') {
            textToCopy = analysisResult;
        } else if (analysisResult && typeof analysisResult === 'object') {
            textToCopy = `AI Defect Analysis:\n\n` +
                         `POTENTIAL ROOT CAUSE:\n${analysisResult.potential_root_cause || 'N/A'}\n\n` +
                         `SUGGESTED SEVERITY:\nLevel: ${analysisResult.suggested_severity_level || 'N/A'}\n` +
                         `Justification: ${analysisResult.severity_justification || 'N/A'}\n\n` +
                         `DEFECT SUMMARY DRAFT:\n${analysisResult.defect_summary_draft || 'N/A'}`;
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
                    <label htmlFor="failedTest">Failed Test Case Name/ID:</label>
                    <input type="text" id="failedTest" value={failedTest} onChange={(e) => setFailedTest(e.target.value)} placeholder="e.g., TC-001: User Login Test" required disabled={isLoading}/>
                </div>
                 <div className="form-group">
                     <label htmlFor="errorLogs">Relevant Error Logs:</label>
                     <textarea id="errorLogs" value={errorLogs} onChange={(e) => setErrorLogs(e.target.value)} placeholder="Paste stack trace or error messages here..." required rows={6} disabled={isLoading}/>
                 </div>
                 <div className="form-group">
                     <label htmlFor="stepsReproduced">Steps to Reproduce (Optional):</label>
                     <textarea id="stepsReproduced" value={stepsReproduced} onChange={(e) => setStepsReproduced(e.target.value)} placeholder="Describe steps that lead to the error, if known..." rows={4} disabled={isLoading}/>
                </div>
                <button type="submit" disabled={isLoading || !failedTest.trim() || !errorLogs.trim()}>
                    {isLoading ? 'Analyzing...' : 'Analyze Defect'}
                </button>
            </form>

            {isLoading && <p className="loading-indicator">AI is investigating...</p>}
            {error && <p className="error">{error}</p>}

            {analysisResult && !isLoading && (
                <div className="ai-output-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>AI Defect Analysis</h3>
                        <button onClick={handleCopy} className="copy-button" title="Copy Analysis">
                            <FaCopy /> {copyStatus || 'Copy'}
                        </button>
                    </div>
                    {isRawText ? (
                        <pre>{analysisResult}</pre>
                    ) : (
                        <>
                            <div className="info-section">
                                <strong>POTENTIAL ROOT CAUSE:</strong>
                                <p>{analysisResult.potential_root_cause || 'Not provided'}</p>
                            </div>
                            <div className="info-section">
                                <strong>SUGGESTED SEVERITY:</strong>
                                <p className={getSeverityClass(analysisResult.suggested_severity_level)}>
                                    {getSeverityIcon(analysisResult.suggested_severity_level)}
                                    {analysisResult.suggested_severity_level || 'Not provided'}
                                </p>
                                {analysisResult.severity_justification && 
                                    <p style={{fontSize: '0.9em', marginLeft: '20px'}}><em>Justification: {analysisResult.severity_justification}</em></p>
                                }
                            </div>
                            <div className="info-section">
                                <strong>DEFECT SUMMARY DRAFT:</strong>
                                <p>{analysisResult.defect_summary_draft || 'Not provided'}</p>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default DefectAnalyzer;