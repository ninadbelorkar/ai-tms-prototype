// File: frontend/src/components/JiraInput.js (NEW FILE)

import React, { useState, useEffect } from 'react';
import api from '../services/api';

// This component receives a function prop 'onStoriesFetched' to pass the selected stories to its parent
function JiraInput({ onStoriesFetched }) {
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState('');
    const [issues, setIssues] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Fetch Jira projects when the component loads
    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const response = await api.get('/api/jira/projects');
                setProjects(response.data);
            } catch (err) {
                setError(err.response?.data?.error || "Failed to fetch Jira projects.");
            }
        };
        fetchProjects();
    }, []);

    const handleProjectChange = async (projectKey) => {
        setSelectedProject(projectKey);
        if (!projectKey) {
            setIssues([]);
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const response = await api.post('/api/jira/issues', { project_key: projectKey });
            setIssues(response.data);
            // Pass the fetched stories up to the parent component
            onStoriesFetched(response.data);
        } catch (err) {
            setError(err.response?.data?.error || "Failed to fetch issues.");
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="component-section">
            <h2>1. Select User Stories from Jira</h2>
            <div className="form-group">
                <label htmlFor="jiraProject">Select Jira Project:</label>
                <select 
                    id="jiraProject" 
                    value={selectedProject} 
                    onChange={(e) => handleProjectChange(e.target.value)}
                >
                    <option value="">-- Select a Project --</option>
                    {projects.map(p => (
                        <option key={p.key} value={p.key}>{p.name}</option>
                    ))}
                </select>
            </div>
            {isLoading && <p className="loading-indicator">Fetching issues...</p>}
            {error && <p className="error">{error}</p>}

            {/* We can display the fetched issues here for user confirmation */}
            {issues.length > 0 && (
                <div className="issue-list">
                    <h4>Fetched Stories/Tasks:</h4>
                    <ul>
                        {issues.map(issue => (
                            <li key={issue.key}><strong>{issue.key}:</strong> {issue.summary}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

export default JiraInput;