// // // File: frontend/src/App.js (FINAL AND CORRECTED)

// // import React from 'react';
// // import { BrowserRouter as Router, Route, Routes, Navigate, Outlet, useLocation, Link } from 'react-router-dom';
// // import './App.css';

// // // --- Import ALL your components ---
// // import TestCaseSuggester from './components/TestCaseSuggester';
// // import DefectAnalyzer from './components/DefectAnalyzer';
// // import AutomationRecommender from './components/AutomationRecommender';
// // import CodeChangeAnalyzer from './components/CodeChangeAnalyzer';
// // import Dashboard from './components/Dashboard';
// // import Register from './components/auth/Register';
// // import Login from './components/auth/Login';

// // // Helper function to check for auth token in localStorage
// // const isAuthenticated = () => {
// //     return localStorage.getItem('access_token') !== null;
// // };

// // // Component to protect routes. If not logged in, redirects to /login
// // const ProtectedRoute = () => {
// //     const location = useLocation();
// //     // The Outlet component renders the child route's element (in our case, MainLayout)
// //     return isAuthenticated() ? <Outlet /> : <Navigate to="/login" state={{ from: location }} replace />;
// // };

// // // This component lays out your main application page, exactly as you had it.
// // // All child components will now be part of the protected route.
// // const MainLayout = () => (
// //     <>
// //         <Dashboard />
// //         <hr />
// //         <TestCaseSuggester />
// //         <hr />
// //         <DefectAnalyzer />
// //         <hr />
// //         <AutomationRecommender />
// //         <hr />
// //         <CodeChangeAnalyzer />
// //     </>
// // );

// // function App() {
// //     const handleLogout = () => {
// //         localStorage.removeItem('access_token');
// //         // A full page reload is a simple and effective way to clear all state and redirect
// //         window.location.href = '/login';
// //     };

// //     return (
// //         <Router>
// //             <div className="App">
// //                 <header className="App-header">
// //                     {/* Link the title back to the main page */}
// //                     <Link to="/" className="header-title-link">
// //                         <h1>AI-Integrated Test Case Management System</h1>
// //                     </Link>
// //                     {/* Show logout button only if authenticated */}
// //                     {isAuthenticated() && (
// //                         <button onClick={handleLogout} className="logout-button">Logout</button>
// //                     )}
// //                 </header>
// //                 <main>
// //                     <Routes>
// //                         {/* Public Routes for Login and Register. These are not protected. */}
// //                         <Route path="/login" element={<Login />} />
// //                         <Route path="/register" element={<Register />} />
                        
// //                         {/* Protected Route for the main application */}
// //                         <Route element={<ProtectedRoute />}>
// //                             {/* When a user is logged in and goes to "/", they will see the MainLayout */}
// //                             <Route path="/" element={<MainLayout />} />
// //                         </Route>
                        
// //                         {/* Fallback route: If user goes to any other URL, redirect them */}
// //                         <Route path="*" element={<Navigate to={isAuthenticated() ? "/" : "/login"} replace />} />
// //                     </Routes>
// //                 </main>
// //             </div>
// //         </Router>
// //     );
// // }

// // export default App;

// // File: frontend/src/App.js (FINAL, CORRECTED for Project-Based Routing)

// import React from 'react';
// import { BrowserRouter as Router, Route, Routes, Navigate, Outlet, useLocation, Link } from 'react-router-dom';
// import './App.css';

// // --- Import our "Page" level components ---
// import ProjectList from './components/ProjectList'; // The new home page for logged-in users
// import ProjectDetail from './components/ProjectDetail'; // The new page for a single project's details
// import Register from './components/auth/Register';
// import Login from './components/auth/Login';

// // Helper function to check for auth token in localStorage
// const isAuthenticated = () => {
//     return localStorage.getItem('access_token') !== null;
// };

// // Component to protect routes. If not logged in, redirects to /login
// const ProtectedRoute = () => {
//     const location = useLocation();
//     // The <Outlet /> component will render the matched child route element (ProjectList or ProjectDetail)
//     return isAuthenticated() ? <Outlet /> : <Navigate to="/login" state={{ from: location }} replace />;
// };

