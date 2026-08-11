import React from 'react';
import { Calendar, User, Clock, MapPin, CheckCircle, Filter, Sun, Sunset, Moon } from 'lucide-react';
import { Student, Instructor, DatePresetsResponse } from '@/types';
import { extractZipCode } from '@/utils/zipCode';

export type TimePreference = 'any' | 'morning' | 'afternoon' | 'evening';
export type LessonType = 'behind_wheel' | 'classroom' | 'observation' | 'road_test';
export type DatePreset = 'next2Weeks' | 'thisMonth' | 'nextMonth' | 'custom';

interface SetupStepProps {
  preselectedStudent?: Student;
  preselectedInstructor?: Instructor;
  selectedStudent: Student | undefined;
  selectedStudentId: string;
  setSelectedStudentId: (id: string) => void;
  students: Student[];
  studentSearch: string;
  setStudentSearch: (value: string) => void;
  showStudentDropdown: boolean;
  setShowStudentDropdown: (value: boolean) => void;
  pickupAddress: string;
  setPickupAddress: (value: string) => void;
  pickupZip: string | null;
  setPickupZip: (value: string | null) => void;
  lessonType: LessonType;
  setLessonType: (value: LessonType) => void;
  duration: number;
  setDuration: (value: number) => void;
  timePreference: TimePreference;
  setTimePreference: (value: TimePreference) => void;
  datePresets: DatePresetsResponse | undefined;
  datePreset: DatePreset;
  setDatePreset: (value: DatePreset) => void;
  searchStartDate: string | null;
  setSearchStartDate: (value: string | null) => void;
  searchEndDate: string | null;
  setSearchEndDate: (value: string | null) => void;
  loading: boolean;
  onCancel?: () => void;
  onFindSlots: () => void;
}

