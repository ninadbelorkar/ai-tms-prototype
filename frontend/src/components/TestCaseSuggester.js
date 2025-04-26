import React, { useState } from 'react';

// Use the backend URL (ensure backend is running on this port)
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001'; // Allow overriding via env var

function TestCaseSuggester() {
    const [requirements, setRequirements] = useState('');
    const [suggestions, setSuggestions] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault(); // Prevent default form submission
        if (!requirements.trim()) {
            setError("Requirements cannot be empty.");
            return;
        }
        setIsLoading(true);
        setError('');
        setSuggestions('');

        try {
            const response = await fetch(`${BACKEND_URL}/api/suggest-test-cases`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ requirements }),
            });

            const data = await response.json();

            if (!response.ok) {
                // Use error message from backend if available, otherwise use default
                throw new Error(data.error || `HTTP error! Status: ${response.status}`);
            }

            setSuggestions(data.suggestions || "No suggestions generated."); // Handle case where suggestions might be empty

        } catch (err) {
            console.error("Failed to fetch suggestions:", err);
            // Display the caught error message to the user
            setError(err.message || 'An unknown error occurred while fetching suggestions.');
        } finally {
            setIsLoading(false); // Ensure loading state is turned off
        }
    };

    return (
        <div className="component-section">
            <h2>1. Test Case Suggester</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="requirements">Enter Software Requirements:</label>
                    <textarea
                        id="requirements"
                        value={requirements}
                        onChange={(e) => setRequirements(e.target.value)}
                        placeholder="e.g., The user should be able to login using email and password."
                        required
                        rows={6}
                        disabled={isLoading}
                    />
                </div>
                <button type="submit" disabled={isLoading || !requirements.trim()}>
                    {isLoading ? 'Analyzing...' : 'Suggest Test Cases'}
                </button>
            </form>

            {isLoading && <p className="loading-indicator">AI is thinking...</p>}
            {error && <p className="error">{error}</p>}

            {suggestions && !isLoading && (
                <div className="results">
                    <h3>AI Suggestions:</h3>
                    <pre>{suggestions}</pre>
                </div>
            )}
        </div>
    );
}

export default TestCaseSuggester;