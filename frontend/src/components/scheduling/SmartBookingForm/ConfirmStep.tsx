import React from 'react';
import { CheckCircle, FileText } from 'lucide-react';
import { Student } from '@/types';
import { SlotWithProximity } from './GroupedAvailabilityView';
import { Button } from '@/components/common';
import { OutstandingFeeFlagsBanner } from './SetupStep';

interface ConfirmStepProps {
  selectedStudent: Student | undefined;
  selectedSlot: SlotWithProximity;
  lessonType: string;
  duration: number;
  pickupAddress: string;
  lessonNumber: number | null;
  setLessonNumber: (value: number | null) => void;
  cost: number;
  setCost: (value: number) => void;
  notes: string;
  setNotes: (value: string) => void;
  loading: boolean;
  formatShortDate: (date: string) => string;
  formatTime: (time: string) => string;
  getProximityBadge: (score: number) => { label: string; class: string };
  onBack: () => void;
  onConfirm: () => void;
}

export const ConfirmStep: React.FC<ConfirmStepProps> = ({
  selectedStudent,
  selectedSlot,
  lessonType,
  duration,
  pickupAddress,
  lessonNumber,
  setLessonNumber,
  cost,
  setCost,
  notes,
  setNotes,
  loading,
  formatShortDate,
  formatTime,
  getProximityBadge,
  onBack,
  onConfirm,
}) => {
  return (
    <div className="p-6 space-y-6">
      <div className="bg-status-info-bg rounded-lg p-6 border border-status-info-border">
        <h3 className="text-lg font-semibold text-tx-primary mb-4 flex items-center">
          <CheckCircle className="h-5 w-5 text-status-success-text mr-2" />
          Booking Summary
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-tx-secondary">Student</span>
            <span className="font-semibold text-tx-primary">{selectedStudent?.fullName}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-tx-secondary">Instructor</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-tx-primary">{selectedSlot.instructorName}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${getProximityBadge(selectedSlot.proximityScore).class}`}>
                {getProximityBadge(selectedSlot.proximityScore).label}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-edge pt-4">
            <span className="text-sm text-tx-secondary">Date & Time</span>
            <div className="text-right">
              <div className="font-semibold text-tx-primary">{formatShortDate(selectedSlot.date)}</div>
              <div className="text-sm text-tx-secondary">
                {formatTime(selectedSlot.startTimeLocal)} - {formatTime(selectedSlot.endTimeLocal)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-tx-secondary">Lesson Type</span>
            <span className="font-semibold text-tx-primary capitalize">{lessonType.replace(/_/g, ' ')}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-tx-secondary">Duration</span>
            <span className="font-semibold text-tx-primary">{duration} minutes</span>
          </div>

          <div className="flex items-start justify-between">
            <span className="text-sm text-tx-secondary">Pickup</span>
            <span className="font-semibold text-tx-primary text-right max-w-xs">{pickupAddress}</span>
          </div>
        </div>
      </div>

      {selectedStudent && <OutstandingFeeFlagsBanner studentId={selectedStudent.id} />}

      {/* Editable fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-1.5">
            Lesson # (auto-suggested)
          </label>
          <select
            title="Select lesson number"
            value={lessonNumber || ''}
            onChange={(e) => setLessonNumber(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
          >
            <option value="">Not set</option>
            {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
              <option key={num} value={num}>Lesson #{num}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-1.5">
            Cost ($) - Edit for discounts
          </label>
          <input
            type="number"
            title="Lesson cost"
            placeholder="Enter cost"
            value={cost}
            onChange={(e) => setCost(parseFloat(e.target.value) || 0)}
            min="0"
            step="0.01"
            autoComplete="nope"
            className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-tx-secondary mb-1.5">
          <FileText className="h-4 w-4 inline mr-1" />
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any notes for the instructor..."
          rows={2}
          className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm resize-none"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3 pt-4">
        <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
          ← Back
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onConfirm}
          disabled={loading}
          loading={loading}
          className="flex-1"
        >
          {loading ? 'Booking...' : `Confirm Booking - $${cost.toFixed(2)}`}
        </Button>
      </div>
    </div>
  );
};
