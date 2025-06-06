import React from 'react';
import ReactDOM from 'react-dom/client'; // Updated import for React 18+
import './index.css'; // Import global styles
import App from './App';
import reportWebVitals from './reportWebVitals';

// Use createRoot for React 18+
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();