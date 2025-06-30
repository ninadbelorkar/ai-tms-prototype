// File: frontend/src/components/TestCaseSuggester.js (FINAL VERSION with all features and fixes)

import React, { useState, useRef } from 'react';
import { FaCopy, FaStar, FaFileExcel, FaPlusCircle, FaMinusCircle } from 'react-icons/fa';
import { copyToClipboard } from '../utils/clipboardUtils'; 
import * as XLSX from 'xlsx';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

// Helper function to check if data is the new nested structure (has scenario_title)
const isNestedStructure = (data) => {
    return Array.isArray(data) && data.length > 0 && data[0] && data[0].hasOwnProperty('scenario_title');
};

// NEW: Groups a flat list of test cases (like from the image endpoint) into the nested scenario structure
const groupTcsByScenario = (flatTcs) => {
    if (!flatTcs || !Array.isArray(flatTcs)) return [];

    const scenarios = {}; // Use an object for efficient grouping

    flatTcs.forEach(tc => {
        const scenarioTitle = tc.scenario || "Uncategorized";
        if (!scenarios[scenarioTitle]) {
            scenarios[scenarioTitle] = {
                scenario_title: scenarioTitle,
                positive_test_cases: [],
                negative_test_cases: [],
            };
        }

        if (tc.type && tc.type.toLowerCase() === 'negative') {
            scenarios[scenarioTitle].negative_test_cases.push(tc);
        } else {
            // Default to positive if type is missing or not 'Negative'
            scenarios[scenarioTitle].positive_test_cases.push(tc);
        }
    });

    return Object.values(scenarios); // Convert the scenarios object back to an array
};


