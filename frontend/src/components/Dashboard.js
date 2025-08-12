// File: frontend/src/components/Dashboard.js (FINAL AND CORRECTED)

import React, { useState, useEffect } from 'react';
import api from '../services/api';
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

// The Dashboard component receives its data via props from a parent (like ProjectDetail)
function Dashboard({ projectData, onDataChange }) {
    
    // This local state will hold the dashboard-specific part of the project data.
    // It allows us to perform "optimistic UI updates" (like deleting an item) without a full page refetch.
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(''); // Local error state for dashboard actions

    // This effect is crucial. It syncs the local 'stats' state
    // whenever the parent 'projectData' prop changes (e.g., after a refetch).
    useEffect(() => {
        if (projectData && projectData.dashboard_stats) {
            setStats(projectData.dashboard_stats);
        }
    }, [projectData]);

    // If the stats haven't been loaded yet from the parent, show a loading state.
    if (!stats) {
        return (
            <div className="dashboard-container">
                <h2>Project Dashboard: {projectData.name}</h2>
                <p className="loading-indicator">Loading dashboard widgets...</p>
            </div>
        );
    }

    // --- Chart Configuration ---
    const chartData = {
        labels: stats.severity_chart.labels,
        datasets: [{
            label: 'Test Cases by Severity',
            data: stats.severity_chart.data,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
        }],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'top',
            },
            title: {
                display: false,
            },
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    precision: 0, // Ensures y-axis has whole numbers
                },
                suggestedMax: Math.max(...(stats.severity_chart.data || [0])) + 2,
            },
        },
    };
    
    // --- Delete Handlers ---
    const handleDeleteAnalysis = async (analysisId) => {
        if (!window.confirm("Are you sure you want to delete this analysis? This action cannot be undone.")) {
            return;
        }
        try {
            await api.delete(`/api/ai-analyses/${analysisId}`);
            
            // Optimistic UI Update: Update state locally for instant feedback
            setStats(prevStats => {
                const newRecentAnalyses = prevStats.recent_analyses.filter(a => a.id !== analysisId);
                const newKeyMetrics = { ...prevStats.key_metrics };

                const deletedAnalysis = prevStats.recent_analyses.find(a => a.id === analysisId);
                if (deletedAnalysis) {
                    if (deletedAnalysis.analysis_type === 'defect') {
                        newKeyMetrics.total_defect_analyses = Math.max(0, newKeyMetrics.total_defect_analyses - 1);
                    } else if (deletedAnalysis.analysis_type === 'automation') {
                         newKeyMetrics.total_automation_analyses = Math.max(0, newKeyMetrics.total_automation_analyses - 1);
                    }
                }
                return { ...prevStats, recent_analyses: newRecentAnalyses, key_metrics: newKeyMetrics };
            });
        
        } catch (err) {
            setError(err.response?.data?.error || "Failed to delete analysis.");
            // If the delete fails, we ask the parent to refetch to get the true state
            onDataChange();
        }
    };

    const handleDeleteGeneration = async (generationId) => {
        if (!window.confirm("Are you sure you want to delete this entire batch of test cases? This is irreversible.")) {
            return;
        }
        try {
            await api.delete(`/api/test-case-generations/${generationId}`);
            
            // REFETCH all data from the parent to ensure total consistency across all widgets
            // This is the simplest and most reliable method after a major change.
            onDataChange();
            
        } catch (err) {
            setError(err.response?.data?.error || "Failed to delete generation event.");
        }
    };

    return (
        <div className="dashboard-container">
            <h2>Project Dashboard: {projectData.name}</h2>
            {error && <p className="error" style={{marginTop: '15px'}}>{error}</p>}
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
                    <div className="chart-container">
                        {stats.severity_chart && stats.severity_chart.labels && stats.severity_chart.labels.length > 0 ? (
                            <Bar data={chartData} options={chartOptions} />
                        ) : (
                            <p style={{textAlign: 'center', color: '#6c757d', marginTop: '40px'}}>
                                No severity data available to display chart.
                            </p>
                        )}
                    </div>
                </div>

                {/* Recent Analyses Widget */}
                <div className="widget-card recent-analyses-card">
                    <h3>Recent AI Analyses</h3>
                    {stats.recent_analyses && stats.recent_analyses.length > 0 ? (
                        <table>
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Source Info</th>
                                    <th>Date</th>
                                    <th>Actions</th>
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
                    ) : (
                        <p>No recent AI analyses found for this project.</p>
                    )}
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
                                            <td>{new Date(gen.created_at).toLocaleString(undefined, {
                                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                                    hour: '2-digit', minute: '2-digit', hour12: true
                                                })}</td>
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
                            <p>No test cases have been generated for this project yet.</p>
                        )}
                </div>
            </div>
        </div>
    );
}

