/**
 * Settings Page
 * School-level settings and configuration
 */

import React, { useState } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { Settings as SettingsIcon, Sparkles, Bell, Palette, Info } from 'lucide-react';

type SettingsTab = 'general' | 'features' | 'branding' | 'notifications';

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('features');

  const tabs = [
    { id: 'general' as SettingsTab, name: 'General', icon: Info },
    { id: 'features' as SettingsTab, name: 'Features', icon: Sparkles },
    { id: 'branding' as SettingsTab, name: 'Branding', icon: Palette },
    { id: 'notifications' as SettingsTab, name: 'Notifications', icon: Bell },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your school's configuration and preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center border-b-2 py-4 px-1 text-sm font-medium transition-colors
                  ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }
                `}
              >
                <Icon className="mr-2 h-5 w-5" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg shadow p-6">
        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === 'features' && <FeaturesSettings />}
        {activeTab === 'branding' && <BrandingSettings />}
        {activeTab === 'notifications' && <NotificationsSettings />}
      </div>
    </div>
  );
};

/**
 * General Settings Tab
 */
const GeneralSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">General Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Basic information about your driving school
        </p>
      </div>

      <div className="text-center text-gray-500 py-12">
        Coming soon: School name, contact info, timezone, etc.
      </div>
    </div>
  );
};

/**
 * Features Settings Tab
 */
const FeaturesSettings: React.FC = () => {
  const { settings, refreshSettings } = useTenant();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Get current power mode status (using snake_case from backend)
  const powerModeEnabled = (settings as any)?.enable_blockchain_payments === true;

  const handleTogglePowerMode = async () => {
    try {
      setSaving(true);
      setMessage(null);

      // Call backend to update settings
      const response = await fetch('http://localhost:3000/api/v1/tenant/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'X-Tenant-ID': localStorage.getItem('tenant_id') || '',
        },
        body: JSON.stringify({
          enableBlockchainPayments: !powerModeEnabled,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update settings');
      }

      // Refresh settings in context
      await refreshSettings();

      setMessage({
        type: 'success',
        text: `Power mode ${!powerModeEnabled ? 'enabled' : 'disabled'} successfully!`,
      });

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Failed to toggle power mode:', error);
      setMessage({
        type: 'error',
        text: 'Failed to update setting. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Feature Toggles</h2>
        <p className="mt-1 text-sm text-gray-500">
          Enable or disable optional features for your school
        </p>
      </div>

      {/* Success/Error Message */}
      {message && (
        <div
          className={`rounded-md p-4 ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Power Mode Toggle */}
      <div className="border border-gray-200 rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center">
              <h3 className="text-base font-medium text-gray-900">Power User Mode</h3>
              <span className="ml-2 inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                BSV Blockchain
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Show advanced BSV blockchain features throughout the application. When enabled, you'll see:
            </p>
            <ul className="mt-3 text-sm text-gray-500 list-disc list-inside space-y-1">
              <li>Satoshi amounts for all transactions (5 sats per booking)</li>
              <li>Blockchain verification links (WhatsOnChain explorer)</li>
              <li>Transaction IDs and on-chain status</li>
              <li>Craig Wright philosophy alignment sections</li>
              <li>Immutable proof of all treasury transactions</li>
            </ul>

            <div className="mt-4 bg-blue-50 border-l-4 border-blue-500 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <SettingsIcon className="h-5 w-5 text-blue-500" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    <strong>Note:</strong> BSV blockchain integration runs automatically in the background
                    regardless of this setting. This toggle only controls the <strong>visibility</strong> of blockchain
                    details in the UI. Your transactions are always recorded on-chain for immutability.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="ml-6 flex-shrink-0">
            <button
              onClick={handleTogglePowerMode}
              disabled={saving}
              className={`
                relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
                ${powerModeEnabled ? 'bg-blue-600' : 'bg-gray-200'}
                ${saving ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <span
                className={`
                  pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                  transition duration-200 ease-in-out
                  ${powerModeEnabled ? 'translate-x-5' : 'translate-x-0'}
                `}
              />
            </button>
            <span className="ml-3 text-sm font-medium text-gray-900">
              {powerModeEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Show current status */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Status: {powerModeEnabled ? (
              <span className="text-green-600 font-medium">Power mode active - BSV features visible</span>
            ) : (
              <span className="text-gray-600 font-medium">Standard mode - Clean UI without blockchain details</span>
            )}
          </p>
        </div>
      </div>

      {/* Other Feature Toggles (Coming Soon) */}
      <div className="border border-gray-200 rounded-lg p-6 opacity-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-gray-900">Google Calendar Integration</h3>
            <p className="mt-1 text-sm text-gray-500">
              Sync lessons with Google Calendar
            </p>
          </div>
          <span className="text-sm text-gray-400">Coming Soon</span>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-6 opacity-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-gray-900">Digital Certificates</h3>
            <p className="mt-1 text-sm text-gray-500">
              Generate completion certificates for students
            </p>
          </div>
          <span className="text-sm text-gray-400">Coming Soon</span>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-6 opacity-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-gray-900">Follow-Up Tracker</h3>
            <p className="mt-1 text-sm text-gray-500">
              Automated student follow-up reminders
            </p>
          </div>
          <span className="text-sm text-gray-400">Coming Soon</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Branding Settings Tab
 */
const BrandingSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Branding Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Customize your school's appearance
        </p>
      </div>

      <div className="text-center text-gray-500 py-12">
        Coming soon: Logo upload, color scheme, custom branding, etc.
      </div>
    </div>
  );
};

/**
 * Notifications Settings Tab
 */
const NotificationsSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Notification Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure email and SMS notifications
        </p>
      </div>

      <div className="text-center text-gray-500 py-12">
        Coming soon: Email templates, SMS settings, notification preferences, etc.
      </div>
    </div>
  );
};

export default SettingsPage;
