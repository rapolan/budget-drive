import React from 'react';
import { CheckCircle } from 'lucide-react';
import { Student } from '@/types';
import { SlotWithProximity } from './GroupedAvailabilityView';

interface SuccessStepProps {
  selectedStudent: Student | undefined;
  bookedSlot: SlotWithProximity;
  loading: boolean;
  formatShortDate: (date: string) => string;
  formatTime: (time: string) => string;
  onBookAnother: () => void;
  onDone: () => void;
}

export const SuccessStep: React.FC<SuccessStepProps> = ({
  selectedStudent,
  bookedSlot,
  loading,
  formatShortDate,
  formatTime,
  onBookAnother,
  onDone,
}) => {
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col items-center text-center py-6">
        <div className="h-16 w-16 rounded-full bg-status-success-bg border border-status-success-border flex items-center justify-center mb-4">
          <CheckCircle className="h-8 w-8 text-status-success-text" />
        </div>
        <h3 className="text-lg font-semibold text-tx-primary">Lesson Booked!</h3>
        <p className="text-sm text-tx-secondary mt-1">
          {selectedStudent?.fullName} on {formatShortDate(bookedSlot.date)} at {formatTime(bookedSlot.startTime)}
          {bookedSlot.instructorName ? ` with ${bookedSlot.instructorName}` : ''}
        </p>
      </div>

      <div className="flex space-x-3 pt-2">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 px-6 py-3 border-2 border-edge-strong text-tx-secondary rounded-lg hover:bg-surface2 transition-colors font-medium"
        >
          Done
        </button>
        <button
          type="button"
          onClick={onBookAnother}
          disabled={loading}
          className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg"
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Finding Slots...
            </span>
          ) : (
            'Book Another Lesson'
          )}
        </button>
      </div>
    </div>
  );
};
