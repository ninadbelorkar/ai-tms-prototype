// File: frontend/src/components/FigmaInputter.js
import React, { useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

function FigmaInputter() {
    const [figmaUrl, setFigmaUrl] = useState('');
    const [figmaToken, setFigmaToken] = useState(''); // State for the token
    const [suggestions, setSuggestions] = useState('');
    const [sourceInfo, setSourceInfo] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!figmaUrl.trim() || !figmaToken.trim()) {
            setError("Please provide both the Figma File URL and your Personal Access Token.");
            return;
        }
        // Basic URL check (optional but helpful)
        // if (!figmaUrl.includes('figma.com/file/')) {
        //      setError("Please enter a valid Figma file URL.");
        //      return;
        // }


        setIsLoading(true);
        setError('');
        setSuggestions('');
        setSourceInfo('');

        try {
            const response = await fetch(`${BACKEND_URL}/api/suggest-test-cases-from-figma`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    figma_url: figmaUrl,
                    figma_token: figmaToken // Send the token
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP error! Status: ${response.status}`);
            }

            setSuggestions(data.suggestions || "No suggestions generated.");
            setSourceInfo(`Suggestions based on: ${data.source || 'Figma file'}`); // Use source from backend

        } catch (err) {
            console.error("Failed to fetch suggestions from Figma:", err);
            // Display more user-friendly errors for common Figma issues
            let displayError = err.message || 'An unknown error occurred.';
             if (displayError.includes("404")) {
                displayError = "Figma file not found. Please check the URL.";
             } else if (displayError.includes("403") || displayError.includes("401")) {
                displayError = "Figma API access denied. Please check your Personal Access Token and ensure it has read permissions for the file.";
             } else if (displayError.includes("Failed to fetch")) {
                 displayError = "Could not connect to Figma API. Please check your network or try again later."
             }
            setError(displayError);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="component-section">
            <h2>Suggest Test Cases from Figma File</h2>
             <p style={{ fontSize: '0.9em', color: '#555' }}>
                You need a{' '}
                <a href="https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens" target="_blank" rel="noopener noreferrer">
                    Figma Personal Access Token
                </a>
                {' '}with read access to the file.
            </p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="figmaUrl">Figma File URL:</label>
                    <input
                        type="url" // Use type="url" for basic validation
                        id="figmaUrl"
                        value={figmaUrl}
                        onChange={(e) => setFigmaUrl(e.target.value)}
                        placeholder="https://www.figma.com/file/YourFileKey/YourFileName..."
                        required
                        disabled={isLoading}
                    />
                </div>
                 <div className="form-group">
                    <label htmlFor="figmaToken">Figma Personal Access Token:</label>
                    <input
                        type="password" // Use password type to obscure token
                        id="figmaToken"
                        value={figmaToken}
                        onChange={(e) => setFigmaToken(e.target.value)}
                        placeholder="Enter your generated token"
                        required
                        disabled={isLoading}
                    />
                </div>

                <button type="submit" disabled={isLoading || !figmaUrl.trim() || !figmaToken.trim()}>
                    {isLoading ? 'Analyzing Figma File...' : 'Suggest from Figma'}
                </button>
            </form>

            {isLoading && <p className="loading-indicator">Fetching Figma data and analyzing...</p>}
            {error && <p className="error">{error}</p>}

            {suggestions && !isLoading && (
                <div className="results">
                    <h3>AI Suggestions:</h3>
                    {sourceInfo && <p style={{ fontSize: '0.9em', fontStyle: 'italic', marginBottom: '10px' }}>{sourceInfo}</p>}
                    <pre>{suggestions}</pre>
                </div>
            )}
        </div>
    );
}

export default FigmaInputter;