export default Dashboard;



// File: frontend/src/components/Dashboard.js (FINAL AND COMPLETE - Based on your 250-line version)

// import React, { useState, useEffect } from 'react';
// import api from '../services/api'; // Using the central api service is correct
// import { useNavigate } from 'react-router-dom'; // Keep navigate for auth errors
// import { Bar } from 'react-chartjs-2';
// import { format } from 'date-fns';
// import { FaTrash } from 'react-icons/fa'; 
// import {
//   Chart as ChartJS,
//   CategoryScale,
//   LinearScale,
//   BarElement,
//   Title,
//   Tooltip,
//   Legend,
// } from 'chart.js';

// ChartJS.register(
//   CategoryScale,
//   LinearScale,
//   BarElement,
//   Title,
//   Tooltip,
//   Legend
// );

// // The Dashboard component needs to know WHICH project's stats to fetch.
// // It receives projectId from its parent (ProjectDetail).
// function Dashboard({ projectId }) {
//     const [stats, setStats] = useState(null);
//     const [error, setError] = useState('');
//     const [isLoading, setIsLoading] = useState(true);
//     const navigate = useNavigate();

//     // This function can be called to fetch or refetch the stats for the CURRENT project.
//     const fetchStats = async () => {
//         if (!projectId) return; // Don't fetch if there's no project ID
        
//         setIsLoading(true);
//         try {
//             // FIX: Use the project-specific dashboard URL
//             const response = await api.get(`/api/project/${projectId}/dashboard-stats`);
//             setStats(response.data);
//             setError(''); // Clear previous errors on success
//         } catch (err) {
//             if (err.response && err.response.status === 401) {
//                 navigate('/login');
//             } else {
//                 setError(err.response?.data?.error || "Failed to fetch dashboard stats.");
//             }
//         } finally {
//             setIsLoading(false);
//         }
//     };

//     // useEffect now depends on projectId. If the user navigates to a new project,
//     // this will automatically refetch the stats for the new project.
//     useEffect(() => {
//         fetchStats();
//         // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, [projectId]);

//     if (isLoading) return <p className="loading-indicator">Loading Dashboard...</p>;
//     if (error) return <p className="error">Error: {error}</p>;
//     if (!stats) return <p>No dashboard data available.</p>;

//     const chartData = {
//         labels: stats.severity_chart.labels,
//         datasets: [{
//             label: 'Test Cases by Severity',
//             data: stats.severity_chart.data,
//             backgroundColor: 'rgba(54, 162, 235, 0.6)',
//             borderColor: 'rgba(54, 162, 235, 1)',
//             borderWidth: 1,
//         }],
//     };
    
//     const chartOptions = {
//         responsive: true,
//         maintainAspectRatio: false,
//         plugins: {
//             legend: {
//                 display: true,
//                 position: 'top',
//             },
//             title: {
//                 display: false,
//             },
//         },
//         scales: {
//             y: {
//                 beginAtZero: true,
//                 ticks: {
//                     precision: 0,
//                 },
//                 suggestedMax: Math.max(...(stats.severity_chart.data || [0])) + 2,
//             },
//         },
//     };

//     const handleDeleteAnalysis = async (analysisId) => {
//         if (!window.confirm("Are you sure you want to delete this analysis? This action cannot be undone.")) {
//             return;
//         }
//         try {
//             // FIX: The delete URL must also be project-specific
//             await api.delete(`/api/project/${projectId}/ai-analyses/${analysisId}`);
//             fetchStats(); // Refetch all data to update the UI correctly
//         } catch (err) {
//             setError(err.response?.data?.error || "Failed to delete analysis.");
//         }
//     };

