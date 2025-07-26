// File: frontend/src/components/Dashboard.js (NEW FILE)

import React, { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import { format } from 'date-fns';
import { FaTrash } from 'react-icons/fa'; 
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

function Dashboard() {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await fetch(`${BACKEND_URL}/api/dashboard-stats`);
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || "Failed to fetch stats.");
                setStats(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
    }, []); // Empty array means this runs once on component mount

    if (isLoading) return <p className="loading-indicator">Loading Dashboard...</p>;
    if (error) return <p className="error">Error: {error}</p>;
    if (!stats) return <p>No dashboard data available.</p>;

    const chartData = {
        labels: stats.severity_chart.labels,
        datasets: [{
            label: 'Test Cases by Severity',
            data: stats.severity_chart.data,
            backgroundColor: 'rgba(0, 123, 255, 0.6)',
            borderColor: 'rgba(0, 123, 255, 1)',
            borderWidth: 1,
        }],
    };

    const handleDeleteAnalysis = async (analysisId) => {
        if (!window.confirm("Are you sure you want to delete this analysis? This action cannot be undone.")) {
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/ai-analyses/${analysisId}`, {
                method: 'DELETE',
            });

            // Check if the response is JSON before trying to parse it
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || "Failed to delete the analysis.");
                }
            } else {
                // If it's not JSON, it's likely an HTML error page
                if (!response.ok) {
                     const text = await response.text();
                     console.error("Server returned non-JSON error:", text);
                     throw new Error(`Server error: ${response.status} ${response.statusText}`);
                }
            }
        
            // If successful, update the state to remove the item from the UI
            setStats(prevStats => {
                const newRecentAnalyses = prevStats.recent_analyses.filter(a => a.id !== analysisId);
                const newKeyMetrics = { ...prevStats.key_metrics };

                // Find the type of the deleted analysis to decrement the correct counter
                const deletedAnalysis = prevStats.recent_analyses.find(a => a.id === analysisId);
                if (deletedAnalysis) {
                    if (deletedAnalysis.analysis_type === 'defect') {
                        newKeyMetrics.total_defect_analyses = Math.max(0, newKeyMetrics.total_defect_analyses - 1);
                    } else if (deletedAnalysis.analysis_type === 'automation') {
                         newKeyMetrics.total_automation_analyses = Math.max(0, newKeyMetrics.total_automation_analyses - 1);
                    }
                }

                return {
                    ...prevStats,
                    recent_analyses: newRecentAnalyses,
                    key_metrics: newKeyMetrics,
                };
            });
        
        } catch (err) {
            setError(err.message); // Display a user-friendly error
        }
    };

    const handleDeleteGeneration = async (generationId) => {
        if (!window.confirm("Are you sure you want to delete this entire batch of test cases?")) {
            return;
        }
        try {
            const response = await fetch(`${BACKEND_URL}/api/test-case-generations/${generationId}`, {
                method: 'DELETE',
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to delete generation event.");
            
            // Refetch all stats from the server to get updated counts and lists
            // This is the simplest way to ensure all dashboard widgets are in sync
            setIsLoading(true);
            const refetchResponse = await fetch(`${BACKEND_URL}/api/dashboard-stats`);
            const refetchedData = await refetchResponse.json();
            setStats(refetchedData);
            
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false); // Make sure to handle loading state
        }
    };

    return (
        <div className="dashboard-container">
            <h2>Project Dashboard</h2>
            <div className="widgets-grid">
                {/* Key Metrics Widget */}
                <div className="widget-card">
                    <h3>Key Metrics</h3>
                    <div className="metric-item">
                        <span>Total Test Cases</span>
                        <strong>{stats.key_metrics.total_test_cases}</strong>
                    </div>
                    <div className="metric-item">
                        <span>Defect Analyses</span>
                        <strong>{stats.key_metrics.total_defect_analyses}</strong>
                    </div>
                     <div className="metric-item">
                        <span>Automation Analyses</span>
                        <strong>{stats.key_metrics.total_automation_analyses}</strong>
                    </div>
                </div>

                {/* Severity Chart Widget */}
                <div className="widget-card chart-card">
                    <h3>Test Cases by Severity</h3>
                    <Bar data={chartData} options={{ responsive: true }} />
                </div>

                {/* Recent Analyses Widget */}
                <div className="widget-card recent-analyses-card">
                    <h3>Recent AI Analyses</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Source Info</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.recent_analyses.map(analysis => (
                                <tr key={analysis.id}>
                                    <td>{analysis.analysis_type}</td>
                                    <td>{analysis.source_info}</td>
                                    <td>{format(new Date(analysis.created_at), 'dd/MM/yyyy, p')}</td>
                                    <td>
                                    <button 
                                        className="delete-button" 
                                        onClick={() => handleDeleteAnalysis(analysis.id)}
                                        title="Delete Analysis"
                                    >
                                        <FaTrash />
                                    </button>
                                </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="widget-card recent-generations-card">
                        <h3>Recent Test Case Generations</h3>
                        {stats.recent_generations && stats.recent_generations.length > 0 ? (
                            <table>
                                <thead>
                                    <tr>
                                        <th>Source</th>
                                        <th># Cases</th>
                                        <th>Date</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.recent_generations.map(gen => (
                                        <tr key={gen.id}>
                                            <td>{gen.source_type}</td>
                                            <td>{gen.test_case_count}</td>
                                            <td>{format(new Date(gen.created_at), 'dd/MM/yyyy, p')}</td>
                                            <td>
                                                <button 
                                                    className="delete-button" 
                                                    onClick={() => handleDeleteGeneration(gen.id)}
                                                    title="Delete this batch of test cases"
                                                >
                                                    <FaTrash />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p>No test cases have been generated yet.</p>
                        )}
                </div>
            </div>
        </div>
    );
}

export default Dashboard;