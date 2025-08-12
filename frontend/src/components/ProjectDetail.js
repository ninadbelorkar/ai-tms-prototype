// File: frontend/src/components/ProjectDetail.js (FINAL, COMPLETE, AND CORRECTED)

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

// Import all the feature components that will be displayed on this page
import Dashboard from './Dashboard';
import UserInput from './UserInput';
// import FigmaInput from './FigmaInput'; // This is now being used
import TestResults from './TestResults';

function ProjectDetail() {
    const { projectId } = useParams(); // Gets the project ID from the URL
    const [project, setProject] = useState(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    // --- STATE FOR THE GENERATION WORKFLOW ---
    const [userStoriesText, setUserStoriesText] = useState(''); // Holds formatted text for the AI
    const [jiraIssues, setJiraIssues] = useState([]); // Holds raw issue objects for logging
    // const [figmaData, setFigmaData] = useState(null); // Holds data from Figma analysis
    const [aiResponse, setAiResponse] = useState(null); // Holds the final AI test case result
    const [isGenerating, setIsGenerating] = useState(false);

    // --- DATA FETCHING ---
    // We wrap fetchProjectData in useCallback to create a stable function reference
    // This function will be the single source of truth for reloading project data
    const fetchProjectData = useCallback(async () => {
        // Don't show the main full-page loader on a refetch, only on initial load
        // setIsLoading(true); 
        try {
            const response = await api.get(`/api/projects/${projectId}`);
            setProject(response.data);
            setError('');
        } catch (err) {
            if (err.response && err.response.status === 401) navigate('/login');
            else setError("Could not fetch project details. The project may not exist or you may not have permission.");
        } finally {
            setIsLoading(false);
        }
    }, [projectId, navigate]);

    // This useEffect hook runs only when the component mounts or the projectId changes
    useEffect(() => {
        fetchProjectData();
    }, [fetchProjectData]); // The dependency is the stable useCallback function

    
    // --- HANDLERS FOR CHILD COMPONENTS ---
    // This function is called by UserInput whenever stories are fetched or typed
    const handleStoriesReady = (issues, text) => {
        setJiraIssues(issues); // Save the raw issue objects
        setUserStoriesText(text); // Save the formatted text
    };
    
    // This function can be called by FigmaInput
    // const handleFigmaReady = (figmaAnalysisData) => {
    //     setFigmaData(figmaAnalysisData);
    // };

    const handleGenerateTests = async () => {
        if (!userStoriesText.trim()) {
            setError("Please provide user stories from Jira or manually before generating.");
            return;
        }
        setIsGenerating(true);
        setError('');
        setAiResponse(null);

        try {
            // Call the consolidated backend endpoint
            const response = await api.post(`/api/project/${projectId}/generate-test-cases`, {
                requirements_text: userStoriesText,
                source_description: "Jira User Stories",
                jira_issues: jiraIssues, // Send the raw issue data for logging
                // You can add figmaData here in the future
            });
            
            // Set the AI response to be displayed by the TestResults component
            setAiResponse(response.data);
            
            // CRITICAL: After successful generation, refetch all project data
            // This will automatically update the Dashboard and other components
            await fetchProjectData();

        } catch (err) {
            setError(err.response?.data?.error || "Failed to generate test cases.");
        } finally {
            setIsGenerating(false);
        }
    };

    if (isLoading) return <p className="loading-indicator">Loading Project Details...</p>;
    if (error && !project) return <p className="error" style={{textAlign: 'center'}}>{error}</p>; // Show a full-page error if project fails to load
    if (!project) return <p style={{textAlign: 'center'}}>Project not found.</p>;

    return (
        <div className="project-detail-container">
            <div style={{ marginBottom: '20px', fontSize: '1.1rem' }}>
                <Link to="/">&larr; Back to All Projects</Link>
            </div>
            
            <Dashboard projectData={project} onDataChange={fetchProjectData} />
            <hr />

            {/* Step 1: User provides stories via Jira or Manual input */}
            <UserInput onStoriesReady={handleStoriesReady} />
            <hr/>
            
            {/* Step 2 (Optional) - Placeholder for Figma
            <FigmaInput onFigmaReady={handleFigmaReady} />
            <hr/> */}

            {/* Step 3: Generation Button */}
            <div className="component-section">
                <h2>3. Generate Test Cases</h2>
                <p>Once you have fetched or entered user stories above, you can generate the test cases.</p>
                <button onClick={handleGenerateTests} disabled={isGenerating || !userStoriesText.trim()}>
                    {isGenerating ? 'Generating...' : 'Generate Test Cases'}
                </button>
            </div>
            
            {/* Display any errors from the generation step */}
            {error && <p className="error">{error}</p>}

            {/* Step 4: Display Results */}
            {aiResponse && (
                <TestResults 
                    aiResponse={aiResponse} 
                    projectId={projectId}
                    onDataChange={fetchProjectData} 
                />
            )}
        </div>
    );
}

export default ProjectDetail;