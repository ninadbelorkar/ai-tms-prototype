// File: frontend/src/components/TestCaseSuggester.js (Modified)
import React, { useState, useRef } from 'react'; // Import useRef

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

function TestCaseSuggester() {
    // Keep state for text input if you want both options
    const [requirementsText, setRequirementsText] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [suggestions, setSuggestions] = useState('');
    const [sourceInfo, setSourceInfo] = useState(''); // To show if suggestions are from text or file
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Ref for the file input
    const fileInputRef = useRef(null);

    // Handle file selection
    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
             // Basic validation for allowed types (sync with backend)
             const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
             if (allowedTypes.includes(file.type)) {
                 setSelectedFile(file);
                 setError(''); // Clear previous errors
                 setRequirementsText(''); // Clear text input if file is selected
             } else {
                 setError('Invalid file type. Please select a PDF or DOCX file.');
                 setSelectedFile(null);
                 // Clear the file input visually
                 if (fileInputRef.current) {
                     fileInputRef.current.value = '';
                 }
             }
        } else {
            setSelectedFile(null);
        }
    };

    // Handle text input change
    const handleTextChange = (event) => {
        setRequirementsText(event.target.value);
        // Clear file input if text is entered
        if (selectedFile) {
            setSelectedFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };


    const handleSubmit = async (e) => {
        e.preventDefault();
        // Check if either text is entered or a file is selected
        if (!requirementsText.trim() && !selectedFile) {
            setError("Please enter requirements text OR select a PDF/DOCX file.");
            return;
        }

        setIsLoading(true);
        setError('');
        setSuggestions('');
        setSourceInfo('');

        try {
            let response;
            let data;

            if (selectedFile) {
                // --- Handle File Upload ---
                const formData = new FormData();
                formData.append('file', selectedFile); // 'file' must match backend key

                response = await fetch(`${BACKEND_URL}/api/suggest-test-cases-from-file`, {
                    method: 'POST',
                    body: formData, // Send FormData, no 'Content-Type' header needed (browser sets it)
                });
                data = await response.json();
                if (response.ok) {
                    setSourceInfo(`Suggestions based on uploaded file: ${data.filename}`);
                }

            } else {
                // --- Handle Text Input ---
                response = await fetch(`${BACKEND_URL}/api/suggest-test-cases`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ requirements: requirementsText }),
                });
                data = await response.json();
                 if (response.ok) {
                    setSourceInfo(`Suggestions based on text input.`);
                }
            }

            // --- Process Response ---
            if (!response.ok) {
                throw new Error(data.error || `HTTP error! Status: ${response.status}`);
            }

            setSuggestions(data.suggestions || "No suggestions generated.");

        } catch (err) {
            console.error("Failed to fetch suggestions:", err);
            setError(err.message || 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="component-section">
            <h2>1. Test Case Suggester</h2>
            <form onSubmit={handleSubmit}>
                {/* Option 1: Text Input */}
                <div className="form-group">
                    <label htmlFor="requirements">Enter Software Requirements Text:</label>
                    <textarea
                        id="requirements"
                        value={requirementsText}
                        onChange={handleTextChange}
                        placeholder="e.g., The user should be able to login..."
                        rows={6}
                        disabled={isLoading || !!selectedFile} // Disable if file is selected
                    />
                </div>

                <p style={{ textAlign: 'center', fontWeight: 'bold', margin: '15px 0' }}>OR</p>

                {/* Option 2: File Input */}
                 <div className="form-group">
                    <label htmlFor="reqFile">Upload Requirements File (PDF or DOCX):</label>
                    <input
                        type="file"
                        id="reqFile"
                        accept=".pdf, application/pdf, .docx, application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={handleFileChange}
                        ref={fileInputRef} // Assign ref
                        disabled={isLoading || !!requirementsText.trim()} // Disable if text is entered
                    />
                     {selectedFile && <p style={{marginTop: '5px', fontSize: '0.9em'}}>Selected: {selectedFile.name}</p>}
                </div>

                <button type="submit" disabled={isLoading || (!requirementsText.trim() && !selectedFile)}>
                    {isLoading ? 'Analyzing...' : 'Suggest Test Cases'}
                </button>
            </form>

            {isLoading && <p className="loading-indicator">AI is thinking...</p>}
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

export default TestCaseSuggester;