import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, AlertTriangle, Clock, FileText, MapPin, Calendar, User, RefreshCw } from 'lucide-react';
import { lessonsApi, instructorsApi, studentsApi, vehiclesApi } from '@/api';
import type { Lesson, CreateLessonInput } from '@/types';
import { getConflictMessage } from '@/utils/conflictMessages';
import { ModalShell } from '@/components/common/ModalShell';
import { StatusMenu } from './StatusMenu';

interface LessonDetailsPanelProps {
  lesson: Lesson;
  onClose: () => void;
  onReschedule: (lesson: Lesson) => void;
  canReschedule: boolean;
  onComplete: (id: string) => void;
  onNoShow: (id: string) => void;
  onCancel: (id: string) => void;
}

type DetailsFields = Pick<
  CreateLessonInput,
  'lessonType' | 'cost' | 'pickupAddress' | 'vehicleId' | 'notes' | 'lessonNumber'
>;

/**
 * Edit entry point for an EXISTING lesson's non-schedule fields - notes,
 * cost, pickup address, vehicle, lesson type/number - plus status
 * transitions (StatusMenu) and a Reschedule button that hands off to
 * SmartBookingForm's existingLesson mode for anything schedule-related
 * (student, instructor, date, time). Replaces LessonModal.tsx, which is
 * removed in the same change - its create path was unreachable from the
 * UI (Lessons.tsx's "Add Lesson" already opens SmartBookingForm) and its
 * edit path is what this component replaces.
 *
 * Deliberately does NOT render studentId/instructorId/date/startTime/
 * endTime/duration as editable fields - those are schedule-relevant and
 * move to SmartBookingForm/Reschedule. vehicleId is the one exception:
 * it's still editable here even though lessonService.ts's touchesSchedule
 * gate treats it as schedule-relevant (changing it re-runs the full
 * conflict check server-side) - this component has no client-side
 * pre-check for that, it just surfaces the server's rejection via
 * submitError, same as every other field here.
 */
