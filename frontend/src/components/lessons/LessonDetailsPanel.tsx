import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X,
  AlertTriangle,
  FileText,
  MapPin,
  Phone,
  User,
  Car,
  RefreshCw,
  ChevronDown,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { lessonsApi, instructorsApi, studentsApi, vehiclesApi } from '@/api';
import type { Lesson, CreateLessonInput } from '@/types';
import { getConflictMessage } from '@/utils/conflictMessages';
import { format12Hour, parseLocalDate } from '@/utils/timeFormat';
import { ModalShell } from '@/components/common/ModalShell';
import { Skeleton } from '@/components/common/Skeleton';
import { Button } from '@/components/common/Button';

interface LessonDetailsPanelProps {
  lesson: Lesson;
  onClose: () => void;
  onReschedule: (lesson: Lesson) => void;
  canReschedule: boolean;
  onComplete: (id: string) => void;
  onNoShow: (id: string) => void;
  onCancel: (id: string) => void;
  onBookAgain: (lesson: Lesson) => void;
}

type DetailsFields = Pick<
  CreateLessonInput,
  'lessonType' | 'cost' | 'pickupAddress' | 'vehicleId' | 'notes' | 'lessonNumber'
>;

const statusBadgeClass: Record<Lesson['status'], string> = {
  scheduled: 'bg-status-info-bg text-status-info-text border-status-info-border',
  completed: 'bg-status-success-bg text-status-success-text border-status-success-border',
  cancelled: 'bg-status-danger-bg text-status-danger-text border-status-danger-border',
  no_show: 'bg-status-warning-bg text-status-warning-text border-status-warning-border',
};