//     const handleDeleteGeneration = async (generationId) => {
//         if (!window.confirm("Are you sure you want to delete this entire batch of test cases?")) {
//             return;
//         }
//         try {
//             // FIX: The delete URL must also be project-specific
//             await api.delete(`/api/project/${projectId}/test-case-generations/${generationId}`);
//             fetchStats(); // Refetch all data to update the UI correctly
//         } catch (err) {
//             setError(err.response?.data?.error || "Failed to delete generation event.");
//         }
//     };

//     return (
//         <div className="dashboard-container">
//             <h2>Project Dashboard</h2>
//             <div className="widgets-grid">
//                 {/* Key Metrics Widget */}
//                 <div className="widget-card">
//                     <h3>Key Metrics</h3>
//                     <div className="metric-item">
//                         <span>Total Test Cases</span>
//                         <strong>{stats.key_metrics.total_test_cases}</strong>
//                     </div>
//                     <div className="metric-item">
//                         <span>Defect Analyses</span>
//                         <strong>{stats.key_metrics.total_defect_analyses}</strong>
//                     </div>
//                      <div className="metric-item">
//                         <span>Automation Analyses</span>
//                         <strong>{stats.key_metrics.total_automation_analyses}</strong>
//                     </div>
//                 </div>

//                 {/* Severity Chart Widget */}
//                 <div className="widget-card chart-card">
//                     <h3>Test Cases by Severity</h3>
//                     <div className="chart-container">
//                         {stats.severity_chart && stats.severity_chart.labels && stats.severity_chart.labels.length > 0 ? (
//                             <Bar data={chartData} options={chartOptions} />
//                         ) : (
//                             <p style={{textAlign: 'center', color: '#6c757d', marginTop: '40px'}}>
//                                 No severity data available to display chart.
//                             </p>
//                         )}
//                     </div>
//                 </div>

//                 {/* Recent Analyses Widget */}
//                 <div className="widget-card recent-analyses-card">
//                     <h3>Recent AI Analyses</h3>
//                     {stats.recent_analyses && stats.recent_analyses.length > 0 ? (
//                         <table>
//                             <thead>
//                                 <tr>
//                                     <th>Type</th>
//                                     <th>Source Info</th>
//                                     <th>Date</th>
//                                     <th>Actions</th>
//                                 </tr>
//                             </thead>
//                             <tbody>
//                                 {stats.recent_analyses.map(analysis => (
//                                     <tr key={analysis.id}>
//                                         <td>{analysis.analysis_type}</td>
//                                         <td>{analysis.source_info}</td>
//                                         <td>{format(new Date(analysis.created_at), 'dd/MM/yyyy, pp')}</td>
//                                         <td>
//                                             <button 
//                                                 className="delete-button" 
//                                                 onClick={() => handleDeleteAnalysis(analysis.id)}
//                                                 title="Delete Analysis"
//                                             >
//                                                 <FaTrash />
//                                             </button>
//                                         </td>
//                                     </tr>
//                                 ))}
//                             </tbody>
//                         </table>
//                     ) : (
//                         <p>No recent AI analyses found for this project.</p>
//                     )}
//                 </div>

//                 <div className="widget-card recent-generations-card">
//                         <h3>Recent Test Case Generations</h3>
//                         {stats.recent_generations && stats.recent_generations.length > 0 ? (
//                             <table>
//                                 <thead>
//                                     <tr>
//                                         <th>Source</th>
//                                         <th># Cases</th>
//                                         <th>Date</th>
//                                         <th>Actions</th>
//                                     </tr>
//                                 </thead>
//                                 <tbody>
//                                     {stats.recent_generations.map(gen => (
//                                         <tr key={gen.id}>
//                                             <td>{gen.source_type}</td>
//                                             <td>{gen.test_case_count}</td>
//                                             <td>{format(new Date(gen.created_at), 'dd/MM/yyyy, pp')}</td>
//                                             <td>
//                                                 <button 
//                                                     className="delete-button" 
//                                                     onClick={() => handleDeleteGeneration(gen.id)}
//                                                     title="Delete this batch of test cases"
//                                                 >
//                                                     <FaTrash />
//                                                 </button>
//                                             </td>
//                                         </tr>
//                                     ))}
//                                 </tbody>
//                             </table>
//                         ) : (
//                             <p>No test cases have been generated for this project yet.</p>
//                         )}
//                 </div>
//             </div>
//         </div>
//     );
// }

// export default Dashboard;