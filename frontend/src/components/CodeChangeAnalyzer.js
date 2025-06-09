import React, { useState } from 'react';
import { FaExclamationTriangle, FaInfoCircle, FaCopy } from 'react-icons/fa'; // Adjusted icons
import { copyToClipboard } from '../utils/clipboardUtils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

function CodeChangeAnalyzer() {
    const [codeChange, setCodeChange] = useState('');
    const [testCase, setTestCase] = useState('');
    const [impactAnalysisResult, setImpactAnalysisResult] = useState(null);
    const [isRawText, setIsRawText] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [copyStatus, setCopyStatus] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!codeChange.trim() || !testCase.trim()) {
            setError("Code Change Description and Test Case Description cannot be empty.");
            return;
        }
        setIsLoading(true);
        setError('');
        setImpactAnalysisResult(null);
        setIsRawText(false);
        setCopyStatus('');

        try {
            const response = await fetch(`${BACKEND_URL}/api/analyze-code-change-impact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code_change_description: codeChange,
                    test_case_description: testCase
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP error! Status: ${response.status}`);

            if (data.warning && typeof data.impact_analysis === 'string') {
                setImpactAnalysisResult(data.impact_analysis);
                setIsRawText(true);
                setError(data.warning);
            } else if (typeof data.impact_analysis === 'object' && data.impact_analysis !== null) {
                setImpactAnalysisResult(data.impact_analysis);
                setIsRawText(false);
            } else {
                setImpactAnalysisResult("No analysis generated or unexpected format.");
                setIsRawText(true);
            }
        } catch (err) {
            console.error("Failed to fetch impact analysis:", err);
            setError(err.message || 'An unknown error occurred.');
            setImpactAnalysisResult(null);
            setIsRawText(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = () => {
        let textToCopy = "";
        if (isRawText || typeof impactAnalysisResult === 'string') {
            textToCopy = impactAnalysisResult;
        } else if (impactAnalysisResult && typeof impactAnalysisResult === 'object') {
            textToCopy = `AI Code Change Impact Analysis:\n\n` +
                         `IMPACT LIKELIHOOD: ${impactAnalysisResult.impact_likelihood || 'N/A'}\n\n` +
                         `REASONING:\n${impactAnalysisResult.reasoning || 'N/A'}`;
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

    const getLikelihoodClass = (likelihood) => {
        if (!likelihood) return '';
        const level = likelihood.toLowerCase();
        if (level === 'high') return 'likelihood-high';
        if (level === 'medium') return 'likelihood-medium';
        if (level === 'low') return 'likelihood-low';
        if (level === 'none') return 'likelihood-none';
        return '';
    };

    const getLikelihoodIcon = (likelihood) => {
        if (!likelihood) return null;
        const level = likelihood.toLowerCase();
        if (level === 'high') return <FaExclamationTriangle className="icon" />;
        if (level === 'medium') return <FaInfoCircle className="icon" />;
        return null; // Or other icons for low/none
    };

    return (
        <div className="component-section">
            <h2>4. Test Case Adaptation (Simplified Impact Analysis)</h2>
            <p><i>Note: This is a simplified text-based analysis. Real implementation would need Git integration.</i></p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="codeChange">Code Change Description:</label>
                    <textarea id="codeChange" value={codeChange} onChange={(e) => setCodeChange(e.target.value)} placeholder="Describe the code change..." required rows={4} disabled={isLoading}/>
                </div>
                <div className="form-group">
                    <label htmlFor="testCaseDescAdapt">Test Case Description:</label>
                    <textarea id="testCaseDescAdapt" value={testCase} onChange={(e) => setTestCase(e.target.value)} placeholder="Enter the description of the test case..." required rows={4} disabled={isLoading}/>
                </div>
                <button type="submit" disabled={isLoading || !codeChange.trim() || !testCase.trim()}>
                    {isLoading ? 'Analyzing Impact...' : 'Analyze Impact'}
                </button>
            </form>

            {isLoading && <p className="loading-indicator">AI is checking for conflicts...</p>}
            {error && <p className="error">{error}</p>}

            {impactAnalysisResult && !isLoading && (
                <div className="ai-output-card">
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>AI Code Change Impact Analysis</h3>
                        <button onClick={handleCopy} className="copy-button" title="Copy Analysis">
                            <FaCopy /> {copyStatus || 'Copy'}
                        </button>
                    </div>
                    {isRawText ? (
                        <pre>{impactAnalysisResult}</pre>
                    ) : (
                        <>
                            <div className="info-section">
                                <strong>IMPACT LIKELIHOOD:</strong>
                                <p className={getLikelihoodClass(impactAnalysisResult.impact_likelihood)} style={{ fontSize: '1.1em' }}>
                                    {getLikelihoodIcon(impactAnalysisResult.impact_likelihood)}
                                    {impactAnalysisResult.impact_likelihood || 'Not provided'}
                                </p>
                            </div>
                            <div className="info-section">
                                <strong>REASONING:</strong>
                                <p>{impactAnalysisResult.reasoning || 'Not provided'}</p>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default CodeChangeAnalyzer;