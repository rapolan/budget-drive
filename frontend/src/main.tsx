import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Set default tenant ID and name for development
// In production, these would come from subdomain or authentication

// FORCE update to correct tenant ID (fixes old wrong UUID from previous sessions)
const CORRECT_TENANT_ID = '55654b9d-6d7f-46e0-ade2-be606abfe00a';
const currentTenantId = localStorage.getItem('tenant_id');

if (currentTenantId !== CORRECT_TENANT_ID) {
  console.log('🔄 Updating tenant_id from', currentTenantId, 'to', CORRECT_TENANT_ID);
  localStorage.setItem('tenant_id', CORRECT_TENANT_ID);
}

if (!localStorage.getItem('tenant_name')) {
  localStorage.setItem('tenant_name', 'Budget Driving School');
}
// Dev mode: Backend bypasses auth, but frontend still needs a token in localStorage to send headers
if (!localStorage.getItem('auth_token')) {
  localStorage.setItem('auth_token', 'dev-token-bypassed-in-development-mode');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
