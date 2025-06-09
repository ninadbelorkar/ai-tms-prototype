import React, { useState } from 'react';
import { FaCheckCircle, FaTimesCircle, FaQuestionCircle, FaCopy } from 'react-icons/fa';
import { copyToClipboard } from '../utils/clipboardUtils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

function AutomationRecommender() {
    const [description, setDescription] = useState('');
    const [frequency, setFrequency] = useState('Weekly');
    const [stability, setStability] = useState('Medium');
    const [manualTime, setManualTime] = useState('');

    const [recommendationResult, setRecommendationResult] = useState(null);
    const [isRawText, setIsRawText] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [copyStatus, setCopyStatus] = useState('');

    const isFormValid = () => description.trim() && frequency && stability && manualTime && parseInt(manualTime, 10) > 0;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isFormValid()) {
            setError("Please fill in all fields correctly (Manual Time must be > 0).");
            return;
        }
        setIsLoading(true);
        setError('');
        setRecommendationResult(null);
        setIsRawText(false);
        setCopyStatus('');

        try {
            const response = await fetch(`${BACKEND_URL}/api/recommend-automation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    test_case_description: description,
                    execution_frequency: frequency,
                    stability: stability,
                    manual_time_mins: parseInt(manualTime, 10)
                 }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP error! Status: ${response.status}`);

            if (data.warning && typeof data.recommendation === 'string') {
                setRecommendationResult(data.recommendation);
                setIsRawText(true);
                setError(data.warning);
            } else if (typeof data.recommendation === 'object' && data.recommendation !== null) {
                setRecommendationResult(data.recommendation);
                setIsRawText(false);
            } else {
                setRecommendationResult("No recommendation generated or unexpected format.");
                setIsRawText(true);
            }
        } catch (err) {
            console.error("Failed to fetch recommendation:", err);
            setError(err.message || 'An unknown error occurred.');
            setRecommendationResult(null);
            setIsRawText(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = () => {
        let textToCopy = "";
        if (isRawText || typeof recommendationResult === 'string') {
            textToCopy = recommendationResult;
        } else if (recommendationResult && typeof recommendationResult === 'object') {
            textToCopy = `AI Automation Recommendation:\n\n` +
                         `RECOMMENDATION: ${recommendationResult.recommendation || 'N/A'}\n\n` +
                         `JUSTIFICATION:\n${recommendationResult.justification || 'N/A'}`;
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

    const getRecommendationClass = (rec) => {
        if (!rec) return '';
        const recommendation = rec.toLowerCase();
        if (recommendation === 'yes') return 'recommendation-yes';
        if (recommendation === 'no') return 'recommendation-no';
        if (recommendation === 'maybe') return 'recommendation-maybe';
        return '';
    };

    const getRecommendationIcon = (rec) => {
        if (!rec) return null;
        const recommendation = rec.toLowerCase();
        if (recommendation === 'yes') return <FaCheckCircle className="icon" />;
        if (recommendation === 'no') return <FaTimesCircle className="icon" />;
        if (recommendation === 'maybe') return <FaQuestionCircle className="icon" />;
        return null;
    };

    return (
        <div className="component-section">
            <h2>3. Automation Recommendation</h2>
            <form onSubmit={handleSubmit}>
                 <div className="form-group">
                    <label htmlFor="tcDescriptionRec">Test Case Description:</label>
                    <textarea id="tcDescriptionRec" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the manual test case..." required rows={4} disabled={isLoading}/>
                 </div>
                 <div className="form-group">
                    <label htmlFor="frequencyRec">Execution Frequency:</label>
                    <select id="frequencyRec" value={frequency} onChange={(e) => setFrequency(e.target.value)} disabled={isLoading}>
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Bi-Weekly">Bi-Weekly</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Per Release">Per Release</option>
                        <option value="Rarely">Rarely</option>
                    </select>
                </div>
                 <div className="form-group">
                    <label htmlFor="stabilityRec">Feature Stability:</label>
                     <select id="stabilityRec" value={stability} onChange={(e) => setStability(e.target.value)} disabled={isLoading}>
                        <option value="High">High (Very Stable)</option>
                        <option value="Medium">Medium (Occasional Changes)</option>
                        <option value="Low">Low (Frequent Changes)</option>
                    </select>
                </div>
                 <div className="form-group">
                    <label htmlFor="manualTimeRec">Estimated Manual Time (minutes):</label>
                    <input id="manualTimeRec" type="number" value={manualTime} onChange={(e) => setManualTime(e.target.value)} placeholder="e.g., 15" required min="1" disabled={isLoading}/>
                 </div>
                <button type="submit" disabled={isLoading || !isFormValid()}>
                    {isLoading ? 'Analyzing...' : 'Get Recommendation'}
                </button>
            </form>

            {isLoading && <p className="loading-indicator">AI is evaluating...</p>}
            {error && <p className="error">{error}</p>}

            {recommendationResult && !isLoading && (
                <div className="ai-output-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>AI Automation Recommendation</h3>
                        <button onClick={handleCopy} className="copy-button" title="Copy Recommendation">
                            <FaCopy /> {copyStatus || 'Copy'}
                        </button>
                    </div>
                    {isRawText ? (
                        <pre>{recommendationResult}</pre>
                    ) : (
                        <>
                            <div className="info-section">
                                <strong>RECOMMENDATION:</strong>
                                <p className={getRecommendationClass(recommendationResult.recommendation)} style={{ fontSize: '1.1em' }}>
                                    {getRecommendationIcon(recommendationResult.recommendation)}
                                    {recommendationResult.recommendation || 'Not provided'}
                                </p>
                            </div>
                            <div className="info-section">
                                <strong>JUSTIFICATION:</strong>
                                <p>{recommendationResult.justification || 'Not provided'}</p>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default AutomationRecommender;