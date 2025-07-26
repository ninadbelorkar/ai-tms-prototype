// File: frontend/src/components/TestCaseSuggester.js (FINAL, COMPLETE, AND CORRECTED)

import React, { useState, useRef } from 'react';
import { FaCopy, FaStar, FaFileExcel, FaPlusCircle, FaMinusCircle, FaEdit, FaSave, FaTimes, FaTrash } from 'react-icons/fa';
import { copyToClipboard } from '../utils/clipboardUtils'; 
import * as XLSX from 'xlsx';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

// --- HELPER FUNCTIONS (defined outside components for global scope within this file) ---

const isNestedStructure = (data) => {
    return Array.isArray(data) && data.length > 0 && data[0] && data[0].hasOwnProperty('scenario_title');
};

const groupTcsByScenario = (flatTcs) => {
    if (!flatTcs || !Array.isArray(flatTcs)) return [];
    const scenarios = {};
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
            scenarios[scenarioTitle].positive_test_cases.push(tc);
        }
    });
    return Object.values(scenarios);
};

const renderTestSteps = (steps, isForText = false) => {
    if (!Array.isArray(steps)) return steps || '';
    if (isForText) return steps.map(s => `  - ${s}`).join('\n');
    return <ol style={{ margin: 0, paddingLeft: '20px', listStyleType: 'decimal' }}>{steps.map((step, index) => <li key={index}>{step}</li>)}</ol>;
};

const renderTestData = (testData) => {
    if (Array.isArray(testData)) return testData.join('\n');
    if (typeof testData === 'object' && testData !== null) return Object.entries(testData).map(([key, value]) => `${key}: ${value}`).join('\n');
    return testData || '';
};


