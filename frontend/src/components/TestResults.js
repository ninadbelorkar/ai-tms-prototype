// File: frontend/src/components/TestResults.js (COMPLETE AND FINAL VERSION)

import React, { useState, useEffect } from 'react';
import { FaCopy, FaStar, FaFileExcel, FaPlusCircle, FaMinusCircle, FaEdit, FaSave, FaTimes, FaTrash } from 'react-icons/fa';
import { copyToClipboard } from '../utils/clipboardUtils';
import * as XLSX from 'xlsx';
import api from '../services/api';

// --- HELPER FUNCTIONS (scoped to this file) ---
const isNestedStructure = (data) => Array.isArray(data) && data.length > 0 && data[0] && data[0].hasOwnProperty('scenario_title');
const groupTcsByScenario = (flatTcs) => {
    if (!flatTcs || !Array.isArray(flatTcs)) return [];
    const scenarios = {};
    flatTcs.forEach(tc => {
        const scenarioTitle = tc.scenario || "Uncategorized";
        if (!scenarios[scenarioTitle]) {
            scenarios[scenarioTitle] = { scenario_title: scenarioTitle, positive_test_cases: [], negative_test_cases: [] };
        }
        (tc.type && tc.type.toLowerCase() === 'negative' ? scenarios[scenarioTitle].negative_test_cases : scenarios[scenarioTitle].positive_test_cases).push(tc);
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

// --- SUB-COMPONENT: TestCaseTable ---
const TestCaseTable = ({ testCases, automatedTestCaseIds, editingRowId, editedRowData, hoveredRowId, setHoveredRowId, handleEditClick, handleSaveClick, handleCancelClick, handleEditChange, handleEditStepsChange, handleDeleteTestCase }) => {
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
                            <tr key={tc.id} className={isAutomatedCandidate ? 'automated-candidate' : ''} onMouseEnter={() => setHoveredRowId(tc.id)} onMouseLeave={() => setHoveredRowId(null)}>
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

// --- MAIN RESULTS COMPONENT ---
function TestResults({ aiResponse, projectId, onDataChange }) {
    // State for all the actions now lives here
    const [suggestions, setSuggestions] = useState(null);
    const [automatedTestCaseIds, setAutomatedTestCaseIds] = useState([]);
    const [isRawText, setIsRawText] = useState(false);
    const [editingRowId, setEditingRowId] = useState(null);
    const [editedRowData, setEditedRowData] = useState({});
    const [hoveredRowId, setHoveredRowId] = useState(null);
    const [copyStatus, setCopyStatus] = useState('');
    const [isAnalyzingAutomation, setIsAnalyzingAutomation] = useState(false);
    const [error, setError] = useState('');

    // Sync local state with the prop from the parent
    useEffect(() => {
        if (typeof aiResponse?.suggestions === 'string') {
            setSuggestions(aiResponse.suggestions);
            setIsRawText(true);
        } else if (Array.isArray(aiResponse?.suggestions)) {
            setSuggestions(aiResponse.suggestions);
            setIsRawText(false);
        } else {
            setSuggestions(null); // Clear if no valid response
        }
    }, [aiResponse]);

    // --- All handlers from TestCaseSuggester are now here ---
    const handleAutomationAnalysis = async () => {
        const allTestCases = getFlattenedTcs(suggestions);
        if (allTestCases.length === 0) {
            setError("No individual test cases found to analyze.");
            return;
        }
        setIsAnalyzingAutomation(true);
        setError('');
        try {
            const response = await api.post(`/api/project/${projectId}/analyze-for-automation`, { test_cases: allTestCases });
            const data = response.data;
            if (data.automation_analysis && data.automation_analysis.automated_test_case_ids) {
                setAutomatedTestCaseIds(data.automation_analysis.automated_test_case_ids);
            } else {
                if(data.warning) setError(data.warning);
                else setError("AI did not return a valid list of automation candidates.");
                setAutomatedTestCaseIds([]);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'An unknown error occurred during automation analysis.');
        } finally {
            setIsAnalyzingAutomation(false);
        }
    };
    
    const handleCopyOutput = () => {
        let textToCopy = "";
        if (isRawText || typeof suggestions === 'string') {
            textToCopy = suggestions;
        } else if (Array.isArray(suggestions)) {
            textToCopy = `AI Test Case Suggestions (${aiResponse.source || 'N/A'}):\n\n`;
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
        setEditedRowData({ ...testCase, test_data: renderTestData(testCase.test_data_json) });
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

    const handleSaveClick = async (caseId) => {
        try {
            const response = await api.put(`/api/project/${projectId}/test-cases/${caseId}`, editedRowData);
            const updatedTestCase = response.data;
            
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
            setError(err.response?.data?.error || "Failed to save changes.");
        }
    };

    const handleDeleteTestCase = async (caseIdToDelete) => {
        if (!window.confirm("Are you sure? This will permanently delete the test case.")) return;
        try {
            await api.delete(`/api/project/${projectId}/test-cases/${caseIdToDelete}`);
            onDataChange(); // Tell parent to refetch all project data
        } catch (err) {
            setError(err.response?.data?.error || "Failed to delete test case.");
        }
    };
    
    if (!suggestions) return null; // Don't render anything if there's no response yet

    return (
        <div className="component-section results">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3>AI Suggestions</h3>
                <div className="results-actions-container">
                    {!isRawText && Array.isArray(suggestions) && suggestions.length > 0 && (
                        <button onClick={handleAutomationAnalysis} className="results-action-button" disabled={isAnalyzingAutomation}>
                            {isAnalyzingAutomation ? 'Analyzing...' : 'Analyze for Automation'}
                        </button>
                    )}
                    <button onClick={handleCopyOutput} className="results-action-button"><FaCopy /> {copyStatus || 'Copy'}</button>
                    {!isRawText && Array.isArray(suggestions) && suggestions.length > 0 && (
                        <button onClick={handleExportToExcel} className="results-action-button"><FaFileExcel /> Export to Excel</button>
                    )}
                </div>
            </div>
            {aiResponse?.source && <p style={{ fontSize: '0.9em', fontStyle: 'italic' }}>Source: {aiResponse.source}</p>}
            {error && <p className="error">{error}</p>}

            {isRawText ? ( <pre>{suggestions}</pre> ) : (
                <div className="scenarios-container">
                    {(isNestedStructure(suggestions) ? suggestions : groupTcsByScenario(suggestions)).map((scenario, index) => (
                        <div key={index} className="scenario-block">
                            <h3>{scenario.scenario_title}</h3>
                            <h4 className="table-type-header type-positive"><FaPlusCircle className="icon" />Positive Test Cases</h4>
                            <TestCaseTable 
                                testCases={scenario.positive_test_cases} 
                                {...{ editingRowId, editedRowData, hoveredRowId, setHoveredRowId, handleEditClick, handleSaveClick, handleCancelClick, handleEditChange, handleEditStepsChange, automatedTestCaseIds, handleDeleteTestCase }}
                            />
                            <h4 className="table-type-header type-negative"><FaMinusCircle className="icon" />Negative Test Cases</h4>
                            <TestCaseTable 
                                testCases={scenario.negative_test_cases}
                                {...{ editingRowId, editedRowData, hoveredRowId, setHoveredRowId, handleEditClick, handleSaveClick, handleCancelClick, handleEditChange, handleEditStepsChange, automatedTestCaseIds, handleDeleteTestCase }}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default TestResults;