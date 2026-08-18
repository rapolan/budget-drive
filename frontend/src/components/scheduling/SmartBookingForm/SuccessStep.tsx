import React from 'react';
import { CheckCircle } from 'lucide-react';
import { Student } from '@/types';
import { SlotWithProximity } from './GroupedAvailabilityView';
import { Button } from '@/components/common';

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
          {selectedStudent?.fullName} on {formatShortDate(bookedSlot.date)} at {formatTime(bookedSlot.startTimeLocal)}
          {bookedSlot.instructorName ? ` with ${bookedSlot.instructorName}` : ''}
        </p>
      </div>

      <div className="flex space-x-3 pt-2">
        <Button type="button" variant="secondary" onClick={onDone} className="flex-1">
          Done
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onBookAnother}
          disabled={loading}
          loading={loading}
          className="flex-1"
        >
          {loading ? 'Finding Slots...' : 'Book Another Lesson'}
        </Button>
      </div>
    </div>
  );
};