// function App() {
//     const handleLogout = () => {
//         localStorage.removeItem('access_token');
//         // A full page reload is a simple and effective way to clear all state and redirect
//         window.location.href = '/login';
//     };

//     return (
//         <Router>
//             <div className="App">
//                 <header className="App-header">
//                     {/* Link the title back to the projects list (the new home page) */}
//                     <Link to="/" className="header-title-link">
//                         <h1>AI-Integrated Test Case Management System</h1>
//                     </Link>
//                     {/* Show logout button only if authenticated */}
//                     {isAuthenticated() && (
//                         <button onClick={handleLogout} className="logout-button">Logout</button>
//                     )}
//                 </header>
//                 <main>
//                     <Routes>
//                         {/* --- Public Routes --- */}
//                         <Route path="/login" element={<Login />} />
//                         <Route path="/register" element={<Register />} />
                        
//                         {/* --- Protected Routes --- */}
//                         {/* Any route inside here requires the user to be logged in */}
//                         <Route element={<ProtectedRoute />}>
//                             {/* The main page for logged-in users is the list of their projects */}
//                             <Route path="/" element={<ProjectList />} />
//                             {/* This is the route for viewing a single project's details and tools */}
//                             <Route path="/project/:projectId" element={<ProjectDetail />} />
//                         </Route>
                        
//                         {/* --- Fallback Route --- */}
//                         {/* If a user tries any other URL, redirect them based on their login status */}
//                         <Route path="*" element={<Navigate to={isAuthenticated() ? "/" : "/login"} replace />} />
//                     </Routes>
//                 </main>
//             </div>
//         </Router>
//     );
// }

// export default App;


// File: frontend/src/App.js (FINAL, COMPLETE, AND CORRECTED)

import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, Outlet, useLocation, Link } from 'react-router-dom';
import './App.css';

// --- Import our "Page" level components ---
import ProjectList from './components/ProjectList'; // The new home page for logged-in users
import ProjectDetail from './components/ProjectDetail'; // The new page for a single project's details
import Register from './components/auth/Register';
import Login from './components/auth/Login';

// Helper function to check for auth token in localStorage
const isAuthenticated = () => {
    return localStorage.getItem('access_token') !== null;
};

// Component to protect routes. If not logged in, redirects to /login
const ProtectedRoute = () => {
    const location = useLocation();
    // The <Outlet /> component will render the matched child route element (ProjectList or ProjectDetail)
    return isAuthenticated() ? <Outlet /> : <Navigate to="/login" state={{ from: location }} replace />;
};

function App() {
    const handleLogout = () => {
        localStorage.removeItem('access_token');
        // A full page reload is a simple and effective way to clear all state and redirect
        window.location.href = '/login';
    };

    return (
        <Router>
            <div className="App">
                <header className="App-header">
                    {/* Link the title back to the projects list (the new home page) */}
                    <Link to="/" className="header-title-link">
                        <h1>AI-Integrated Test Case Management System</h1>
                    </Link>
                    {/* Show logout button only if authenticated */}
                    {isAuthenticated() && (
                        <button onClick={handleLogout} className="logout-button">Logout</button>
                    )}
                </header>
                {/* Added className to main for consistent padding */}
                <main className="App-content">
                    <Routes>
                        {/* --- Public Routes --- */}
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        
                        {/* --- Protected Routes --- */}
                        {/* Any route inside here requires the user to be logged in */}
                        <Route element={<ProtectedRoute />}>
                            {/* The main page for logged-in users is the list of their projects */}
                            <Route path="/" element={<ProjectList />} />
                            {/* This is the route for viewing a single project's details and tools */}
                            <Route path="/project/:projectId" element={<ProjectDetail />} />
                        </Route>
                        
                        {/* --- Fallback Route --- */}
                        {/* If a user tries any other URL, redirect them based on their login status */}
                        <Route path="*" element={<Navigate to={isAuthenticated() ? "/" : "/login"} replace />} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
}

export default App;