export const SetupStep: React.FC<SetupStepProps> = ({
  preselectedStudent,
  preselectedInstructor,
  selectedStudent,
  selectedStudentId,
  setSelectedStudentId,
  students,
  studentSearch,
  setStudentSearch,
  showStudentDropdown,
  setShowStudentDropdown,
  pickupAddress,
  setPickupAddress,
  pickupZip,
  setPickupZip,
  lessonType,
  setLessonType,
  duration,
  setDuration,
  timePreference,
  setTimePreference,
  datePresets,
  datePreset,
  setDatePreset,
  searchStartDate,
  setSearchStartDate,
  searchEndDate,
  setSearchEndDate,
  loading,
  onCancel,
  onFindSlots,
}) => {
  // Helper: Get full address string from student's structured fields
  const getStudentFullAddress = (student: Student): string => {
    if (student.addressLine1) {
      const parts = [
        student.addressLine1,
        student.addressLine2,
        student.city && student.state ? `${student.city}, ${student.state}` : student.city || student.state,
        student.zipCode
      ].filter(Boolean);
      return parts.join(', ');
    }
    return student.address || '';
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Get display name
  const getStudentDisplay = (student: Student) => {
    const duplicates = students.filter(s => s.fullName === student.fullName);
    if (duplicates.length > 1) {
      return `${student.fullName} (${student.email || student.phone || 'no contact'})`;
    }
    return student.fullName;
  };

  const filteredStudents = students.filter((s: Student) =>
    s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
    (s.email?.toLowerCase().includes(studentSearch.toLowerCase()) ?? false)
  );

  return (
    <div className="p-6 space-y-6">
      {/* Student Selection */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <User className="h-5 w-5 text-primary" />
          <label className="block text-sm font-semibold text-tx-primary">
            Student <span className="text-status-danger-text">*</span>
          </label>
        </div>
        {preselectedStudent ? (
          <div className="flex items-center space-x-3 p-4 bg-status-info-bg border border-status-info-border rounded-lg">
            <div className="h-12 w-12 rounded-full bg-primary text-white flex items-center justify-center font-semibold">
              {getInitials(preselectedStudent.fullName)}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-tx-primary">{preselectedStudent.fullName}</div>
              <div className="text-sm text-tx-secondary">{preselectedStudent.email}</div>
            </div>
          </div>
        ) : selectedStudent ? (
          <div className="flex items-center space-x-3 p-4 bg-status-info-bg border border-status-info-border rounded-lg">
            <div className="h-12 w-12 rounded-full bg-primary text-white flex items-center justify-center font-semibold">
              {getInitials(selectedStudent.fullName)}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-tx-primary">{selectedStudent.fullName}</div>
              <div className="text-sm text-tx-secondary">{selectedStudent.email}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedStudentId('');
                setStudentSearch('');
                setPickupAddress('');
                setPickupZip(null);
              }}
              className="text-sm text-primary hover:brightness-75 font-medium"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => {
                setStudentSearch(e.target.value);
                setShowStudentDropdown(true);
              }}
              onFocus={() => setShowStudentDropdown(true)}
              placeholder="Search by name or email..."
              autoComplete="nope"
              className="w-full px-4 py-3 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            {showStudentDropdown && filteredStudents.length > 0 && (
              <div className="absolute z-20 w-full mt-2 bg-surface border border-edge-strong rounded-lg shadow-xl max-h-64 overflow-y-auto">
                {filteredStudents.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => {
                      setSelectedStudentId(student.id);
                      setStudentSearch(getStudentDisplay(student));
                      setShowStudentDropdown(false);
                      const addr = getStudentFullAddress(student);
                      setPickupAddress(addr);
                      setPickupZip(extractZipCode(addr) || student.zipCode || null);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-status-info-bg transition-colors border-b border-edge last:border-0 flex items-center space-x-3"
                  >
                    <div className="h-10 w-10 rounded-full bg-surface3 text-tx-secondary flex items-center justify-center font-semibold text-sm">
                      {getInitials(student.fullName)}
                    </div>
                    <div>
                      <div className="font-medium text-tx-primary">{student.fullName}</div>
                      <div className="text-sm text-tx-muted">{student.email || student.phone}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Instructor (locked when preselected) */}
      {preselectedInstructor && (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <User className="h-5 w-5 text-primary" />
            <label className="block text-sm font-semibold text-tx-primary">Instructor</label>
          </div>
          <div className="flex items-center space-x-3 p-4 bg-status-info-bg border border-status-info-border rounded-lg">
            <div className="h-12 w-12 rounded-full bg-primary text-white flex items-center justify-center font-semibold">
              {getInitials(preselectedInstructor.fullName)}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-tx-primary">{preselectedInstructor.fullName}</div>
              <div className="text-sm text-tx-secondary">{preselectedInstructor.email}</div>
            </div>
          </div>
        </div>
      )}

      {/* Pickup Address */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <MapPin className="h-5 w-5 text-status-warning-text" />
          <label className="block text-sm font-semibold text-tx-primary">
            Pickup Location <span className="text-status-danger-text">*</span>
          </label>
        </div>
        <textarea
          value={pickupAddress}
          onChange={(e) => setPickupAddress(e.target.value)}
          placeholder="Enter pickup address (include zip code for best results)..."
          rows={2}
          className="w-full px-4 py-3 border border-edge-strong rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
        />
        {pickupZip ? (
          <p className="text-xs text-status-success-text flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            Zip code detected: {pickupZip}
          </p>
        ) : pickupAddress && (
          <p className="text-xs text-status-warning-text">
            ⚠️ No zip code detected. Add a zip code for accurate proximity matching.
          </p>
        )}
      </div>

      {/* Lesson Details Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-2">
            <Calendar className="h-4 w-4 inline mr-1 text-purple-600" />
            Lesson Type
          </label>
          <select
            title="Select lesson type"
            value={lessonType}
            onChange={(e) => setLessonType(e.target.value as LessonType)}
            className="w-full px-4 py-3 border border-edge-strong rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            <option value="behind_wheel">Behind the Wheel</option>
            <option value="classroom">Classroom</option>
            <option value="observation">Observation</option>
            <option value="road_test">Road Test</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-2">
            <Clock className="h-4 w-4 inline mr-1 text-orange-600" />
            Duration
          </label>
          <select
            title="Select lesson duration"
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value))}
            className="w-full px-4 py-3 border border-edge-strong rounded-lg focus:ring-2 focus:ring-orange-500"
          >
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hours</option>
            <option value={120}>2 hours</option>
          </select>
        </div>
      </div>

      {/* Search Dates */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Calendar className="h-5 w-5 text-primary" />
          <label className="block text-sm font-semibold text-tx-primary">
            Search Dates
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: 'next2Weeks', label: 'Next 2 Weeks' },
              { value: 'thisMonth', label: 'This Month' },
              { value: 'nextMonth', label: 'Next Month' },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              disabled={!datePresets}
              onClick={() => setDatePreset(value)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 ${
                datePreset === value
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface text-tx-secondary border-edge-strong hover:bg-surface2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="booking-search-from" className="block text-xs font-medium text-tx-secondary mb-1">From</label>
            <input
              id="booking-search-from"
              type="date"
              value={searchStartDate ?? ''}
              onChange={(e) => {
                setSearchStartDate(e.target.value || null);
                setDatePreset('custom');
              }}
              className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="booking-search-to" className="block text-xs font-medium text-tx-secondary mb-1">To</label>
            <input
              id="booking-search-to"
              type="date"
              value={searchEndDate ?? ''}
              onChange={(e) => {
                setSearchEndDate(e.target.value || null);
                setDatePreset('custom');
              }}
              className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Time Preference */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Filter className="h-5 w-5 text-indigo-600" />
          <label className="block text-sm font-semibold text-tx-primary">
            Time Preference (optional)
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'any', label: 'Any Time', icon: null },
            { value: 'morning', label: 'Morning (6am-12pm)', icon: Sun },
            { value: 'afternoon', label: 'Afternoon (12pm-5pm)', icon: Sunset },
            { value: 'evening', label: 'Evening (5pm-9pm)', icon: Moon },
          ].map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTimePreference(value as TimePreference)}
              className={`px-4 py-2 rounded-lg border-2 transition-all flex items-center gap-2 ${
                timePreference === value
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-edge hover:border-edge-strong text-tx-secondary'
              }`}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Continue Button */}
      <div className="border-t border-edge pt-6 flex space-x-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-6 py-3 border-2 border-edge-strong text-tx-secondary rounded-lg hover:bg-surface2 transition-colors font-medium"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={onFindSlots}
          disabled={!selectedStudentId || !pickupZip || loading}
          className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg"
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Finding Best Slots...
            </span>
          ) : preselectedInstructor ? (
            'Find Available Times'
          ) : (
            'Find Available Instructors'
          )}
        </button>
      </div>
    </div>
  );
};
