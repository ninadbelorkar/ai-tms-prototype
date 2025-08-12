// File: frontend/src/components/ProjectList.js (NEW FILE)

import React, { useState, useEffect } from 'react';
import api from '../services/api'; // Use our central api service
import { Link, useNavigate } from 'react-router-dom';

function ProjectList() {
    const [projects, setProjects] = useState([]);
    const [newProjectName, setNewProjectName] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [username, setUsername] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch profile to get username for the welcome message
                const profileResponse = await api.get('/api/auth/profile');
                setUsername(profileResponse.data.username);

                // Fetch the user's projects
                const projectsResponse = await api.get('/api/projects');
                setProjects(projectsResponse.data);
            } catch (err) {
                if (err.response && err.response.status === 401) {
                    navigate('/login');
                } else {
                    setError("Could not fetch project data. Please try refreshing the page.");
                }
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [navigate]);

    const handleCreateProject = async (e) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;
        try {
            const response = await api.post('/api/projects', { name: newProjectName });
            setProjects([response.data, ...projects]);
            setNewProjectName('');
            setError('');
        } catch (err) {
            setError(err.response?.data?.error || "Failed to create project.");
        }
    };

    if (isLoading) return <p className="loading-indicator">Loading Projects...</p>;
    if (error) return <p className="error">{error}</p>;

    return (
        <div className="dashboard-container">
            {username && <h2 className="welcome-message">Welcome, {username}!</h2>}
            
            <div className="component-section create-project-form">
                <h3>Create a New Project</h3>
                <form onSubmit={handleCreateProject}>
                    <div className="form-group">
                        <label htmlFor="projectName">Project Name</label>
                        <input 
                            type="text" 
                            id="projectName"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            placeholder="e.g., E-commerce Website Tests"
                            required
                        />
                    </div>
                    <button type="submit">Create Project</button>
                </form>
            </div>

            <div className="component-section project-list">
                <h3>Your Projects</h3>
                {projects.length > 0 ? (
                    <ul className="projects-ul">
                        {projects.map(project => (
                            <li key={project._id}>
                                {/* This link is the key part - it navigates to the detail page */}
                                <Link to={`/project/${project._id}`}>{project.name}</Link>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p>You haven't created any projects yet. Create one above to get started!</p>
                )}
            </div>
        </div>
    );
}

export default ProjectList;