import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Set default tenant ID and name for development
// In production, these would come from subdomain or authentication
if (!localStorage.getItem('tenant_id')) {
  localStorage.setItem('tenant_id', '550e8400-e29b-41d4-a716-446655440000'); // Budget Driving School tenant
}
if (!localStorage.getItem('tenant_name')) {
  localStorage.setItem('tenant_name', 'Budget Driving School');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
