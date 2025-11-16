import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { instructorsApi } from '@/api';
import {
  AvailabilityCalendar,
  AvailabilityEditor,
  TimeOffManager,
  SmartBookingForm,
  CalendarSync,
  RecurringPatterns,
} from '@/components/scheduling';

type Tab = 'availability' | 'timeoff' | 'booking' | 'calendar' | 'patterns';

export const SchedulingPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('availability');
  const [selectedInstructorId, setSelectedInstructorId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch instructors for the dropdown
  const { data: instructorsResponse } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
  });

  const instructors = instructorsResponse?.data;

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const tabs = [
    { id: 'availability' as Tab, label: 'Availability', icon: '📅' },
    { id: 'timeoff' as Tab, label: 'Time Off', icon: '🏖️' },
    { id: 'booking' as Tab, label: 'Smart Booking', icon: '✨' },
    { id: 'calendar' as Tab, label: 'Calendar Sync', icon: '🔄' },
    { id: 'patterns' as Tab, label: 'Recurring Patterns', icon: '🔁' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Scheduling</h1>
          <p className="text-gray-600 mt-1">
            Manage instructor availability, time off, smart booking, calendar sync, and recurring patterns
          </p>
        </div>
      </div>

      {/* Instructor Selector */}
      <div className="bg-white rounded-lg shadow p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Instructor
        </label>
        <select
          value={selectedInstructorId}
          onChange={(e) => setSelectedInstructorId(e.target.value)}
          className="w-full md:w-96 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">-- Select an Instructor --</option>
          {instructors?.map((instructor) => (
            <option key={instructor.id} value={instructor.id}>
              {instructor.fullName} ({instructor.email})
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          Choose an instructor to manage their availability, time off, and calendar settings
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Availability Tab */}
          {activeTab === 'availability' && (
            <div className="space-y-6">
              {selectedInstructorId ? (
                <>
                  <AvailabilityEditor
                    key={`editor-${refreshKey}`}
                    instructorId={selectedInstructorId}
                    onUpdate={handleRefresh}
                  />

                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Weekly Calendar View
                    </h3>
                    <AvailabilityCalendar
                      key={`calendar-${refreshKey}`}
                      instructorId={selectedInstructorId}
                      editable={false}
                    />
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  Please select an instructor above to manage availability
                </div>
              )}
            </div>
          )}

          {/* Time Off Tab */}
          {activeTab === 'timeoff' && (
            <div>
              {selectedInstructorId ? (
                <TimeOffManager
                  key={`timeoff-${refreshKey}`}
                  instructorId={selectedInstructorId}
                  allowApproval={true}
                  onUpdate={handleRefresh}
                />
              ) : (
                <div>
                  <div className="mb-4 text-gray-700">
                    Showing all time off requests (Admin View)
                  </div>
                  <TimeOffManager
                    key={`timeoff-all-${refreshKey}`}
                    showAllInstructors={true}
                    allowApproval={true}
                    onUpdate={handleRefresh}
                  />
                </div>
              )}
            </div>
          )}

          {/* Smart Booking Tab */}
          {activeTab === 'booking' && (
            <div>
              <SmartBookingForm
                key={`booking-${refreshKey}`}
                onBookingComplete={(lessonId) => {
                  alert(`Lesson created successfully! ID: ${lessonId}`);
                  handleRefresh();
                }}
              />
            </div>
          )}

          {/* Calendar Sync Tab */}
          {activeTab === 'calendar' && (
            <div>
              {selectedInstructorId ? (
                <CalendarSync
                  key={`calendar-${refreshKey}`}
                  instructorId={selectedInstructorId}
                />
              ) : (
                <div className="text-center py-12 text-gray-500">
                  Please select an instructor above to manage calendar sync
                </div>
              )}
            </div>
          )}

          {/* Recurring Patterns Tab */}
          {activeTab === 'patterns' && (
            <div>
              <RecurringPatterns key={`patterns-${refreshKey}`} />
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Instructors</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">—</p>
            </div>
            <div className="text-4xl">👨‍🏫</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Time Off</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">—</p>
            </div>
            <div className="text-4xl">⏳</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">This Week's Lessons</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">—</p>
            </div>
            <div className="text-4xl">📚</div>
          </div>
        </div>
      </div>
    </div>
  );
};
