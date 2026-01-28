/**
 * Settings Page
 * School-level settings and configuration
 */

import React, { useState } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { Settings as SettingsIcon, Sparkles, Bell, Palette, Info, Calendar } from 'lucide-react';

type SettingsTab = 'general' | 'features' | 'scheduling' | 'branding' | 'notifications';

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('scheduling');

  const tabs = [
    { id: 'general' as SettingsTab, name: 'General', icon: Info },
    { id: 'scheduling' as SettingsTab, name: 'Scheduling', icon: Calendar },
    { id: 'features' as SettingsTab, name: 'Features', icon: Sparkles },
    { id: 'branding' as SettingsTab, name: 'Branding', icon: Palette },
    { id: 'notifications' as SettingsTab, name: 'Notifications', icon: Bell },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your school's configuration and preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 overflow-x-auto">
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
        {activeTab === 'scheduling' && <SchedulingSettings />}
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
  const { settings, refreshSettings } = useTenant();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [defaultHoursRequired, setDefaultHoursRequired] = useState(settings?.defaultHoursRequired || 6);

  // Update local state when settings load
  React.useEffect(() => {
    if (settings?.defaultHoursRequired !== undefined) {
      setDefaultHoursRequired(settings.defaultHoursRequired);
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);

      const response = await fetch('http://localhost:3000/api/v1/tenant/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'X-Tenant-ID': localStorage.getItem('tenant_id') || '',
        },
        body: JSON.stringify({
          defaultHoursRequired,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update settings');
      }

      await refreshSettings();
      setMessage({
        type: 'success',
        text: 'Settings saved successfully!',
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMessage({
        type: 'error',
        text: 'Failed to save settings. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">General Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Basic information about your driving school
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

      {/* Default Hours Required */}
      <div className="border border-gray-200 rounded-lg p-6">
        <label htmlFor="default-hours" className="block text-base font-medium text-gray-900 mb-2">
          Default Training Hours Required
        </label>
        <p className="text-sm text-gray-500 mb-4">
          Set the default number of behind-the-wheel training hours required for new students. 
          This varies by state (e.g., California requires 6 hours for students under 18).
        </p>
        <div className="flex items-center space-x-4">
          <input
            id="default-hours"
            type="number"
            value={defaultHoursRequired}
            onChange={(e) => setDefaultHoursRequired(parseFloat(e.target.value) || 6)}
            min="1"
            max="100"
            step="0.5"
            autoComplete="nope"
            className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <span className="text-gray-700">hours</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDefaultHoursRequired(6)}
            className={`px-3 py-1 text-xs rounded ${defaultHoursRequired === 6 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            6 hrs (CA)
          </button>
          <button
            type="button"
            onClick={() => setDefaultHoursRequired(8)}
            className={`px-3 py-1 text-xs rounded ${defaultHoursRequired === 8 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            8 hrs
          </button>
          <button
            type="button"
            onClick={() => setDefaultHoursRequired(10)}
            className={`px-3 py-1 text-xs rounded ${defaultHoursRequired === 10 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            10 hrs
          </button>
          <button
            type="button"
            onClick={() => setDefaultHoursRequired(12)}
            className={`px-3 py-1 text-xs rounded ${defaultHoursRequired === 12 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            12 hrs
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Students can have their individual hours adjusted during or after enrollment.
        </p>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
        >
          {saving ? 'Saving...' : 'Save General Settings'}
        </button>
      </div>
    </div>
  );
};

/**
 * Scheduling Settings Tab
 */
const SchedulingSettings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [defaultLessonDuration, setDefaultLessonDuration] = useState(120);
  const [bufferTimeBetweenLessons, setBufferTimeBetweenLessons] = useState(30);
  const [defaultMaxStudentsPerDay, setDefaultMaxStudentsPerDay] = useState(3);

  // Load current settings
  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:3000/api/v1/availability/settings', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'X-Tenant-ID': localStorage.getItem('tenant_id') || '',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setDefaultLessonDuration(data.data.defaultLessonDuration || 120);
          setBufferTimeBetweenLessons(data.data.bufferTimeBetweenLessons || 30);
          setDefaultMaxStudentsPerDay(data.data.defaultMaxStudentsPerDay || 3);
        }
      } catch (error) {
        console.error('Failed to load scheduling settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);

      const response = await fetch('http://localhost:3000/api/v1/availability/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'X-Tenant-ID': localStorage.getItem('tenant_id') || '',
        },
        body: JSON.stringify({
          defaultLessonDuration,
          bufferTimeBetweenLessons,
          defaultMaxStudentsPerDay,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update settings');
      }

      setMessage({
        type: 'success',
        text: 'Scheduling settings saved successfully!',
      });

      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMessage({
        type: 'error',
        text: 'Failed to save settings. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Calculate example day end time
  const calculateDayEndTime = () => {
    const startHour = 9; // Example: 9 AM
    const totalMinutes = (defaultLessonDuration * defaultMaxStudentsPerDay) +
                        (bufferTimeBetweenLessons * (defaultMaxStudentsPerDay - 1));
    const endTotalMinutes = (startHour * 60) + totalMinutes;
    const endHour = Math.floor(endTotalMinutes / 60);
    const endMinute = endTotalMinutes % 60;
    return `${endHour > 12 ? endHour - 12 : endHour}:${endMinute.toString().padStart(2, '0')} ${endHour >= 12 ? 'PM' : 'AM'}`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Capacity-Based Scheduling</h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure default scheduling parameters for your driving school
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

      {/* Settings Form */}
      <div className="space-y-6">
        {/* Default Lesson Duration */}
        <div className="border border-gray-200 rounded-lg p-6">
          <label htmlFor="lesson-duration" className="block text-base font-medium text-gray-900 mb-2">
            Default Lesson Duration
          </label>
          <p className="text-sm text-gray-500 mb-4">
            How long is a standard lesson? This will be the default when booking new lessons.
          </p>
          <div className="flex items-center space-x-4">
            <input
              id="lesson-duration"
              type="number"
              value={defaultLessonDuration}
              onChange={(e) => setDefaultLessonDuration(parseInt(e.target.value) || 0)}
              min="30"
              max="240"
              step="30"
              autoComplete="nope"
              className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-gray-700">minutes</span>
            <span className="text-sm text-gray-500">
              ({(defaultLessonDuration / 60).toFixed(1)} hours)
            </span>
          </div>
          <div className="mt-3 flex space-x-2">
            <button
              type="button"
              onClick={() => setDefaultLessonDuration(60)}
              className={`px-3 py-1 text-xs rounded ${defaultLessonDuration === 60 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              1 hr
            </button>
            <button
              type="button"
              onClick={() => setDefaultLessonDuration(90)}
              className={`px-3 py-1 text-xs rounded ${defaultLessonDuration === 90 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              1.5 hrs
            </button>
            <button
              type="button"
              onClick={() => setDefaultLessonDuration(120)}
              className={`px-3 py-1 text-xs rounded ${defaultLessonDuration === 120 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              2 hrs ⭐
            </button>
            <button
              type="button"
              onClick={() => setDefaultLessonDuration(180)}
              className={`px-3 py-1 text-xs rounded ${defaultLessonDuration === 180 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              3 hrs
            </button>
          </div>
        </div>

        {/* Buffer Time */}
        <div className="border border-gray-200 rounded-lg p-6">
          <label htmlFor="buffer-time" className="block text-base font-medium text-gray-900 mb-2">
            Buffer Time Between Lessons
          </label>
          <p className="text-sm text-gray-500 mb-4">
            Break time between consecutive lessons for instructor preparation and travel.
          </p>
          <div className="flex items-center space-x-4">
            <input
              id="buffer-time"
              type="number"
              value={bufferTimeBetweenLessons}
              onChange={(e) => setBufferTimeBetweenLessons(parseInt(e.target.value) || 0)}
              min="0"
              max="60"
              step="15"
              autoComplete="nope"
              className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-gray-700">minutes</span>
          </div>
          <div className="mt-3 flex space-x-2">
            <button
              type="button"
              onClick={() => setBufferTimeBetweenLessons(0)}
              className={`px-3 py-1 text-xs rounded ${bufferTimeBetweenLessons === 0 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              None
            </button>
            <button
              type="button"
              onClick={() => setBufferTimeBetweenLessons(15)}
              className={`px-3 py-1 text-xs rounded ${bufferTimeBetweenLessons === 15 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              15 min
            </button>
            <button
              type="button"
              onClick={() => setBufferTimeBetweenLessons(30)}
              className={`px-3 py-1 text-xs rounded ${bufferTimeBetweenLessons === 30 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              30 min ⭐
            </button>
            <button
              type="button"
              onClick={() => setBufferTimeBetweenLessons(45)}
              className={`px-3 py-1 text-xs rounded ${bufferTimeBetweenLessons === 45 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              45 min
            </button>
          </div>
        </div>

        {/* Max Students Per Day */}
        <div className="border border-gray-200 rounded-lg p-6">
          <label htmlFor="max-students" className="block text-base font-medium text-gray-900 mb-2">
            Default Max Students Per Instructor Per Day
          </label>
          <p className="text-sm text-gray-500 mb-4">
            Maximum number of lessons an instructor can teach in one day. Instructors can override this for themselves.
          </p>
          <div className="flex items-center space-x-4">
            <input
              id="max-students"
              type="number"
              value={defaultMaxStudentsPerDay}
              onChange={(e) => setDefaultMaxStudentsPerDay(parseInt(e.target.value) || 0)}
              min="1"
              max="10"
              autoComplete="nope"
              className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-gray-700">students</span>
          </div>
          <div className="mt-3 flex space-x-2">
            <button
              type="button"
              onClick={() => setDefaultMaxStudentsPerDay(2)}
              className={`px-3 py-1 text-xs rounded ${defaultMaxStudentsPerDay === 2 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              2
            </button>
            <button
              type="button"
              onClick={() => setDefaultMaxStudentsPerDay(3)}
              className={`px-3 py-1 text-xs rounded ${defaultMaxStudentsPerDay === 3 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              3 ⭐
            </button>
            <button
              type="button"
              onClick={() => setDefaultMaxStudentsPerDay(4)}
              className={`px-3 py-1 text-xs rounded ${defaultMaxStudentsPerDay === 4 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              4
            </button>
            <button
              type="button"
              onClick={() => setDefaultMaxStudentsPerDay(5)}
              className={`px-3 py-1 text-xs rounded ${defaultMaxStudentsPerDay === 5 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              5
            </button>
          </div>
        </div>

        {/* Example Preview */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded">
          <div className="flex items-start">
            <Calendar className="h-6 w-6 text-blue-600 mt-0.5" />
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-blue-900">Example Schedule</h3>
              <p className="mt-2 text-sm text-blue-800">
                With these settings, if an instructor starts at <strong>9:00 AM</strong>, their day will look like:
              </p>
              <ul className="mt-3 space-y-2 text-sm text-blue-800">
                {[...Array(defaultMaxStudentsPerDay)].map((_, i) => {
                  const startMin = (9 * 60) + (i * (defaultLessonDuration + bufferTimeBetweenLessons));
                  const endMin = startMin + defaultLessonDuration;
                  const startHr = Math.floor(startMin / 60);
                  const startMinute = startMin % 60;
                  const endHr = Math.floor(endMin / 60);
                  const endMinute = endMin % 60;
                  const formatHr = (hr: number) => hr > 12 ? hr - 12 : hr;
                  const formatAmPm = (hr: number) => hr >= 12 ? 'PM' : 'AM';

                  return (
                    <li key={i} className="flex items-center">
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 text-white text-xs font-medium mr-3">
                        {i + 1}
                      </span>
                      <span className="font-medium">
                        {formatHr(startHr)}:{startMinute.toString().padStart(2, '0')} {formatAmPm(startHr)} - {formatHr(endHr)}:{endMinute.toString().padStart(2, '0')} {formatAmPm(endHr)}
                      </span>
                      <span className="ml-2 text-xs text-blue-600">
                        ({defaultLessonDuration} min lesson)
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-sm font-medium text-blue-900">
                Day ends at: <strong>{calculateDayEndTime()}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
          >
            {saving ? 'Saving...' : 'Save Scheduling Settings'}
          </button>
        </div>
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

      {/* Calendar Sync - Now Available! */}
      <div className="border border-green-200 rounded-lg p-6 bg-green-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-gray-900 flex items-center gap-2">
              📅 Calendar Sync
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Available</span>
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Instructors can subscribe to their lesson calendar using any calendar app (Google Calendar, Apple Calendar, Outlook).
            </p>
            <p className="mt-2 text-sm text-gray-500">
              <strong>How to set up:</strong> Go to Instructors → Edit an instructor → Expand "Calendar Sync" section → Enable and share the feed URL with the instructor.
            </p>
          </div>
          <a 
            href="/instructors"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
          >
            Go to Instructors →
          </a>
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
