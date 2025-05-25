import React, { useState, useRef } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

function TestCaseSuggester() {
    const [inputType, setInputType] = useState('text'); // 'text', 'file', 'figma'
    const [requirementsText, setRequirementsText] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [figmaUrl, setFigmaUrl] = useState('');
    const [figmaToken, setFigmaToken] = useState(''); // Consider secure storage for real apps

    const [suggestions, setSuggestions] = useState(null);
    const [isRawText, setIsRawText] = useState(false);
    const [sourceInfo, setSourceInfo] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const fileInputRef = useRef(null);

    const resetInputs = (exceptType) => {
        if (exceptType !== 'text') setRequirementsText('');
        if (exceptType !== 'file') {
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
        if (exceptType !== 'figma') {
            setFigmaUrl('');
            // setFigmaToken(''); // Decide if token should reset on type change
        }
        setSuggestions(null);
        setIsRawText(false);
        setError('');
        setSourceInfo('');
    };

    const handleInputTypeChange = (type) => {
        setInputType(type);
        resetInputs(type);
    };

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
            if (allowedTypes.includes(file.type)) {
                setSelectedFile(file);
                setError('');
            } else {
                setError('Invalid file type. Please select a PDF or DOCX file.');
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        } else {
            setSelectedFile(null);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        let isValidInput = false;
        if (inputType === 'text' && requirementsText.trim()) isValidInput = true;
        if (inputType === 'file' && selectedFile) isValidInput = true;
        if (inputType === 'figma' && figmaUrl.trim() && figmaToken.trim()) isValidInput = true;

        if (!isValidInput) {
            setError(`Please provide input for the selected type (${inputType}). Token is also required for Figma.`);
            return;
        }

        setIsLoading(true);
        setError('');
        setSuggestions(null);
        setIsRawText(false);
        setSourceInfo('');

        try {
            let response;
            let endpoint = '';
            let body;
            let headers = {};
            let currentSourceInfo = "";

            if (inputType === 'file') {
                endpoint = `${BACKEND_URL}/api/suggest-test-cases-from-file`;
                const formData = new FormData();
                formData.append('file', selectedFile);
                body = formData;
                // For FormData, browser sets Content-Type automatically
                currentSourceInfo = `Suggestions based on uploaded file: ${selectedFile.name}`;
            } else if (inputType === 'text') {
                endpoint = `${BACKEND_URL}/api/suggest-test-cases`;
                body = JSON.stringify({ requirements: requirementsText });
                headers['Content-Type'] = 'application/json';
                currentSourceInfo = `Suggestions based on text input.`;
            } else if (inputType === 'figma') {
                endpoint = `${BACKEND_URL}/api/suggest-test-cases-from-figma`;
                body = JSON.stringify({ figma_url: figmaUrl, figma_token: figmaToken });
                headers['Content-Type'] = 'application/json';
                currentSourceInfo = `Suggestions based on Figma URL: ${figmaUrl.split('/').pop() || 'Figma Design'}`;
            }

            response = await fetch(endpoint, {
                method: 'POST',
                headers: headers, // Will be empty for FormData, which is correct
                body: body,
            });

            const data = await response.json();
            setSourceInfo(currentSourceInfo); // Set source info after fetch attempt

            if (!response.ok) {
                throw new Error(data.error || `HTTP error! Status: ${response.status}`);
            }

            if (data.warning && typeof data.suggestions === 'string') {
                setSuggestions(data.suggestions);
                setIsRawText(true);
                setError(data.warning); // Display backend warning as an error/info
            } else if (Array.isArray(data.suggestions)) {
                setSuggestions(data.suggestions);
                setIsRawText(false);
            } else {
                setSuggestions("No suggestions generated or response format was unexpected.");
                setIsRawText(true);
            }

        } catch (err) {
            console.error("Failed to fetch suggestions:", err);
            setError(err.message || 'An unknown error occurred.');
            setSuggestions(null);
            setIsRawText(false);
        } finally {
            setIsLoading(false);
        }
    };

    const renderTestSteps = (steps) => {
        if (Array.isArray(steps)) {
            return (
                <ol style={{ margin: 0, paddingLeft: '20px', listStyleType: 'decimal' }}>
                    {steps.map((step, index) => (
                        <li key={index}>{step}</li>
                    ))}
                </ol>
            );
        }
        return steps;
    };

    return (
        <div className="component-section">
            <h2>1. Test Case Suggester</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>Select Input Type:</label>
                    <select value={inputType} onChange={(e) => handleInputTypeChange(e.target.value)} disabled={isLoading}>
                        <option value="text">Text Input</option>
                        <option value="file">File Upload (PDF/DOCX)</option>
                        <option value="figma">Figma URL</option>
                    </select>
                </div>

                {inputType === 'text' && (
                    <div className="form-group">
                        <label htmlFor="requirements">Enter Software Requirements Text:</label>
                        <textarea
                            id="requirements"
                            value={requirementsText}
                            onChange={(e) => setRequirementsText(e.target.value)}
                            placeholder="e.g., The user should be able to login..."
                            rows={6}
                            disabled={isLoading}
                        />
                    </div>
                )}

                {inputType === 'file' && (
                    <div className="form-group">
                        <label htmlFor="reqFile">Upload Requirements File:</label>
                        <input
                            type="file"
                            id="reqFile"
                            accept=".pdf, application/pdf, .docx, application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            onChange={handleFileChange}
                            ref={fileInputRef}
                            disabled={isLoading}
                        />
                        {selectedFile && <p style={{ marginTop: '5px', fontSize: '0.9em' }}>Selected: {selectedFile.name}</p>}
                    </div>
                )}

                {inputType === 'figma' && (
                    <>
                        <div className="form-group">
                            <label htmlFor="figmaUrl">Figma File URL:</label>
                            <input
                                type="url"
                                id="figmaUrl"
                                value={figmaUrl}
                                onChange={(e) => setFigmaUrl(e.target.value)}
                                placeholder="https://www.figma.com/file/..."
                                disabled={isLoading}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="figmaToken">Figma Personal Access Token:</label>
                            <input
                                type="password" // Use password type for tokens
                                id="figmaToken"
                                value={figmaToken}
                                onChange={(e) => setFigmaToken(e.target.value)}
                                placeholder="Enter your Figma token"
                                disabled={isLoading}
                                required
                            />
                             <small style={{display: 'block', marginTop: '5px'}}>
                                Note: For security, tokens should ideally be handled more securely in a real application (e.g., backend proxy, user-specific storage).
                            </small>
                        </div>
                    </>
                )}

                <button type="submit" disabled={isLoading}>
                    {isLoading ? 'Analyzing...' : 'Suggest Test Cases'}
                </button>
            </form>

            {isLoading && <p className="loading-indicator">AI is thinking...</p>}
            {error && <p className="error">{error}</p>}

            {suggestions && !isLoading && (
                <div className="results">
                    <h3>AI Suggestions</h3>
                    {sourceInfo && <p style={{ fontSize: '0.9em', fontStyle: 'italic', marginBottom: '10px' }}>{sourceInfo}</p>}

                    {isRawText ? (
                        <pre>{suggestions}</pre>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="test-case-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Scenario</th>
                                        <th>Test Case Summary</th>
                                        <th>Pre-condition</th>
                                        <th>Test Steps</th>
                                        <th>Test Data</th>
                                        <th>Expected Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {suggestions.map((tc, index) => (
                                        <tr key={tc.id || `tc-gen-${index}`}>
                                            <td>{tc.id || `TC-${index + 1}`}</td>
                                            <td>{tc.scenario}</td>
                                            <td>{tc.test_case_summary}</td>
                                            <td>{tc.pre_condition}</td>
                                            <td>{renderTestSteps(tc.test_steps)}</td>
                                            <td>{Array.isArray(tc.test_data) ? tc.test_data.join('\n') : tc.test_data}</td>
                                            <td>{tc.expected_result}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default TestCaseSuggester;