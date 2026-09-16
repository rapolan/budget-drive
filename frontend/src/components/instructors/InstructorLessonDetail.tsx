import React from 'react';
import { X, Clock, MapPin, FileText, Car } from 'lucide-react';
import type { Lesson } from '@/types';
import { format12Hour } from '@/utils/timeFormat';

interface InstructorLessonDetailProps {
  lesson: Lesson;
  studentName: string;
  onClose: () => void;
}

// Read-only lesson detail for the instructor "My Schedule" view - reuses
// data already fetched for the day (no separate API call, unlike the
// admin LessonModal, which is a full edit form and fetches the entire
// tenant's students/instructors/vehicles lists). An instructor doesn't
// need to edit lesson core details here, just see them.
export const InstructorLessonDetail: React.FC<InstructorLessonDetailProps> = ({ lesson, studentName, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-lg shadow-lg max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-tx-primary">{studentName}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-surface2 text-tx-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-tx-secondary">
            <Clock className="h-4 w-4 text-tx-muted" />
            {format12Hour(lesson.startTime)} - {format12Hour(lesson.endTime)} ({lesson.duration} min)
          </div>
          {lesson.pickupAddress && (
            <div className="flex items-center gap-2 text-tx-secondary">
              <MapPin className="h-4 w-4 text-tx-muted" />
              {lesson.pickupAddress}
            </div>
          )}
          {lesson.vehicleId && (
            <div className="flex items-center gap-2 text-tx-secondary">
              <Car className="h-4 w-4 text-tx-muted" />
              Vehicle assigned
            </div>
          )}
          {lesson.notes && (
            <div className="flex items-start gap-2 text-tx-secondary">
              <FileText className="h-4 w-4 text-tx-muted mt-0.5" />
              <span>{lesson.notes}</span>
            </div>
          )}
          <div className="pt-2 text-xs text-tx-muted capitalize">
            Status: {lesson.status.replace('_', ' ')}
          </div>
        </div>
      </div>
    </div>
  );
};
