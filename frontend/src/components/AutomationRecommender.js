import React, { useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

function AutomationRecommender() {
    const [description, setDescription] = useState('');
    const [frequency, setFrequency] = useState('Weekly'); // Default value
    const [stability, setStability] = useState('Medium'); // Default value
    const [manualTime, setManualTime] = useState('');
    const [recommendation, setRecommendation] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const isFormValid = () => {
        return description.trim() && frequency && stability && manualTime && parseInt(manualTime, 10) > 0;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isFormValid()) {
            setError("Please fill in all fields correctly (Manual Time must be > 0).");
            return;
        }
        setIsLoading(true);
        setError('');
        setRecommendation('');

        try {
            const response = await fetch(`${BACKEND_URL}/api/recommend-automation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    test_case_description: description,
                    execution_frequency: frequency,
                    stability: stability,
                    manual_time_mins: parseInt(manualTime, 10) // Ensure it's a number
                 }),
            });

            const data = await response.json();

            if (!response.ok) {
                 throw new Error(data.error || `HTTP error! Status: ${response.status}`);
            }

            setRecommendation(data.recommendation || "No recommendation generated.");

        } catch (err) {
            console.error("Failed to fetch recommendation:", err);
            setError(err.message || 'An unknown error occurred while getting recommendation.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="component-section">
            <h2>3. Automation Recommendation</h2>
            <form onSubmit={handleSubmit}>
                 <div className="form-group">
                    <label htmlFor="tcDescription">Test Case Description:</label>
                    <textarea
                        id="tcDescription"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Describe the manual test case..."
                        required
                        rows={4}
                        disabled={isLoading}
                    />
                 </div>
                 <div className="form-group">
                    <label htmlFor="frequency">Execution Frequency:</label>
                    <select id="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)} disabled={isLoading}>
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Bi-Weekly">Bi-Weekly</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Per Release">Per Release</option>
                        <option value="Rarely">Rarely</option>
                    </select>
                </div>
                 <div className="form-group">
                    <label htmlFor="stability">Feature Stability:</label>
                     <select id="stability" value={stability} onChange={(e) => setStability(e.target.value)} disabled={isLoading}>
                        <option value="High">High (Very Stable)</option>
                        <option value="Medium">Medium (Occasional Changes)</option>
                        <option value="Low">Low (Frequent Changes)</option>
                    </select>
                </div>
                 <div className="form-group">
                    <label htmlFor="manualTime">Estimated Manual Time (minutes):</label>
                    <input
                        id="manualTime"
                        type="number"
                        value={manualTime}
                        onChange={(e) => setManualTime(e.target.value)}
                        placeholder="e.g., 15"
                        required
                        min="1"
                        disabled={isLoading}
                    />
                 </div>

                <button type="submit" disabled={isLoading || !isFormValid()}>
                    {isLoading ? 'Analyzing...' : 'Get Recommendation'}
                </button>
            </form>

            {isLoading && <p className="loading-indicator">AI is evaluating...</p>}
            {error && <p className="error">{error}</p>}

            {recommendation && !isLoading && (
                <div className="results">
                    <h3>AI Recommendation:</h3>
                    <pre>{recommendation}</pre>
                </div>
            )}
        </div>
    );
}

export default AutomationRecommender;