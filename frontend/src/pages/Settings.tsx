/**
 * Settings Page
 * School-level settings and configuration
 */

import React, { useState } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { Settings as SettingsIcon, Sparkles, Bell, Palette, Info, Calendar, Users } from 'lucide-react';
import { TeamSettings } from './TeamSettings';

const API_BASE = 'http://127.0.0.1:4000/api/v1';


type SettingsTab = 'general' | 'team' | 'features' | 'scheduling' | 'branding' | 'notifications';

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('scheduling');

  const tabs = [
    { id: 'general' as SettingsTab, name: 'General', icon: Info },
    { id: 'team' as SettingsTab, name: 'Team', icon: Users },
    { id: 'scheduling' as SettingsTab, name: 'Scheduling', icon: Calendar },
    { id: 'features' as SettingsTab, name: 'Features', icon: Sparkles },
    { id: 'branding' as SettingsTab, name: 'Branding', icon: Palette },
    { id: 'notifications' as SettingsTab, name: 'Notifications', icon: Bell },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-3xl font-bold text-tx-primary">Settings</h1>
        <p className="mt-1 text-sm text-tx-muted">
          Manage your school's configuration and preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--border)]">
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
                  ${isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-tx-muted hover:border-[var(--border-strong)] hover:text-tx-secondary'
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
      <div className="bg-surface rounded-lg shadow p-6">
        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === 'team' && <TeamSettings />}
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
 * Full school info: name, tagline, address, contact, default hours
 */
const GeneralSettings: React.FC = () => {
  const { settings, refreshSettings } = useTenant();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [form, setForm] = useState({
    businessName:        settings?.businessName        || '',
    businessTagline:     settings?.businessTagline     || '',
    supportPhone:        (settings as any)?.support_phone   || settings?.supportPhone   || '',
    supportEmail:        (settings as any)?.support_email   || settings?.supportEmail   || '',
    websiteUrl:          (settings as any)?.website_url     || settings?.websiteUrl     || '',
    addressLine1:        (settings as any)?.address_line1   || settings?.addressLine1   || '',
    addressLine2:        (settings as any)?.address_line2   || settings?.addressLine2   || '',
    city:                settings?.city                || '',
    state:               settings?.state               || '',
    zipCode:             (settings as any)?.zip_code        || settings?.zipCode        || '',
    defaultHoursRequired: settings?.defaultHoursRequired ?? 6,
  });

  React.useEffect(() => {
    if (!settings) return;
    setForm({
      businessName:        (settings as any).business_name    || settings.businessName    || '',
      businessTagline:     (settings as any).business_tagline || settings.businessTagline || '',
      supportPhone:        (settings as any).support_phone    || settings.supportPhone    || '',
      supportEmail:        (settings as any).support_email    || settings.supportEmail    || '',
      websiteUrl:          (settings as any).website_url      || settings.websiteUrl      || '',
      addressLine1:        (settings as any).address_line1    || settings.addressLine1    || '',
      addressLine2:        (settings as any).address_line2    || settings.addressLine2    || '',
      city:                settings.city  || '',
      state:               settings.state || '',
      zipCode:             (settings as any).zip_code         || settings.zipCode         || '',
      defaultHoursRequired: settings.defaultHoursRequired ?? 6,
    });
  }, [settings]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch(`${API_BASE}/tenant/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'X-Tenant-ID': localStorage.getItem('tenant_id') || '',
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Save failed');
      await refreshSettings();
      setMessage({ type: 'success', text: 'General settings saved!' });
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ type: 'error', text: 'Failed to save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-tx-primary">General Settings</h2>
        <p className="mt-1 text-sm text-tx-muted">School information, contact details, and training defaults.</p>
      </div>

      {message && (
        <div className={`rounded-md p-4 text-sm font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.type === 'success' ? '✓ ' : '✗ '}{message.text}
        </div>
      )}

      {/* School Identity */}
      <div className="border border-[var(--border)] rounded-lg p-6 space-y-4">
        <h3 className="text-sm font-semibold text-tx-secondary uppercase tracking-wide">School Identity</h3>
        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-1">School Name</label>
          <input
            type="text"
            value={form.businessName}
            onChange={set('businessName')}
            placeholder="Budget Driving School"
            className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-1">Tagline <span className="text-tx-muted font-normal">(optional)</span></label>
          <input
            type="text"
            value={form.businessTagline}
            onChange={set('businessTagline')}
            placeholder="Learn to Drive with Confidence"
            className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {/* Contact Info */}
      <div className="border border-[var(--border)] rounded-lg p-6 space-y-4">
        <h3 className="text-sm font-semibold text-tx-secondary uppercase tracking-wide">Contact Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-tx-secondary mb-1">Phone</label>
            <input
              type="tel"
              value={form.supportPhone}
              onChange={set('supportPhone')}
              placeholder="(619) 555-0100"
              className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-tx-secondary mb-1">Email</label>
            <input
              type="email"
              value={form.supportEmail}
              onChange={set('supportEmail')}
              placeholder="info@myschool.com"
              className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-1">Website <span className="text-tx-muted font-normal">(optional)</span></label>
          <input
            type="url"
            value={form.websiteUrl}
            onChange={set('websiteUrl')}
            placeholder="https://myschool.com"
            className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {/* Physical Address */}
      <div className="border border-[var(--border)] rounded-lg p-6 space-y-4">
        <h3 className="text-sm font-semibold text-tx-secondary uppercase tracking-wide">Physical Address</h3>
        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-1">Street Address</label>
          <input
            type="text"
            value={form.addressLine1}
            onChange={set('addressLine1')}
            placeholder="123 Main Street"
            className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-1">Suite / Unit <span className="text-tx-muted font-normal">(optional)</span></label>
          <input
            type="text"
            value={form.addressLine2}
            onChange={set('addressLine2')}
            placeholder="Suite 100"
            className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="col-span-1 sm:col-span-1">
            <label className="block text-sm font-medium text-tx-secondary mb-1">City</label>
            <input
              type="text"
              value={form.city}
              onChange={set('city')}
              placeholder="San Diego"
              className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-tx-secondary mb-1">State</label>
            <select
              value={form.state}
              onChange={set('state')}
              className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-surface"
            >
              <option value="">—</option>
              {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-tx-secondary mb-1">ZIP Code</label>
            <input
              type="text"
              value={form.zipCode}
              onChange={set('zipCode')}
              placeholder="92101"
              maxLength={10}
              className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Default Training Hours */}
      <div className="border border-[var(--border)] rounded-lg p-6 space-y-4">
        <h3 className="text-sm font-semibold text-tx-secondary uppercase tracking-wide">Training Defaults</h3>
        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-1">Default Hours Required per Student</label>
          <p className="text-xs text-tx-muted mb-3">Applies to new enrollments. California requires 6 hours for students under 18.</p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={form.defaultHoursRequired}
              onChange={e => setForm(f => ({ ...f, defaultHoursRequired: parseFloat(e.target.value) || 6 }))}
              min="1" max="100" step="0.5"
              className="w-28 px-3 py-2 border border-[var(--border-strong)] rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <span className="text-sm text-tx-secondary">hours</span>
            <div className="flex gap-2">
              {[6, 8, 10, 12].map(h => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, defaultHoursRequired: h }))}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    form.defaultHoursRequired === h
                      ? 'bg-primary text-white border-primary'
                      : 'bg-surface text-tx-secondary border-[var(--border-strong)] hover:border-blue-400'
                  }`}
                >
                  {h}h{h === 6 ? ' ⭐' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-primary text-white rounded-lg hover:brightness-90 hover:bg-primary transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {saving ? 'Saving…' : 'Save General Settings'}
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
        const response = await fetch(`${API_BASE}/availability/settings`, {
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

      const response = await fetch(`${API_BASE}/availability/settings`, {
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
          <div className="h-8 bg-surface3 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-surface3 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-tx-primary">Capacity-Based Scheduling</h2>
        <p className="mt-1 text-sm text-tx-muted">
          Configure default scheduling parameters for your driving school
        </p>
      </div>

      {/* Success/Error Message */}
      {message && (
        <div
          className={`rounded-md p-4 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
        >
          {message.text}
        </div>
      )}

      {/* Settings Form */}
      <div className="space-y-6">
        {/* Default Lesson Duration */}
        <div className="border border-[var(--border)] rounded-lg p-6">
          <label htmlFor="lesson-duration" className="block text-base font-medium text-tx-primary mb-2">
            Default Lesson Duration
          </label>
          <p className="text-sm text-tx-muted mb-4">
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
              className="w-32 px-4 py-2 border border-[var(--border-strong)] rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <span className="text-tx-secondary">minutes</span>
            <span className="text-sm text-tx-muted">
              ({(defaultLessonDuration / 60).toFixed(1)} hours)
            </span>
          </div>
          <div className="mt-3 flex space-x-2">
            <button
              type="button"
              onClick={() => setDefaultLessonDuration(60)}
              className={`px-3 py-1 text-xs rounded ${defaultLessonDuration === 60 ? 'bg-primary text-white' : 'bg-surface2 text-tx-secondary hover:bg-surface3'}`}
            >
              1 hr
            </button>
            <button
              type="button"
              onClick={() => setDefaultLessonDuration(90)}
              className={`px-3 py-1 text-xs rounded ${defaultLessonDuration === 90 ? 'bg-primary text-white' : 'bg-surface2 text-tx-secondary hover:bg-surface3'}`}
            >
              1.5 hrs
            </button>
            <button
              type="button"
              onClick={() => setDefaultLessonDuration(120)}
              className={`px-3 py-1 text-xs rounded ${defaultLessonDuration === 120 ? 'bg-primary text-white' : 'bg-surface2 text-tx-secondary hover:bg-surface3'}`}
            >
              2 hrs ⭐
            </button>
            <button
              type="button"
              onClick={() => setDefaultLessonDuration(180)}
              className={`px-3 py-1 text-xs rounded ${defaultLessonDuration === 180 ? 'bg-primary text-white' : 'bg-surface2 text-tx-secondary hover:bg-surface3'}`}
            >
              3 hrs
            </button>
          </div>
        </div>

        {/* Buffer Time */}
        <div className="border border-[var(--border)] rounded-lg p-6">
          <label htmlFor="buffer-time" className="block text-base font-medium text-tx-primary mb-2">
            Buffer Time Between Lessons
          </label>
          <p className="text-sm text-tx-muted mb-4">
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
              className="w-32 px-4 py-2 border border-[var(--border-strong)] rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <span className="text-tx-secondary">minutes</span>
          </div>
          <div className="mt-3 flex space-x-2">
            <button
              type="button"
              onClick={() => setBufferTimeBetweenLessons(0)}
              className={`px-3 py-1 text-xs rounded ${bufferTimeBetweenLessons === 0 ? 'bg-primary text-white' : 'bg-surface2 text-tx-secondary hover:bg-surface3'}`}
            >
              None
            </button>
            <button
              type="button"
              onClick={() => setBufferTimeBetweenLessons(15)}
              className={`px-3 py-1 text-xs rounded ${bufferTimeBetweenLessons === 15 ? 'bg-primary text-white' : 'bg-surface2 text-tx-secondary hover:bg-surface3'}`}
            >
              15 min
            </button>
            <button
              type="button"
              onClick={() => setBufferTimeBetweenLessons(30)}
              className={`px-3 py-1 text-xs rounded ${bufferTimeBetweenLessons === 30 ? 'bg-primary text-white' : 'bg-surface2 text-tx-secondary hover:bg-surface3'}`}
            >
              30 min ⭐
            </button>
            <button
              type="button"
              onClick={() => setBufferTimeBetweenLessons(45)}
              className={`px-3 py-1 text-xs rounded ${bufferTimeBetweenLessons === 45 ? 'bg-primary text-white' : 'bg-surface2 text-tx-secondary hover:bg-surface3'}`}
            >
              45 min
            </button>
          </div>
        </div>

        {/* Max Students Per Day */}
        <div className="border border-[var(--border)] rounded-lg p-6">
          <label htmlFor="max-students" className="block text-base font-medium text-tx-primary mb-2">
            Default Max Students Per Instructor Per Day
          </label>
          <p className="text-sm text-tx-muted mb-4">
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
              className="w-32 px-4 py-2 border border-[var(--border-strong)] rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <span className="text-tx-secondary">students</span>
          </div>
          <div className="mt-3 flex space-x-2">
            <button
              type="button"
              onClick={() => setDefaultMaxStudentsPerDay(2)}
              className={`px-3 py-1 text-xs rounded ${defaultMaxStudentsPerDay === 2 ? 'bg-primary text-white' : 'bg-surface2 text-tx-secondary hover:bg-surface3'}`}
            >
              2
            </button>
            <button
              type="button"
              onClick={() => setDefaultMaxStudentsPerDay(3)}
              className={`px-3 py-1 text-xs rounded ${defaultMaxStudentsPerDay === 3 ? 'bg-primary text-white' : 'bg-surface2 text-tx-secondary hover:bg-surface3'}`}
            >
              3 ⭐
            </button>
            <button
              type="button"
              onClick={() => setDefaultMaxStudentsPerDay(4)}
              className={`px-3 py-1 text-xs rounded ${defaultMaxStudentsPerDay === 4 ? 'bg-primary text-white' : 'bg-surface2 text-tx-secondary hover:bg-surface3'}`}
            >
              4
            </button>
            <button
              type="button"
              onClick={() => setDefaultMaxStudentsPerDay(5)}
              className={`px-3 py-1 text-xs rounded ${defaultMaxStudentsPerDay === 5 ? 'bg-primary text-white' : 'bg-surface2 text-tx-secondary hover:bg-surface3'}`}
            >
              5
            </button>
          </div>
        </div>

        {/* Example Preview */}
        <div className="bg-blue-50 border-l-4 border-primary p-6 rounded">
          <div className="flex items-start">
            <Calendar className="h-6 w-6 text-primary mt-0.5" />
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
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-white text-xs font-medium mr-3">
                        {i + 1}
                      </span>
                      <span className="font-medium">
                        {formatHr(startHr)}:{startMinute.toString().padStart(2, '0')} {formatAmPm(startHr)} - {formatHr(endHr)}:{endMinute.toString().padStart(2, '0')} {formatAmPm(endHr)}
                      </span>
                      <span className="ml-2 text-xs text-primary">
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
            className="px-6 py-3 bg-primary text-white rounded-lg hover:brightness-90 hover:bg-primary transition-colors font-medium disabled:bg-surface3 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
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
      const response = await fetch(`${API_BASE}/tenant/settings`, {
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
        <h2 className="text-lg font-semibold text-tx-primary">Feature Toggles</h2>
        <p className="mt-1 text-sm text-tx-muted">
          Enable or disable optional features for your school
        </p>
      </div>

      {/* Success/Error Message */}
      {message && (
        <div
          className={`rounded-md p-4 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
        >
          {message.text}
        </div>
      )}

      {/* Power Mode Toggle */}
      <div className="border border-[var(--border)] rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center">
              <h3 className="text-base font-medium text-tx-primary">Power User Mode</h3>
              <span className="ml-2 inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                BSV Blockchain
              </span>
            </div>
            <p className="mt-2 text-sm text-tx-muted">
              Show advanced BSV blockchain features throughout the application. When enabled, you'll see:
            </p>
            <ul className="mt-3 text-sm text-tx-muted list-disc list-inside space-y-1">
              <li>Satoshi amounts for all transactions (5 sats per booking)</li>
              <li>Blockchain verification links (WhatsOnChain explorer)</li>
              <li>Transaction IDs and on-chain status</li>
              <li>Craig Wright philosophy alignment sections</li>
              <li>Immutable proof of all treasury transactions</li>
            </ul>

            <div className="mt-4 bg-blue-50 border-l-4 border-primary p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <SettingsIcon className="h-5 w-5 text-primary" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-primary">
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
              title="Toggle Power Mode"
              aria-label="Toggle Power Mode"
              disabled={saving}
              className={`
                relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
                ${powerModeEnabled ? 'bg-primary' : 'bg-surface3'}
                ${saving ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <span
                className={`
                  pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow ring-0
                  transition duration-200 ease-in-out
                  ${powerModeEnabled ? 'translate-x-5' : 'translate-x-0'}
                `}
              />
            </button>
            <span className="ml-3 text-sm font-medium text-tx-primary">
              {powerModeEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Show current status */}
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <p className="text-xs text-tx-muted">
            Status: {powerModeEnabled ? (
              <span className="text-green-600 font-medium">Power mode active - BSV features visible</span>
            ) : (
              <span className="text-tx-secondary font-medium">Standard mode - Clean UI without blockchain details</span>
            )}
          </p>
        </div>
      </div>

      {/* Calendar Sync - Now Available! */}
      <div className="border border-green-200 rounded-lg p-6 bg-green-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-tx-primary flex items-center gap-2">
              📅 Calendar Sync
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Available</span>
            </h3>
            <p className="mt-1 text-sm text-tx-secondary">
              Instructors can subscribe to their lesson calendar using any calendar app (Google Calendar, Apple Calendar, Outlook).
            </p>
            <p className="mt-2 text-sm text-tx-muted">
              <strong>How to set up:</strong> Go to Instructors → Edit an instructor → Expand "Calendar Sync" section → Enable and share the feed URL with the instructor.
            </p>
          </div>
          <a
            href="/instructors"
            className="text-sm text-primary hover:text-blue-800 font-medium whitespace-nowrap"
          >
            Go to Instructors →
          </a>
        </div>
      </div>

      <div className="border border-[var(--border)] rounded-lg p-6 opacity-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-tx-primary">Digital Certificates</h3>
            <p className="mt-1 text-sm text-tx-muted">
              Generate completion certificates for students
            </p>
          </div>
          <span className="text-sm text-tx-muted">Coming Soon</span>
        </div>
      </div>

      <div className="border border-[var(--border)] rounded-lg p-6 opacity-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-tx-primary">Follow-Up Tracker</h3>
            <p className="mt-1 text-sm text-tx-muted">
              Automated student follow-up reminders
            </p>
          </div>
          <span className="text-sm text-tx-muted">Coming Soon</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Branding Settings Tab
 * Logo URL, primary/secondary/accent color pickers with live preview
 */
const BrandingSettings: React.FC = () => {
  const { settings, refreshSettings } = useTenant();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [form, setForm] = useState({
    logoUrl:      settings?.logoUrl      || '',
    primaryColor: settings?.primaryColor || '#3B82F6',
  });

  React.useEffect(() => {
    if (!settings) return;
    setForm({
      logoUrl:      settings.logoUrl      || '',
      primaryColor: settings.primaryColor || '#3B82F6',
    });
  }, [settings]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch(`${API_BASE}/tenant/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'X-Tenant-ID': localStorage.getItem('tenant_id') || '',
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Save failed');
      await refreshSettings();
      setMessage({ type: 'success', text: 'Branding saved! Colors updated live.' });
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ type: 'error', text: 'Failed to save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const presets = [
    { name: 'Ocean Blue', primary: '#3B82F6' },
    { name: 'Slate Pro',  primary: '#475569' },
    { name: 'Emerald',    primary: '#059669' },
    { name: 'Crimson',    primary: '#DC2626' },
    { name: 'Midnight',   primary: '#1E40AF' },
    { name: 'Violet',     primary: '#7C3AED' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-tx-primary">Branding</h2>
        <p className="mt-1 text-sm text-tx-muted">Customize your school's visual identity. Changes apply live across the app.</p>
      </div>

      {message && (
        <div className={`rounded-md p-4 text-sm font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.type === 'success' ? '✓ ' : '✗ '}{message.text}
        </div>
      )}

      {/* Logo */}
      <div className="border border-[var(--border)] rounded-lg p-6 space-y-4">
        <h3 className="text-sm font-semibold text-tx-secondary uppercase tracking-wide">Logo</h3>
        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-1">Logo URL</label>
          <p className="text-xs text-tx-muted mb-3">Paste a URL to your logo image (PNG or SVG recommended, transparent background).</p>
          <input
            type="url"
            value={form.logoUrl}
            onChange={set('logoUrl')}
            placeholder="https://yoursite.com/logo.png"
            className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
        {form.logoUrl && (
          <div className="mt-3 p-4 bg-surface2 rounded-lg border border-[var(--border)] flex items-center gap-4">
            <span className="text-xs text-tx-muted">Preview:</span>
            <img
              src={form.logoUrl}
              alt="Logo preview"
              className="h-12 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
      </div>

      {/* Brand Color */}
      <div className="border border-[var(--border)] rounded-lg p-6 space-y-4">
        <h3 className="text-sm font-semibold text-tx-secondary uppercase tracking-wide">Brand Color</h3>

        {/* Presets */}
        <div>
          <p className="text-xs text-tx-muted mb-3">Choose a preset or pick a custom color below.</p>
          <div className="flex flex-wrap gap-2">
            {presets.map(p => (
              <button
                key={p.name}
                type="button"
                onClick={() => setForm(f => ({ ...f, primaryColor: p.primary }))}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-xs font-medium transition-colors ${
                  form.primaryColor === p.primary
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-[var(--border)] bg-surface text-tx-secondary hover:border-[var(--border-strong)]'
                }`}
              >
                <span className="w-3 h-3 rounded-full" style={{ background: p.primary }} />
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Custom picker */}
        <div className="space-y-2 pt-2">
          <label htmlFor="brand-color-picker" className="block text-sm font-medium text-tx-secondary">Custom</label>
          <div className="flex items-center gap-3">
            <input
              id="brand-color-picker"
              type="color"
              title="Pick a brand color"
              value={form.primaryColor}
              onChange={set('primaryColor')}
              className="w-10 h-10 rounded-lg border border-[var(--border-strong)] cursor-pointer p-0.5"
            />
            <input
              type="text"
              title="Brand color hex value"
              placeholder="#3B82F6"
              value={form.primaryColor}
              onChange={e => {
                const v = e.target.value;
                if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setForm(f => ({ ...f, primaryColor: v }));
              }}
              maxLength={7}
              className="w-32 px-3 py-2 border border-[var(--border-strong)] rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div className="h-2 rounded-full mt-1" style={{ background: form.primaryColor }} />
        </div>

        {/* Live preview */}
        <div className="mt-2 rounded-lg overflow-hidden border border-[var(--border)]">
          <div className="px-4 py-3 text-sm font-medium text-white flex items-center gap-3" style={{ background: form.primaryColor }}>
            <span className="w-2 h-2 rounded-full bg-white/60" />
            Brand color preview — nav, buttons, badges
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-primary text-white rounded-lg hover:brightness-90 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {saving ? 'Saving…' : 'Save Branding'}
        </button>
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
        <h2 className="text-lg font-semibold text-tx-primary">Notification Settings</h2>
        <p className="mt-1 text-sm text-tx-muted">
          Configure email and SMS notifications
        </p>
      </div>

      <div className="text-center text-tx-muted py-12">
        Coming soon: Email templates, SMS settings, notification preferences, etc.
      </div>
    </div>
  );
};

export default SettingsPage;
