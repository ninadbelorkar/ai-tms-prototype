// File: frontend/src/components/auth/Login.js

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

function Login() {
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            const response = await axios.post(`${BACKEND_URL}/api/auth/login`, formData);
            const { access_token } = response.data;
            
            // Save the token to localStorage
            localStorage.setItem('access_token', access_token);
            
            // Redirect to the dashboard
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="component-section auth-form">
            <h2>Login</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <input type="email" name="email" id="email" value={formData.email} onChange={handleChange} required />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input type="password" name="password" id="password" value={formData.password} onChange={handleChange} required />
                </div>
                <button type="submit" disabled={isLoading}>{isLoading ? 'Logging In...' : 'Login'}</button>
            </form>
            <div className="auth-switch-link">
                <p>
                    Don't have an account? <Link to="/register">Register here</Link>
                </p>
            </div>
            {error && <p className="error">{error}</p>}
        </div>
    );
}

export default Login;