export const LessonDetailsPanel: React.FC<LessonDetailsPanelProps> = ({
  lesson,
  onClose,
  onReschedule,
  canReschedule,
  onComplete,
  onNoShow,
  onCancel,
}) => {
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [fields, setFields] = useState<DetailsFields>({
    lessonType: lesson.lessonType,
    // Postgres numeric columns arrive as strings ("50.00", not 50) - coerce
    // on seed so an edit that never touches cost doesn't round-trip a string.
    cost: Number(lesson.cost),
    pickupAddress: lesson.pickupAddress || '',
    vehicleId: lesson.vehicleId,
    notes: lesson.notes || '',
    lessonNumber: lesson.lessonNumber ?? null,
  });

  // Student/instructor are read-only display here, resolved by id rather
  // than looked up in Lessons.tsx's page-level, capped
  // studentsApi.getAll(1, 1000)/instructorsApi.getAll() lists - same
  // pagination hazard as the Reschedule student-lookup fix (a lesson for
  // a student/instructor outside that page would otherwise show nothing).
  const { data: studentData } = useQuery({
    queryKey: ['students', 'by-id', lesson.studentId],
    queryFn: () => studentsApi.getById(lesson.studentId),
  });
  const { data: instructorData } = useQuery({
    queryKey: ['instructors', 'by-id', lesson.instructorId],
    queryFn: () => instructorsApi.getById(lesson.instructorId),
  });
  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehiclesApi.getAll(),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateLessonInput>) => lessonsApi.update(lesson.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'lessons' || query.queryKey[0] === 'instructor-lessons',
      });
      // Editing cost affects treasury.
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      onClose();
    },
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFields((prev) => ({
      ...prev,
      [name]: name === 'cost' ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    try {
      // Never includes studentId/instructorId/date/startTime/endTime/
      // duration - those are reschedule-only. vehicleId IS included (see
      // the component doc comment above on why that one field still
      // triggers the server's conflict re-check).
      await updateMutation.mutateAsync({
        lessonType: fields.lessonType,
        cost: fields.cost,
        pickupAddress: fields.pickupAddress || null,
        vehicleId: fields.vehicleId || null,
        notes: fields.notes,
        lessonNumber: fields.lessonNumber,
      });
    } catch (err: any) {
      const conflictType = err.response?.data?.conflictType;
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to save lesson';
      setSubmitError(getConflictMessage(conflictType, errorMsg));
    }
  };

  const formatTime = (time: string) => {
    const [hoursStr, minutes] = time.split(':');
    const hour = parseInt(hoursStr, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const statusBadgeClass: Record<Lesson['status'], string> = {
    scheduled: 'bg-status-info-bg text-status-info-text border-status-info-border',
    completed: 'bg-status-success-bg text-status-success-text border-status-success-border',
    cancelled: 'bg-status-danger-bg text-status-danger-text border-status-danger-border',
    no_show: 'bg-status-warning-bg text-status-warning-text border-status-warning-border',
  };

  return (
    <ModalShell maxWidth="max-w-2xl">
      {/* Header */}
      <div className="sticky top-0 bg-surface/95 border-b border-edge-glass/40 px-6 py-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-tx-primary">Lesson Details</h2>
              <p className="text-sm text-tx-muted">Edit notes, cost, pickup, and vehicle</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-tx-muted hover:text-tx-secondary hover:bg-surface2 rounded-lg transition-all"
            aria-label="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Read-only schedule summary + status + reschedule */}
        <div className="rounded-lg border border-edge bg-surface2/50 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-tx-primary font-medium">{studentData?.data?.fullName || 'Loading...'}</span>
              <span className="text-tx-muted">with</span>
              <span className="text-tx-primary font-medium">{instructorData?.data?.fullName || 'Loading...'}</span>
            </div>
            <StatusMenu
              trigger={
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusBadgeClass[lesson.status]}`}>
                  {lesson.status.replace('_', ' ')}
                </span>
              }
              disabled={lesson.status !== 'scheduled'}
              onComplete={() => onComplete(lesson.id)}
              onNoShow={() => onNoShow(lesson.id)}
              onCancel={() => onCancel(lesson.id)}
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-tx-secondary">
            <Calendar className="h-4 w-4 text-tx-muted flex-shrink-0" />
            {formatDate(lesson.date)}
            <Clock className="h-4 w-4 text-tx-muted flex-shrink-0 ml-2" />
            {formatTime(lesson.startTime.substring(0, 5))} - {formatTime(lesson.endTime.substring(0, 5))}
          </div>
          {canReschedule && (
            <button
              type="button"
              onClick={() => onReschedule(lesson)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:brightness-75"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reschedule
            </button>
          )}
        </div>

        {/* Lesson Type & Vehicle Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
              <FileText className="h-4 w-4 text-primary" />
              Lesson Type
            </label>
            <select
              name="lessonType"
              value={fields.lessonType}
              onChange={handleChange}
              title="Select Lesson Type"
              className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            >
              <option value="behind_wheel">Behind the Wheel</option>
              <option value="classroom">Classroom</option>
              <option value="road_test_prep">Road Test Prep</option>
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
              Vehicle
            </label>
            <select
              name="vehicleId"
              value={fields.vehicleId || ''}
              onChange={handleChange}
              title="Select Vehicle"
              className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            >
              <option value="">Unassigned</option>
              {vehiclesData?.data
                ?.filter((v) => v.status === 'active')
                .map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.make} {vehicle.model} ({vehicle.licensePlate})
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Cost */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
            <span className="text-primary">$</span>
            Cost
          </label>
          <input
            type="number"
            name="cost"
            value={fields.cost}
            onChange={handleChange}
            min="0"
            step="0.01"
            autoComplete="off"
            className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            placeholder="50.00"
          />
          {/* Set at booking time when the student had a completed INTERNAL
              driver_education enrollment - shown for auditability, not
              editable (reflects what was applied at booking, not a live
              recalculation). Ported verbatim from the old LessonModal. */}
          {lesson.deDiscountApplied != null && Number(lesson.deDiscountApplied) > 0 && (
            <p className="text-xs text-tx-muted mt-1">
              ${Number(lesson.deDiscountApplied).toFixed(2)} driver education discount applied at booking
            </p>
          )}
        </div>

        {/* Pickup Address */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
            <MapPin className="h-4 w-4 text-primary" />
            Pickup Address
          </label>
          <input
            type="text"
            name="pickupAddress"
            value={fields.pickupAddress || ''}
            onChange={handleChange}
            placeholder="e.g. 123 Maple Ave, Los Angeles, CA 90006"
            autoComplete="off"
            className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
            <FileText className="h-4 w-4 text-primary" />
            Notes
          </label>
          <textarea
            name="notes"
            value={fields.notes}
            onChange={handleChange}
            rows={3}
            placeholder="Additional notes about this lesson..."
            className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
          />
        </div>

        {/* Server-side conflict / error banner - vehicle changes still
            re-run the full scheduling-conflict check server-side
            (touchesSchedule treats vehicleId as schedule-relevant), so a
            vehicle swap that collides surfaces here, not via any
            client-side pre-check. */}
        {submitError && (
          <div className="flex items-start gap-3 rounded-lg border border-status-danger-border bg-status-danger-bg p-4">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-status-danger-text mt-0.5" />
            <p className="text-sm text-status-danger-text">{submitError}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-edge">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-tx-secondary hover:text-tx-primary hover:bg-surface2 rounded-lg transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
