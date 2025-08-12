// File: frontend/src/components/UserInput.js (FINAL AND CORRECTED)

import React, { useState, useEffect } from 'react';
import api from '../services/api';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

// This component handles BOTH Jira and Manual user story input.
// It passes the raw issues array AND the formatted text up to its parent.
function UserInput({ userStoriesText, onStoriesReady }) {
    const [inputType, setInputType] = useState('jira');
    
    // State for Jira Input
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState('');
    const [issues, setIssues] = useState([]);
    const [isJiraAuthenticated, setIsJiraAuthenticated] = useState(false);
    
    const [isLoading, setIsLoading] = useState(false); // For fetching issues
    const [isCheckingAuth, setIsCheckingAuth] = useState(true); // For the initial check
    const [error, setError] = useState('');

    const handleJiraConnect = () => {
        const token = localStorage.getItem('access_token');
        if (token) {
            window.location.href = `${BACKEND_URL}/api/jira/auth?jwt=${token}`;
        } else {
            alert("Authentication error. Please log in again.");
        }
    };
    
    useEffect(() => {
        const checkJiraAuthAndFetchProjects = async () => {
            setIsCheckingAuth(true);
            setError('');
            try {
                const response = await api.get('/api/jira/projects');
                setProjects(response.data);
                if (response.data && response.data.length >= 0) {
                    setIsJiraAuthenticated(true);
                }
            } catch (err) {
                if (err.response && err.response.status === 401) {
                    setIsJiraAuthenticated(false);
                } else {
                    setError(err.response?.data?.error || "An error occurred while checking Jira connection.");
                }
            } finally {
                setIsCheckingAuth(false);
            }
        };
        checkJiraAuthAndFetchProjects();
    }, []);

    const handleProjectChange = async (projectKey) => {
        setSelectedProject(projectKey);
        if (!projectKey) {
            setIssues([]);
            onStoriesReady([], ''); // Pass both arguments
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const response = await api.post('/api/jira/issues', { project_key: projectKey });
            const fetchedIssues = response.data;
            setIssues(fetchedIssues);
            const storiesText = fetchedIssues.map(s => `Story (${s.key}): ${s.summary}\n${s.description || ''}`).join('\n\n');
            // FIX: Pass BOTH the raw issues array AND the formatted text
            onStoriesReady(fetchedIssues, storiesText);
        } catch (err) {
            setError(err.response?.data?.error || "Failed to fetch issues.");
            onStoriesReady([], ''); // Pass both arguments
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleManualTextChange = (e) => {
        const text = e.target.value;
        // FIX: Pass BOTH arguments. For manual input, the issues array is empty.
        onStoriesReady([], text);
    };

    const handleInputTypeChange = (type) => {
        setInputType(type);
        if (type === 'jira') {
            const storiesTextFromIssues = issues.map(s => `Story (${s.key}): ${s.summary}\n${s.description || ''}`).join('\n\n');
            // FIX: Pass BOTH the existing issues array AND the formatted text
            onStoriesReady(issues, storiesTextFromIssues);
        } else { // Switching to manual
            setSelectedProject('');
            setIssues([]);
            // FIX: Pass BOTH arguments. An empty array for issues and the current text from props.
            onStoriesReady([], userStoriesText);
        }
    };
    
    const renderJiraContent = () => {
        if (isCheckingAuth) {
            return <p className="loading-indicator">Checking Jira connection...</p>;
        }
        if (!isJiraAuthenticated) {
            return (
                <div className="form-group jira-connect">
                    <p>You need to connect your Jira account to fetch projects.</p>
                    <button type="button" onClick={handleJiraConnect} className="jira-connect-btn">
                        Connect to Jira
                    </button>
                </div>
            );
        }
        return (
            <div className="form-group">
                <label htmlFor="jiraProject">Select Jira Project:</label>
                <select 
                    id="jiraProject" 
                    value={selectedProject} 
                    onChange={(e) => handleProjectChange(e.target.value)}
                    disabled={projects.length === 0 || isLoading}
                >
                    <option value="">-- Select a Project --</option>
                    {projects.map(p => (
                        <option key={p.key} value={p.key}>{p.name} ({p.key})</option>
                    ))}
                </select>
            </div>
        );
    };

    return (
        <div className="component-section">
            <h2>1. Provide User Stories</h2>
            
            <div className="form-group">
                <label>Input Method:</label>
                <div className="radio-group">
                    <label className="radio-label">
                        <input type="radio" value="jira" checked={inputType === 'jira'} onChange={() => handleInputTypeChange('jira')} />
                        Fetch from Jira
                    </label>
                    <label className="radio-label">
                        <input type="radio" value="manual" checked={inputType === 'manual'} onChange={() => handleInputTypeChange('manual')} />
                        Enter Manually
                    </label>
                </div>
            </div>

            {inputType === 'jira' && renderJiraContent()}

            {inputType === 'manual' && (
                <div className="form-group">
                    <label htmlFor="manualStories">Paste User Stories:</label>
                    <textarea 
                        id="manualStories"
                        value={userStoriesText}
                        onChange={handleManualTextChange}
                        rows={10}
                        placeholder="Paste one or more user stories here..."
                    />
                </div>
            )}
            
            {isLoading && <p className="loading-indicator">Fetching issues...</p>}
            
            {issues.length > 0 && !isLoading && (
                <div className="issue-list">
                    <h4>Fetched Stories/Tasks for "{selectedProject}":</h4>
                    <ul>
                        {issues.map(issue => (
                            <li key={issue.key}>
                                <strong>{issue.key} ({issue.issue_type}):</strong> {issue.summary}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            
            {error && <p className="error" style={{ marginTop: '15px' }}>{error}</p>}
        </div>
    );
}

export default UserInput;