function TestCaseSuggester() {
    // --- State Management (from your complete version) ---
    const [inputType, setInputType] = useState('text');
    const [requirementsText, setRequirementsText] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [figmaUrl, setFigmaUrl] = useState('');
    const [figmaToken, setFigmaToken] = useState('');
    
    const [suggestions, setSuggestions] = useState(null); 
    const [automatedTestCaseIds, setAutomatedTestCaseIds] = useState([]);
    const [isRawText, setIsRawText] = useState(false);
    const [sourceInfo, setSourceInfo] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzingAutomation, setIsAnalyzingAutomation] = useState(false);
    const [error, setError] = useState('');
    const [copyStatus, setCopyStatus] = useState('');

    const fileInputRef = useRef(null);

    // --- Event Handlers (from your complete version) ---
    const resetInputs = (exceptType) => {
        if (exceptType !== 'text') setRequirementsText('');
        if (exceptType !== 'file' && exceptType !== 'image_zip') {
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
        if (exceptType !== 'figma') {
            setFigmaUrl('');
        }
        setSuggestions(null);
        setAutomatedTestCaseIds([]);
        setIsRawText(false);
        setError('');
        setSourceInfo('');
        setCopyStatus('');
    };

    const handleInputTypeChange = (type) => { setInputType(type); resetInputs(type); };
    
    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            setSelectedFile(file);
            setError('');
        } else {
            setSelectedFile(null);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        let isValidInput = false;
        if (inputType === 'text' && requirementsText.trim()) isValidInput = true;
        if ((inputType === 'file' || inputType === 'image_zip') && selectedFile) isValidInput = true;
        if (inputType === 'figma' && figmaUrl.trim() && figmaToken.trim()) isValidInput = true;

        if (!isValidInput) {
            setError(`Please provide input for the selected type (${inputType}). ${inputType === 'figma' ? 'Token is also required.' : ''}`);
            return;
        }
        setIsLoading(true);
        resetInputs(inputType);
        try {
            let response; let endpoint = ''; let body; let headers = {}; let currentSourceInfo = "";
            if (inputType === 'image_zip') {
                endpoint = `${BACKEND_URL}/api/suggest-test-cases-from-images`;
                const formData = new FormData();
                formData.append('file', selectedFile);
                body = formData;
                currentSourceInfo = `Suggestions based on image ZIP: ${selectedFile.name}`;
            } else if (inputType === 'file') {
                endpoint = `${BACKEND_URL}/api/suggest-test-cases-from-file`;
                const formData = new FormData();
                formData.append('file', selectedFile);
                body = formData;
                currentSourceInfo = `Suggestions based on document: ${selectedFile.name}`;
            } else if (inputType === 'figma') {
                endpoint = `${BACKEND_URL}/api/suggest-test-cases-from-figma`;
                body = JSON.stringify({ figma_url: figmaUrl, figma_token: figmaToken });
                headers['Content-Type'] = 'application/json';
                currentSourceInfo = `Suggestions based on Figma URL`;
            } else { // 'text'
                endpoint = `${BACKEND_URL}/api/suggest-test-cases`;
                body = JSON.stringify({ requirements: requirementsText });
                headers['Content-Type'] = 'application/json';
                currentSourceInfo = `Suggestions based on text input.`;
            }
            response = await fetch(endpoint, { method: 'POST', headers, body });
            const data = await response.json();
            setSourceInfo(data.source || currentSourceInfo);
            if (!response.ok) throw new Error(data.error || `HTTP error! Status: ${response.status}`);
            if (data.warning && typeof data.suggestions === 'string') {
                setSuggestions(data.suggestions);
                setIsRawText(true);
                setError(data.warning);
            } else if (Array.isArray(data.suggestions)) {
                setSuggestions(data.suggestions);
                setIsRawText(false);
            } else {
                setSuggestions("No suggestions generated or unexpected format.");
                setIsRawText(true);
            }
        } catch (err) {
            console.error("Failed to fetch suggestions:", err);
            setError(err.message || 'An unknown error occurred.');
            setSuggestions(null);
        } finally {
            setIsLoading(false);
        }
    };
    
    // NEW: Helper function to get a flat list of test cases, regardless of original structure
    const getFlattenedTcs = (suggestionsData) => {
        if (!suggestionsData || !Array.isArray(suggestionsData)) return [];
        if (isNestedStructure(suggestionsData)) {
            // Flatten the nested structure and add scenario_title and type to each test case for context
            return suggestionsData.flatMap(scenario => [
                ...(scenario.positive_test_cases || []).map(tc => ({ ...tc, scenario_title: scenario.scenario_title, type: 'Positive' })),
                ...(scenario.negative_test_cases || []).map(tc => ({ ...tc, scenario_title: scenario.scenario_title, type: 'Negative' }))
            ]);
        }
        // It's already a flat array (from image zip), but the AI should have added a 'type' property
        return suggestionsData;
    };

    const handleAutomationAnalysis = async () => {
        const allTestCases = getFlattenedTcs(suggestions);
        if (allTestCases.length === 0) {
            setError("No individual test cases found to analyze.");
            return;
        }
        setIsAnalyzingAutomation(true);
        setError('');
        try {
            const response = await fetch(`${BACKEND_URL}/api/analyze-for-automation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ test_cases: allTestCases }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to get automation analysis.");
            if (data.automation_analysis && data.automation_analysis.automated_test_case_ids) {
                setAutomatedTestCaseIds(data.automation_analysis.automated_test_case_ids);
            } else {
                if(data.warning) setError(data.warning);
                else setError("AI did not return a valid list of automation candidates.");
                setAutomatedTestCaseIds([]);
            }
        } catch (err) {
            console.error("Failed to analyze for automation:", err);
            setError(err.message || 'An unknown error occurred during automation analysis.');
        } finally {
            setIsAnalyzingAutomation(false);
        }
    };
    
    const handleCopyOutput = () => {
        let textToCopy = "";
        if (isRawText || typeof suggestions === 'string') {
            textToCopy = suggestions;
        } else if (Array.isArray(suggestions)) {
            textToCopy = `AI Test Case Suggestions (${sourceInfo}):\n\n`;
            // Use the flattening helper for consistent output
            const allTestCases = getFlattenedTcs(suggestions);
            allTestCases.forEach(tc => {
                const isCandidate = automatedTestCaseIds.includes(tc.id);
                if (isCandidate) textToCopy += `** AUTOMATION CANDIDATE **\n`;
                textToCopy += `ID: ${tc.id || 'N/A'}\n`;
                textToCopy += `Scenario: ${tc.scenario_title || tc.scenario || 'N/A'}\n`;
                if(tc.type) textToCopy += `Type: ${tc.type}\n`;
                textToCopy += `Priority: ${tc.priority || 'N/A'}\n`;
                textToCopy += `Severity: ${tc.severity || 'N/A'}\n`;
                textToCopy += `Summary: ${tc.test_case_summary || 'N/A'}\n`;
                textToCopy += `Pre-condition: ${tc.pre_condition || 'N/A'}\n`;
                textToCopy += `Test Steps:\n${renderTestSteps(tc.test_steps, true)}\n`;
                textToCopy += `Test Data: ${renderTestData(tc.test_data)}\n`;
                textToCopy += `Expected Result: ${tc.expected_result || 'N/A'}\n\n`;
            });
        }
        if (textToCopy) copyToClipboard(textToCopy, () => setCopyStatus("Copied!"), (err) => setCopyStatus(`Error: ${err}`));
        setTimeout(() => setCopyStatus(''), 2000);
    };

    const handleExportToExcel = () => {
        if (isRawText || !Array.isArray(suggestions) || suggestions.length === 0) {
            alert("No structured data available to export to Excel.");
            return;
        }
        const allTestCases = getFlattenedTcs(suggestions);
        const dataForExcel = allTestCases.map(tc => {
            const isCandidate = automatedTestCaseIds.includes(tc.id);
            return {
                'Automation Candidate': isCandidate ? 'Yes ⭐️' : 'No',
                'ID': tc.id || '',
                'Scenario': tc.scenario_title || tc.scenario || '', // Use scenario_title if it exists
                'Type': tc.type || 'N/A',
                'Priority': tc.priority || '',
                'Severity': tc.severity || '',
                'Test Case Summary': tc.test_case_summary || '',
                'Pre-condition': tc.pre_condition || '',
                'Test Steps': renderTestSteps(tc.test_steps, true),
                'Test Data': renderTestData(tc.test_data),
                'Expected Result': tc.expected_result || '',
            };
        });
        const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Test Cases");
        worksheet["!cols"] = [ {wch:22}, {wch:15}, {wch:30}, {wch:10}, {wch:10}, {wch:10}, {wch:50}, {wch:40}, {wch:60}, {wch:40}, {wch:50} ];
        XLSX.writeFile(workbook, "AI_Generated_Test_Cases.xlsx");
    };

    const renderTestSteps = (steps, isForText = false) => {
        if (!Array.isArray(steps)) return steps || '';
        if (isForText) return steps.map(s => `  - ${s}`).join('\n');
        return (
            <ol style={{ margin: 0, paddingLeft: '20px', listStyleType: 'decimal' }}>
                {steps.map((step, index) => <li key={index}>{step}</li>)}
            </ol>
        );
    };

    const renderTestData = (testData) => {
        if (Array.isArray(testData)) {
            return testData.join('\n');
        }
        if (typeof testData === 'object' && testData !== null) {
            return Object.entries(testData).map(([key, value]) => `${key}: ${value}`).join('\n');
        }
        return testData || '';
    };

    const TestCaseTable = ({ testCases }) => {
        if (!testCases || testCases.length === 0) return null;
        return (
            <div style={{ overflowX: 'auto' }}>
                <table className="test-case-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Priority</th>
                            <th>Severity</th>
                            <th>Test Case Summary</th>
                            <th>Test Steps</th>
                            <th>Test Data</th>
                            <th>Expected Result</th>
                        </tr>
                    </thead>
                    <tbody>
                        {testCases.map((tc, index) => {
                            const isAutomatedCandidate = automatedTestCaseIds.includes(tc.id);
                            return (
                                <tr key={tc.id || `tc-flat-${index}`} className={isAutomatedCandidate ? 'automated-candidate' : ''}>
                                    <td>
                                        {isAutomatedCandidate && <FaStar className="icon" title="Recommended for Automation" />}
                                        {tc.id}
                                    </td>
                                    <td>{tc.priority}</td>
                                    <td>{tc.severity}</td>
                                    <td>{tc.test_case_summary}</td>
                                    <td>{renderTestSteps(tc.test_steps)}</td>
                                    <td><pre style={{margin: 0, fontFamily: 'inherit'}}>{renderTestData(tc.test_data)}</pre></td>
                                    <td>{tc.expected_result}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="component-section">
            <h2>1. Test Case Generator</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>Select Input Type:</label>
                    <select value={inputType} onChange={(e) => handleInputTypeChange(e.target.value)} disabled={isLoading}>
                        <option value="text">Text Input</option>
                        <option value="file">Document (PDF/DOCX)</option>
                        <option value="image_zip">UI Screenshots (ZIP)</option>
                        <option value="figma">Figma URL</option>
                    </select>
                </div>
                {inputType === 'text' && (
                    <div className="form-group">
                        <label htmlFor="requirements">Enter Requirements Text:</label>
                        <textarea id="requirements" value={requirementsText} onChange={(e) => setRequirementsText(e.target.value)} placeholder="e.g., The user should be able to login..." rows={6} disabled={isLoading} />
                    </div>
                )}
                {inputType === 'file' && (
                    <div className="form-group">
                        <label htmlFor="reqFile">Upload Document:</label>
                        <input type="file" id="reqFile" accept=".pdf,.docx" onChange={handleFileChange} ref={fileInputRef} disabled={isLoading} />
                        {selectedFile && <p style={{ marginTop: '5px', fontSize: '0.9em' }}>Selected: {selectedFile.name}</p>}
                    </div>
                )}
                {inputType === 'image_zip' && (
                     <div className="form-group">
                        <label htmlFor="imgZipFile">Upload ZIP of Screenshots:</label>
                        <input type="file" id="imgZipFile" accept=".zip,application/zip,application/x-zip-compressed" onChange={handleFileChange} ref={fileInputRef} disabled={isLoading} />
                        {selectedFile && <p style={{ marginTop: '5px', fontSize: '0.9em' }}>Selected: {selectedFile.name}</p>}
                    </div>
                )}
                {inputType === 'figma' && (
                    <>
                        <div className="form-group">
                            <label htmlFor="figmaUrl">Figma File URL:</label>
                            <input type="url" id="figmaUrl" value={figmaUrl} onChange={(e) => setFigmaUrl(e.target.value)} placeholder="https://www.figma.com/file/..." disabled={isLoading} required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="figmaToken">Figma Personal Access Token:</label>
                            <input type="password" id="figmaToken" value={figmaToken} onChange={(e) => setFigmaToken(e.target.value)} placeholder="Enter your Figma token" disabled={isLoading} required />
                             <small style={{display: 'block', marginTop: '5px'}}>
                                Note: For security, tokens should ideally be handled more securely.
                            </small>
                        </div>
                    </>
                )}
                <button type="submit" disabled={isLoading}>
                    {isLoading ? 'Generating...' : 'Generate Test Cases'}
                </button>
            </form>

            {isLoading && <p className="loading-indicator">AI is working...</p>}
            {error && <p className="error">{error}</p>}

            {suggestions && !isLoading && (
                <div className="results">
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h3>AI Suggestions</h3>
                        <div>
                            {!isRawText && Array.isArray(suggestions) && suggestions.length > 0 && (
                                <button onClick={handleAutomationAnalysis} className="results-action-button" title="Find test cases suitable for automation" style={{ marginRight: '10px' }} disabled={isAnalyzingAutomation}>
                                    {isAnalyzingAutomation ? 'Analyzing...' : 'Analyze for Automation'}
                                </button>
                            )}
                            <button onClick={handleCopyOutput} className="results-action-button" title="Copy Output" style={{ marginRight: '10px' }}>
                                <FaCopy /> {copyStatus || 'Copy'}
                            </button>
                            {!isRawText && Array.isArray(suggestions) && suggestions.length > 0 && (
                                <button onClick={handleExportToExcel} className="results-action-button" title="Export to Excel">
                                    <FaFileExcel /> Export to Excel
                                </button>
                            )}
                        </div>
                    </div>
                    {sourceInfo && <p style={{ fontSize: '0.9em', fontStyle: 'italic', marginBottom: '10px' }}>{sourceInfo}</p>}

                    {isRawText ? ( <pre>{suggestions}</pre> ) : (
                        <div className="scenarios-container">
                            {(isNestedStructure(suggestions) ? suggestions : groupTcsByScenario(suggestions)).map((scenario, index) => (
                                <div key={index} className="scenario-block">
                                    <h3>{scenario.scenario_title}</h3>
                                    <h4 className="table-type-header type-positive"><FaPlusCircle className="icon" />Positive Test Cases</h4>
                                    <TestCaseTable testCases={scenario.positive_test_cases} />
                                    <h4 className="table-type-header type-negative"><FaMinusCircle className="icon" />Negative Test Cases</h4>
                                    <TestCaseTable testCases={scenario.negative_test_cases} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default TestCaseSuggester;