// --- SUB-COMPONENT: TestCaseTable (Moved outside for performance and focus fix) ---
const TestCaseTable = ({ 
    testCases, 
    automatedTestCaseIds, 
    editingRowId, 
    editedRowData,
    hoveredRowId,
    setHoveredRowId,
    handleEditClick,
    handleSaveClick,
    handleCancelClick,
    handleEditChange,
    handleEditStepsChange,
    handleDeleteTestCase
}) => {
    if (!testCases || testCases.length === 0) return null;

    return (
        <div style={{ overflowX: 'auto' }}>
            <table className="test-case-table">
                <thead>
                    <tr>
                        <th style={{width: '15%'}}>ID</th>
                        <th style={{width: '10%'}}>Priority</th>
                        <th style={{width: '10%'}}>Severity</th>
                        <th>Test Case Summary</th>
                        <th>Test Steps</th>
                        <th>Test Data</th>
                        <th>Expected Result</th>
                    </tr>
                </thead>
                <tbody>
                    {testCases.map((tc) => {
                        const isEditing = editingRowId === tc.id;
                        const isAutomatedCandidate = automatedTestCaseIds.includes(tc.id);

                        return isEditing ? (
                            <tr key={tc.id} className="editing-row">
                                <td>
                                    <div>{editedRowData.case_id_string || editedRowData.id}</div>
                                    <div className="edit-actions">
                                        <button onClick={() => handleSaveClick(tc.id)} className="edit-action-btn save"><FaSave /> Save</button>
                                        <button onClick={handleCancelClick} className="edit-action-btn cancel"><FaTimes /> Cancel</button>
                                    </div>
                                </td>
                                <td><input value={editedRowData.priority || ''} onChange={(e) => handleEditChange(e, 'priority')} /></td>
                                <td><input value={editedRowData.severity || ''} onChange={(e) => handleEditChange(e, 'severity')} /></td>
                                <td><textarea value={editedRowData.summary || ''} onChange={(e) => handleEditChange(e, 'summary')} /></td>
                                <td>
                                    {Array.isArray(editedRowData.test_steps_json) && editedRowData.test_steps_json.map((step, i) => (
                                        <textarea key={i} value={step} onChange={(e) => handleEditStepsChange(e, i)} />
                                    ))}
                                </td>
                                <td><textarea value={editedRowData.test_data || ''} onChange={(e) => handleEditChange(e, 'test_data')} /></td>
                                <td><textarea value={editedRowData.expected_result || ''} onChange={(e) => handleEditChange(e, 'expected_result')} /></td>
                            </tr>
                        ) : (
                            <tr 
                                key={tc.id} 
                                className={isAutomatedCandidate ? 'automated-candidate' : ''}
                                onMouseEnter={() => setHoveredRowId(tc.id)}
                                onMouseLeave={() => setHoveredRowId(null)}
                            >
                                <td className="id-cell">
                                    <div className="id-content">
                                        {isAutomatedCandidate && <FaStar className="icon" title="Recommended for Automation" />}
                                        {tc.case_id_string || tc.id}
                                    </div>
                                    {hoveredRowId === tc.id && (
                                        <div className="hover-actions">
                                            <button onClick={() => handleEditClick(tc)} className="edit-button-hover"><FaEdit /> Edit</button>
                                            <button onClick={() => handleDeleteTestCase(tc.id)} className="delete-button-hover"><FaTrash /></button>
                                        </div>
                                    )}
                                </td>
                                <td>{tc.priority}</td>
                                <td>{tc.severity}</td>
                                <td>{tc.summary}</td>
                                <td>{renderTestSteps(tc.test_steps_json)}</td>
                                <td><pre style={{margin: 0, fontFamily: 'inherit'}}>{renderTestData(tc.test_data_json)}</pre></td>
                                <td>{tc.expected_result}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};


// --- MAIN COMPONENT ---
function TestCaseSuggester() {
    // --- State Management ---
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
    const [editingRowId, setEditingRowId] = useState(null);
    const [editedRowData, setEditedRowData] = useState({});
    const [hoveredRowId, setHoveredRowId] = useState(null);

    // --- Event Handlers ---
    const resetInputs = (exceptType) => {
        if (exceptType !== 'text') setRequirementsText('');
        if (exceptType !== 'file' && exceptType !== 'image_zip') {
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
        if (exceptType !== 'figma') setFigmaUrl('');
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
    
    const getFlattenedTcs = (suggestionsData) => {
        if (!suggestionsData || !Array.isArray(suggestionsData)) return [];
        if (isNestedStructure(suggestionsData)) {
            return suggestionsData.flatMap(scenario => [
                ...(scenario.positive_test_cases || []).map(tc => ({ ...tc, scenario_title: scenario.scenario_title, type: 'Positive' })),
                ...(scenario.negative_test_cases || []).map(tc => ({ ...tc, scenario_title: scenario.scenario_title, type: 'Negative' }))
            ]);
        }
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
            const allTestCases = getFlattenedTcs(suggestions);
            allTestCases.forEach(tc => {
                const isCandidate = automatedTestCaseIds.includes(tc.id);
                if (isCandidate) textToCopy += `** AUTOMATION CANDIDATE **\n`;
                textToCopy += `ID: ${tc.case_id_string || tc.id || 'N/A'}\n`;
                textToCopy += `Scenario: ${tc.scenario_title || tc.scenario || 'N/A'}\n`;
                if(tc.type) textToCopy += `Type: ${tc.type}\n`;
                textToCopy += `Priority: ${tc.priority || 'N/A'}\n`;
                textToCopy += `Severity: ${tc.severity || 'N/A'}\n`;
                textToCopy += `Summary: ${tc.summary || 'N/A'}\n`;
                textToCopy += `Pre-condition: ${tc.pre_condition || 'N/A'}\n`;
                textToCopy += `Test Steps:\n${renderTestSteps(tc.test_steps_json, true)}\n`;
                textToCopy += `Test Data: ${renderTestData(tc.test_data_json)}\n`;
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
                'ID': tc.case_id_string || tc.id || '',
                'Scenario': tc.scenario_title || tc.scenario || '',
                'Type': tc.type || 'N/A',
                'Priority': tc.priority || '',
                'Severity': tc.severity || '',
                'Test Case Summary': tc.summary || '',
                'Pre-condition': tc.pre_condition || '',
                'Test Steps': renderTestSteps(tc.test_steps_json, true),
                'Test Data': renderTestData(tc.test_data_json),
                'Expected Result': tc.expected_result || '',
            };
        });
        const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Test Cases");
        worksheet["!cols"] = [ {wch:22}, {wch:15}, {wch:30}, {wch:10}, {wch:10}, {wch:10}, {wch:50}, {wch:40}, {wch:60}, {wch:40}, {wch:50} ];
        XLSX.writeFile(workbook, "AI_Generated_Test_Cases.xlsx");
    };

    const handleEditClick = (testCase) => {
        setEditingRowId(testCase.id);
        setEditedRowData({ 
            ...testCase,
            test_data: renderTestData(testCase.test_data_json), 
            test_steps_json: testCase.test_steps_json || [],
        });
    };

    const handleCancelClick = () => {
        setEditingRowId(null);
        setEditedRowData({});
    };

    const handleEditChange = (e, field) => {
        setEditedRowData({ ...editedRowData, [field]: e.target.value });
    };
    
    const handleEditStepsChange = (e, index) => {
        const newSteps = [...editedRowData.test_steps_json];
        newSteps[index] = e.target.value;
        setEditedRowData({ ...editedRowData, test_steps_json: newSteps });
    };


    const handleDeleteTestCase = async (caseIdToDelete) => {
        if (!window.confirm("Are you sure you want to permanently delete this test case?")) {
            return;
        }
        try {
            const response = await fetch(`${BACKEND_URL}/api/test-cases/${caseIdToDelete}`, {
                method: 'DELETE',
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to delete test case.");

            // If successful, update the state to remove the item from the UI
            const updateSuggestions = (currentSuggestions) => {
                if (!currentSuggestions) return [];
                const updater = (tc) => tc.id !== caseIdToDelete;

                if (isNestedStructure(currentSuggestions)) {
                    return currentSuggestions.map(scenario => ({
                        ...scenario,
                        positive_test_cases: (scenario.positive_test_cases || []).filter(updater),
                        negative_test_cases: (scenario.negative_test_cases || []).filter(updater),
                    })).filter(scenario => scenario.positive_test_cases.length > 0 || scenario.negative_test_cases.length > 0);
                } else {
                    return currentSuggestions.filter(updater);
                }
            };
            setSuggestions(updateSuggestions(suggestions));

        } catch (err) {
            setError(err.message);
        }
    };


    const handleSaveClick = async (caseId) => {
        try {
            const dataToSend = { ...editedRowData };
            dataToSend.test_data_json = dataToSend.test_data;
            
            const response = await fetch(`${BACKEND_URL}/api/test-cases/${caseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSend),
            });
            const updatedTestCase = await response.json();
            if (!response.ok) throw new Error(updatedTestCase.error || "Failed to save changes.");

            const updateSuggestions = (currentSuggestions) => {
                if (!currentSuggestions) return [];
                const updater = (tc) => tc.id === updatedTestCase.id ? updatedTestCase : tc;
                if (isNestedStructure(currentSuggestions)) {
                    return currentSuggestions.map(scenario => ({
                        ...scenario,
                        positive_test_cases: (scenario.positive_test_cases || []).map(updater),
                        negative_test_cases: (scenario.negative_test_cases || []).map(updater),
                    }));
                } else {
                    return currentSuggestions.map(updater);
                }
            };
            setSuggestions(updateSuggestions(suggestions));
            handleCancelClick();
        } catch (err) {
            setError(err.message);
        }
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
                                    <TestCaseTable 
                                        testCases={scenario.positive_test_cases}
                                        handleDeleteTestCase={handleDeleteTestCase} 
                                        {...{ editingRowId, editedRowData, hoveredRowId, setHoveredRowId, handleEditClick, handleSaveClick, handleCancelClick, handleEditChange, handleEditStepsChange, automatedTestCaseIds }}
                                    />
                                    <h4 className="table-type-header type-negative"><FaMinusCircle className="icon" />Negative Test Cases</h4>
                                    <TestCaseTable 
                                        testCases={scenario.negative_test_cases}
                                        handleDeleteTestCase={handleDeleteTestCase} 
                                        {...{ editingRowId, editedRowData, hoveredRowId, setHoveredRowId, handleEditClick, handleSaveClick, handleCancelClick, handleEditChange, handleEditStepsChange, automatedTestCaseIds }}
                                    />
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