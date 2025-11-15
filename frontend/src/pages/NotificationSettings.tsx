import React, { useState } from 'react';
import { Bell, Mail, MessageSquare, Save, TestTube } from 'lucide-react';

export const NotificationSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState({
    // Email notifications
    emailBookingConfirmation: true,
    emailReminder24h: true,
    emailReminder1h: true,
    emailCancellation: true,
    emailRescheduled: true,

    // Future: SMS notifications
    smsReminder24h: false,
    smsReminder1h: false,

    // System settings
    sendToStudent: true,
    sendToInstructor: true,
    sendToAdmin: false,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const handleToggle = (key: keyof typeof settings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');

    try {
      // Simulate save to localStorage for now
      localStorage.setItem('notification_settings', JSON.stringify(settings));

      // In production, this would be an API call:
      // await settingsApi.updateNotifications(settings);

      await new Promise(resolve => setTimeout(resolve, 500));
      setSaveMessage('Settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestEmail = async () => {
    // In production, this would trigger a test email
    alert('Test email would be sent to the configured admin email');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure how and when notifications are sent to students, instructors, and admins
        </p>
      </div>

      {/* Email Notification Settings */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 flex items-center">
          <Mail className="mr-3 h-6 w-6 text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Email Notifications</h2>
            <p className="text-sm text-gray-500">
              Powered by Gmail SMTP - 500 emails/day limit (free)
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Booking Confirmation */}
          <div className="flex items-center justify-between border-b border-gray-200 pb-4">
            <div>
              <h3 className="font-medium text-gray-900">Booking Confirmation</h3>
              <p className="text-sm text-gray-500">
                Send immediately when a lesson is booked
              </p>
            </div>
            <button
              onClick={() => handleToggle('emailBookingConfirmation')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.emailBookingConfirmation ? 'bg-primary' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.emailBookingConfirmation ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* 24-Hour Reminder */}
          <div className="flex items-center justify-between border-b border-gray-200 pb-4">
            <div>
              <h3 className="font-medium text-gray-900">24-Hour Reminder</h3>
              <p className="text-sm text-gray-500">
                Send 24 hours before the scheduled lesson
              </p>
            </div>
            <button
              onClick={() => handleToggle('emailReminder24h')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.emailReminder24h ? 'bg-primary' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.emailReminder24h ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* 1-Hour Reminder */}
          <div className="flex items-center justify-between border-b border-gray-200 pb-4">
            <div>
              <h3 className="font-medium text-gray-900">1-Hour Reminder</h3>
              <p className="text-sm text-gray-500">
                Send 1 hour before the scheduled lesson
              </p>
            </div>
            <button
              onClick={() => handleToggle('emailReminder1h')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.emailReminder1h ? 'bg-primary' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.emailReminder1h ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Cancellation Notice */}
          <div className="flex items-center justify-between border-b border-gray-200 pb-4">
            <div>
              <h3 className="font-medium text-gray-900">Cancellation Notice</h3>
              <p className="text-sm text-gray-500">
                Send when a lesson is cancelled
              </p>
            </div>
            <button
              onClick={() => handleToggle('emailCancellation')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.emailCancellation ? 'bg-primary' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.emailCancellation ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Reschedule Notice */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Reschedule Notice</h3>
              <p className="text-sm text-gray-500">
                Send when a lesson time is changed
              </p>
            </div>
            <button
              onClick={() => handleToggle('emailRescheduled')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.emailRescheduled ? 'bg-primary' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.emailRescheduled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* SMS Notifications (Future Feature) */}
      <div className="rounded-lg bg-white p-6 shadow opacity-50">
        <div className="mb-6 flex items-center">
          <MessageSquare className="mr-3 h-6 w-6 text-gray-400" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              SMS Notifications
              <span className="ml-2 rounded bg-gray-200 px-2 py-1 text-xs font-normal text-gray-600">
                Coming Soon
              </span>
            </h2>
            <p className="text-sm text-gray-500">
              Powered by Twilio - Available in Phase 1 Week 2
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-4">
            <div>
              <h3 className="font-medium text-gray-400">24-Hour SMS Reminder</h3>
              <p className="text-sm text-gray-400">
                Send SMS 24 hours before lesson
              </p>
            </div>
            <button
              disabled
              className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200"
            >
              <span className="inline-block h-4 w-4 translate-x-1 transform rounded-full bg-white" />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-400">1-Hour SMS Reminder</h3>
              <p className="text-sm text-gray-400">
                Send SMS 1 hour before lesson
              </p>
            </div>
            <button
              disabled
              className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200"
            >
              <span className="inline-block h-4 w-4 translate-x-1 transform rounded-full bg-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Recipient Settings */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 flex items-center">
          <Bell className="mr-3 h-6 w-6 text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Notification Recipients</h2>
            <p className="text-sm text-gray-500">
              Choose who receives notifications
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-4">
            <div>
              <h3 className="font-medium text-gray-900">Send to Students</h3>
              <p className="text-sm text-gray-500">
                Notify students about their lessons
              </p>
            </div>
            <button
              onClick={() => handleToggle('sendToStudent')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.sendToStudent ? 'bg-primary' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.sendToStudent ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between border-b border-gray-200 pb-4">
            <div>
              <h3 className="font-medium text-gray-900">Send to Instructors</h3>
              <p className="text-sm text-gray-500">
                Notify instructors about their assigned lessons
              </p>
            </div>
            <button
              onClick={() => handleToggle('sendToInstructor')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.sendToInstructor ? 'bg-primary' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.sendToInstructor ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Send to Admin</h3>
              <p className="text-sm text-gray-500">
                CC admin on all notifications (can be noisy)
              </p>
            </div>
            <button
              onClick={() => handleToggle('sendToAdmin')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.sendToAdmin ? 'bg-primary' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.sendToAdmin ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between rounded-lg bg-white p-6 shadow">
        <button
          onClick={handleTestEmail}
          className="flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <TestTube className="mr-2 h-4 w-4" />
          Send Test Email
        </button>

        <div className="flex items-center space-x-3">
          {saveMessage && (
            <span className="text-sm font-medium text-green-600">
              {saveMessage}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center rounded-md bg-primary px-6 py-2 text-white hover:bg-opacity-90 disabled:opacity-50"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Setup Instructions */}
      <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-6">
        <h3 className="mb-2 font-semibold text-blue-900">Gmail SMTP Setup Required</h3>
        <div className="space-y-2 text-sm text-blue-800">
          <p>
            To enable email notifications, configure the following in your <code className="rounded bg-blue-100 px-1">.env</code> file:
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li><code className="rounded bg-blue-100 px-1">EMAIL_USER</code> - Your Gmail address</li>
            <li><code className="rounded bg-blue-100 px-1">EMAIL_PASSWORD</code> - Gmail app-specific password (not your regular password)</li>
          </ul>
          <p className="mt-3">
            <strong>Free Tier:</strong> 500 emails/day (15,000/month) - Perfect for pilot phase
          </p>
        </div>
      </div>
    </div>
  );
};