// parseLocalDate reads a YYYY-MM-DD (or ISO datetime) string's date portion
// directly, never through a UTC-shifting `new Date(string)` parse - the
// same bug class CLAUDE.md warns about (Lessons.tsx's own formatDate uses
// the same helper for this exact reason).
const formatDate = (date: Date | string) => {
  return parseLocalDate(String(date)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// lesson.duration is a Postgres numeric column, serialized as a string
// ("120.00", not 120) - coerce before formatting. Whole-hour durations
// read as "N hour(s)"; anything else as whole minutes ("90 min"), never
// the raw decimal ("120.00 min").
const formatDuration = (duration: number | string) => {
  const minutes = Math.round(Number(duration));
  if (minutes > 0 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${minutes} min`;
};

/**
 * Quick-reference summary first, edit form second: the owner opens a
 * lesson to answer "who, where, which car, what happened last time," not
 * to edit fields. Replaces the old field-first layout (see git history for
 * that version) - this is a full redesign, not an incremental change.
 *
 * Schedule fields (student, instructor, date, start/end time, duration)
 * are never editable here - they move to SmartBookingForm's Reschedule
 * flow. vehicleId IS still editable here even though lessonService.ts's
 * touchesSchedule gate treats it as schedule-relevant (changing it re-runs
 * the full conflict check server-side) - this component has no
 * client-side pre-check for that, it just surfaces the server's rejection
 * via submitError, same as every other field here.
 */
export const LessonDetailsPanel: React.FC<LessonDetailsPanelProps> = ({
  lesson,
  onClose,
  onReschedule,
  canReschedule,
  onComplete,
  onNoShow,
  onCancel,
  onBookAgain,
}) => {
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);

  const isTerminal = lesson.status !== 'scheduled';

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
  // Small, scoped lookup (by student id, LIMIT 1 server-side) for the
  // "Last lesson" note - deliberately a separate, narrower endpoint from
  // lessonsApi.getMostRecentByStudent (no status filter there, no
  // exclusion) so it can't surface the lesson currently being viewed or a
  // future scheduled one. Hidden entirely when there is none.
  const { data: lastNoteData } = useQuery({
    queryKey: ['lessons', 'last-completed-note', lesson.studentId, lesson.id],
    queryFn: () => lessonsApi.getLastCompletedNoteByStudent(lesson.studentId, lesson.id),
  });

  const student = studentData?.data;
  const instructor = instructorData?.data;
  const vehicle = vehiclesData?.data?.find((v) => v.id === lesson.vehicleId);
  // Progress/payment are scoped to THIS lesson's own enrollment, not
  // whatever enrollment the student happens to be actively displaying
  // elsewhere - a lesson can belong to an old/completed enrollment.
  const enrollment = student?.enrollments?.find((e) => e.id === lesson.enrollmentId);
  const progress = enrollment?.progress;
  const paymentSummary = enrollment?.paymentSummary;
  const lastNote = lastNoteData?.data;

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
      if (isTerminal) {
        // Terminal lessons: only Notes is editable (see point 8 of the
        // spec) - never send cost/type/vehicle/pickup for a closed record.
        await updateMutation.mutateAsync({ notes: fields.notes });
        return;
      }

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

  const mapsHref = lesson.pickupAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lesson.pickupAddress)}`
    : null;

  const studentName = student?.fullName;
  const instructorName = instructor?.fullName;

  return (
    <ModalShell maxWidth="max-w-2xl">
      {/* Header - student name + status badge, display-only; subtitle is
          date/time/duration. No "Lesson Details" boilerplate copy. */}
      <div className="sticky top-0 bg-surface/95 border-b border-edge-glass/40 px-6 py-4 z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {studentName ? (
                <h2 className="text-lg font-semibold text-tx-primary truncate">{studentName}</h2>
              ) : (
                <Skeleton width={140} height={22} />
              )}
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadgeClass[lesson.status]}`}
              >
                {lesson.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm text-tx-muted mt-0.5">
              {formatDate(lesson.date)} &middot; {format12Hour(lesson.startTime.substring(0, 5))}&ndash;
              {format12Hour(lesson.endTime.substring(0, 5))} &middot; {formatDuration(lesson.duration)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-tx-muted hover:text-tx-secondary hover:bg-surface2 rounded-lg transition-all flex-shrink-0"
            aria-label="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Read-only summary grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-medium text-tx-muted uppercase tracking-wide">Phone</p>
            {student?.phone ? (
              <a href={`tel:${student.phone}`} className="text-tx-primary hover:text-primary flex items-center gap-1.5 mt-0.5">
                <Phone className="h-3.5 w-3.5 text-tx-muted" />
                {student.phone}
              </a>
            ) : (
              <p className="text-tx-muted mt-0.5">Not on file</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-tx-muted uppercase tracking-wide">Instructor</p>
            <p className="text-tx-primary flex items-center gap-1.5 mt-0.5">
              <User className="h-3.5 w-3.5 text-tx-muted" />
              {instructorName || <Skeleton width={100} height={16} />}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-tx-muted uppercase tracking-wide">Pickup</p>
            {lesson.pickupAddress ? (
              <a
                href={mapsHref!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-tx-primary hover:text-primary flex items-start gap-1.5 mt-0.5"
              >
                <MapPin className="h-3.5 w-3.5 text-tx-muted flex-shrink-0 mt-0.5" />
                <span>{lesson.pickupAddress}</span>
              </a>
            ) : (
              <p className="text-tx-muted mt-0.5">Not set</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-tx-muted uppercase tracking-wide">Vehicle</p>
            <p className="text-tx-primary flex items-center gap-1.5 mt-0.5">
              <Car className="h-3.5 w-3.5 text-tx-muted" />
              {vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.licensePlate})` : 'Unassigned'}
            </p>
          </div>
          {/* Omitted when lesson-counts aren't cheaply available (no progress
              on this lesson's own enrollment) rather than showing 0 of 0.
              "Lesson N of M" (N = this lesson's own position) only when
              lesson.lessonNumber is actually set - it's a plain, optional
              field on the lesson row (not auto-numbered), so it's often
              null. Otherwise falls back to "N of M completed," which is
              always correct regardless of where THIS lesson falls in the
              sequence (the earlier "Lesson 0 of 3" wording incorrectly
              implied this lesson was #0 for any upcoming/cancelled lesson,
              when 0 was really just the completed-count so far). */}
          {progress?.lessonsCompleted != null && progress?.lessonsRequired != null && (
            <div>
              <p className="text-xs font-medium text-tx-muted uppercase tracking-wide">Progress</p>
              <p className="text-tx-primary mt-0.5">
                {lesson.lessonNumber != null
                  ? `Lesson ${lesson.lessonNumber} of ${progress.lessonsRequired}`
                  : `${progress.lessonsCompleted} of ${progress.lessonsRequired} completed`}
              </p>
            </div>
          )}
          {/* Omitted when no payment field exists on this lesson's
              enrollment, AND when the status is "unknown" (nothing useful
              to show either way) - see PR description for the no-payment-
              field case as a follow-up where it doesn't apply. Labeled
              "Enrollment balance," not "Payment," since this is the
              enrollment's running total, not a per-lesson payment. */}
          {paymentSummary && paymentSummary.paymentStatus !== 'unknown' && (
            <div>
              <p className="text-xs font-medium text-tx-muted uppercase tracking-wide">Enrollment balance</p>
              <p className="text-tx-primary mt-0.5">
                ${paymentSummary.totalPaid.toFixed(2)} paid
                {paymentSummary.outstandingBalance ? `, $${paymentSummary.outstandingBalance.toFixed(2)} owed` : ''}
              </p>
            </div>
          )}
        </div>

        {/* Last lesson note - hidden entirely when there is none */}
        {lastNote && (
          <div className="rounded-lg border border-edge bg-surface2/50 p-4">
            <p className="text-xs font-medium text-tx-muted uppercase tracking-wide mb-1">
              Last lesson &middot; {formatDate(lastNote.date)}
            </p>
            <p className="text-sm text-tx-secondary whitespace-pre-wrap">{lastNote.notes}</p>
          </div>
        )}

        {/* Action row - scheduled lessons only. The status badge above is
            display-only now; these are plain visible buttons, not a hidden
            StatusMenu dropdown. */}
        {!isTerminal && (
          <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-edge">
            <div>
              {canReschedule && (
                <Button type="button" variant="secondary" onClick={() => onReschedule(lesson)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reschedule
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => onComplete(lesson.id)}>
                <CheckCircle className="h-3.5 w-3.5 text-status-success-text" />
                Complete
              </Button>
              <Button type="button" variant="secondary" onClick={() => onNoShow(lesson.id)}>
                <AlertCircle className="h-3.5 w-3.5 text-status-warning-text" />
                No-show
              </Button>
              <Button type="button" variant="secondary" onClick={() => onCancel(lesson.id)}>
                <X className="h-3.5 w-3.5 text-status-danger-text" />
                Cancel lesson
              </Button>
            </div>
          </div>
        )}

        {/* Cancelled lessons: Book Again instead of the action row - never
            un-cancels in place (reviewed_at/reviewed_by, any fee flag
            already created, stay as-is on a closed record). */}
        {lesson.status === 'cancelled' && (
          <div className="pt-2 border-t border-edge">
            <Button type="button" variant="secondary" onClick={() => onBookAgain(lesson)}>
              <RefreshCw className="h-3.5 w-3.5" />
              Book Again
            </Button>
          </div>
        )}

        {/* Notes - first editable field, same for scheduled and terminal
            lessons (the one field terminal lessons may still edit). */}
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

        {/* Pickup address + vehicle, side by side - not editable on a
            terminal lesson. */}
        {!isTerminal && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.make} {v.model} ({v.licensePlate})
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}

        {/* Admin details - collapsed by default, scheduled lessons only
            editable (terminal lessons show these read-only, excluded
            entirely below instead since they're not editable anyway). */}
        {!isTerminal && (
          <div className="border border-edge rounded-lg">
            <button
              type="button"
              onClick={() => setAdminOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-tx-secondary hover:bg-surface2 rounded-lg transition-all"
              aria-expanded={adminOpen}
            >
              Admin details
              <ChevronDown className={`h-4 w-4 transition-transform ${adminOpen ? 'rotate-180' : ''}`} />
            </button>
            {adminOpen && (
              <div className="px-4 pb-4 space-y-4">
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
                      Lesson Number
                    </label>
                    <input
                      type="number"
                      name="lessonNumber"
                      value={fields.lessonNumber ?? ''}
                      onChange={handleChange}
                      min="1"
                      autoComplete="off"
                      className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                  </div>
                </div>
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
                  {/* Set at booking time when the student had a completed
                      INTERNAL driver_education enrollment - shown for
                      auditability, not editable (reflects what was applied
                      at booking, not a live recalculation). */}
                  {lesson.deDiscountApplied != null && Number(lesson.deDiscountApplied) > 0 && (
                    <p className="text-xs text-tx-muted mt-1">
                      ${Number(lesson.deDiscountApplied).toFixed(2)} driver education discount applied at booking
                    </p>
                  )}
                  <p className="text-xs text-tx-muted mt-1">
                    Editing cost does not update treasury or payment records (known follow-up).
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

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

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-edge">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" variant="primary" loading={updateMutation.isPending}>
            Save changes
          </Button>
        </div>
      </form>
    </ModalShell>
  );
};
