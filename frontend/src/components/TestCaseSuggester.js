import React, { useState, useRef } from 'react';
import { FaCopy } from 'react-icons/fa'; // For copy button
import { copyToClipboard } from '../utils/clipboardUtils'; // Assuming utils/clipboardUtils.js exists
import * as XLSX from 'xlsx'; // For Excel export

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

function TestCaseSuggester() {
    const [inputType, setInputType] = useState('text'); // 'text', 'file', 'figma'
    const [requirementsText, setRequirementsText] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [figmaUrl, setFigmaUrl] = useState('');
    const [figmaToken, setFigmaToken] = useState('');

    const [suggestions, setSuggestions] = useState(null);
    const [isRawText, setIsRawText] = useState(false);
    const [sourceInfo, setSourceInfo] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [copyStatus, setCopyStatus] = useState(''); // For copy feedback

    const fileInputRef = useRef(null);

    const resetInputs = (exceptType) => {
        if (exceptType !== 'text') setRequirementsText('');
        if (exceptType !== 'file') {
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
        if (exceptType !== 'figma') {
            setFigmaUrl('');
            // setFigmaToken(''); // Keeping token might be user-friendly if switching back and forth
        }
        setSuggestions(null);
        setIsRawText(false);
        setError('');
        setSourceInfo('');
        setCopyStatus(''); // Reset copy status
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
            setError(`Please provide input for the selected type (${inputType}). ${inputType === 'figma' ? 'Token is also required for Figma.' : ''}`);
            return;
        }

        setIsLoading(true);
        setError('');
        setSuggestions(null);
        setIsRawText(false);
        setSourceInfo('');
        setCopyStatus('');

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
                currentSourceInfo = `Suggestions based on Figma URL: ${figmaUrl.split('/').pop().split('?')[0] || 'Figma Design'}`;
            }

            response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: body,
            });

            const data = await response.json();
            setSourceInfo(currentSourceInfo);

            if (!response.ok) {
                throw new Error(data.error || `HTTP error! Status: ${response.status}`);
            }

            if (data.warning && typeof data.suggestions === 'string') {
                setSuggestions(data.suggestions);
                setIsRawText(true);
                setError(data.warning);
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

    const handleCopyOutput = () => {
        let textToCopy = "";
        if (isRawText || typeof suggestions === 'string') {
            textToCopy = suggestions;
        } else if (Array.isArray(suggestions)) {
            textToCopy = `AI Test Case Suggestions (${sourceInfo}):\n\n`;
            suggestions.forEach(tc => {
                textToCopy += `ID: ${tc.id || 'N/A'}\n`;
                textToCopy += `Scenario: ${tc.scenario || 'N/A'}\n`;
                textToCopy += `Summary: ${tc.test_case_summary || 'N/A'}\n`;
                textToCopy += `Pre-condition: ${tc.pre_condition || 'N/A'}\n`;
                textToCopy += `Test Steps:\n${Array.isArray(tc.test_steps) ? tc.test_steps.map(s => `  - ${s}`).join('\n') : (tc.test_steps || 'N/A')}\n`;
                textToCopy += `Test Data: ${Array.isArray(tc.test_data) ? tc.test_data.join(', ') : (tc.test_data || 'N/A')}\n`;
                textToCopy += `Expected Result: ${tc.expected_result || 'N/A'}\n\n`;
            });
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

    const handleExportToExcel = () => {
        if (isRawText || !Array.isArray(suggestions) || suggestions.length === 0) {
            alert("No structured data available to export to Excel.");
            return;
        }
        const dataForExcel = suggestions.map(tc => ({
            'ID': tc.id || '',
            'Scenario': tc.scenario || '',
            'Test Case Summary': tc.test_case_summary || '',
            'Pre-condition': tc.pre_condition || '',
            'Test Steps': Array.isArray(tc.test_steps) ? tc.test_steps.join('\n') : (tc.test_steps || ''),
            'Test Data': Array.isArray(tc.test_data) ? tc.test_data.join('\n') : (tc.test_data || ''),
            'Expected Result': tc.expected_result || '',
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Test Cases");
        const colWidths = [ {wch:15}, {wch:30}, {wch:50}, {wch:40}, {wch:60}, {wch:40}, {wch:50} ];
        worksheet["!cols"] = colWidths;
        XLSX.writeFile(workbook, "AI_Generated_Test_Cases.xlsx");
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
                                type="password"
                                id="figmaToken"
                                value={figmaToken}
                                onChange={(e) => setFigmaToken(e.target.value)}
                                placeholder="Enter your Figma token"
                                disabled={isLoading}
                                required
                            />
                             <small style={{display: 'block', marginTop: '5px'}}>
                                Note: For security, tokens should ideally be handled more securely.
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
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h3>AI Suggestions</h3>
                        <div>
                            <button onClick={handleCopyOutput} className="copy-button" title="Copy Output" style={{ marginRight: '10px' }}>
                                <FaCopy /> {copyStatus || 'Copy'}
                            </button>
                            {!isRawText && Array.isArray(suggestions) && suggestions.length > 0 && (
                                <button onClick={handleExportToExcel} className="export-button" title="Export to Excel">
                                    Export to Excel
                                </button>
                            )}
                        </div>
                    </div>
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