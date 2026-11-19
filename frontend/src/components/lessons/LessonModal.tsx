import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, AlertTriangle, Clock, Hash, Calendar, User, FileText, MapPin } from 'lucide-react';
import { lessonsApi, studentsApi, instructorsApi, vehiclesApi } from '@/api';
import type { Lesson, CreateLessonInput } from '@/types';
import { getConflictMessage } from '@/utils/conflictMessages';
import { ModalShell } from '@/components/common/ModalShell';

interface LessonModalProps {
  lesson: Lesson | null;
  onClose: () => void;
}

export const LessonModal: React.FC<LessonModalProps> = ({ lesson, onClose }) => {
  const queryClient = useQueryClient();
  const isEditing = Boolean(lesson);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateLessonInput>({
    studentId: '',
    instructorId: '',
    vehicleId: '', // Will be auto-assigned to first available vehicle
    date: '',
    startTime: '',
    endTime: '',
    duration: 60,
    lessonNumber: null,
    lessonType: 'behind_wheel',
    cost: 50,
    pickupAddress: '',
    notes: '',
  });

  // Fetch related data for dropdowns. Students/instructors are only needed
  // for the CREATE path's pickers (this component's create branch is
  // currently unreachable from the UI - Lessons.tsx's "Add Lesson" opens
  // SmartBookingForm instead - but kept working rather than deleted here;
  // see the lesson-edit-redesign plan for the follow-up that removes this
  // component once LessonDetailsPanel ships). Gated off when editing, since
  // edit mode already knows its student/instructor from the lesson prop
  // and previously paid for an unscoped, uncapped fetch of every student/
  // instructor in the tenant on every single edit-modal open for no reason.
  const { data: studentsData } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(1, 1000),
    enabled: !isEditing,
  });

  const { data: instructorsData } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
    enabled: !isEditing,
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehiclesApi.getAll(),
  });

  // Auto-select first available vehicle
  useEffect(() => {
    if (vehiclesData?.data && vehiclesData.data.length > 0 && !formData.vehicleId) {
      const activeVehicle = vehiclesData.data.find(v => v.status === 'active');
      if (activeVehicle) {
        setFormData(prev => ({ ...prev, vehicleId: activeVehicle.id }));
      }
    }
  }, [vehiclesData, formData.vehicleId]);

  // Helper: build full address string from student record
  const getStudentFullAddress = (student: any): string => {
    if (student?.addressLine1) {
      return [
        student.addressLine1,
        student.addressLine2,
        student.city && student.state
          ? `${student.city}, ${student.state}`
          : student.city || student.state,
        student.zipCode,
      ].filter(Boolean).join(', ');
    }
    return student?.address || '';
  };

  // Suggested lesson number (create-only, below) used to need every lesson
  // in the tenant (lessonsApi.getAll(1, 10000) - a full-table-scan-shaped
  // fetch repeated on every modal open, edit included, just to count one
  // student's lessons client-side). Since this UI is unreachable for
  // create today (see note above) and is never used in edit mode (gated
  // to !isEditing just below), it's dropped entirely rather than replaced
  // with a smaller scoped fetch - there is no live caller left that reads
  // suggestedLessonNumber/estimatedTotalLessons.
  const selectedStudent = studentsData?.data?.find(s => s.id === formData.studentId);
  // hoursRequired moved off the student onto their driver_training
  // enrollment - read it via the already-attached progress object rather
  // than a field that no longer exists on Student.
  const totalHoursRequired = selectedStudent?.progress?.hoursRequired || 6;
  // Estimate total lessons based on 2-hour lessons (can be adjusted) - this
  // is a lesson-count *estimate* for the numbering UI below, not the
  // student's real progress. See studentProgressService.computeStudentProgress
  // for the single source of truth on actual progress.
  const estimatedTotalLessons = Math.ceil(totalHoursRequired / 2);

  useEffect(() => {
    if (lesson) {
      setFormData({
        studentId: lesson.studentId,
        instructorId: lesson.instructorId,
        vehicleId: lesson.vehicleId,
        date: new Date(lesson.date).toISOString().split('T')[0],
        startTime: lesson.startTime.substring(0, 5), // Convert HH:MM:SS to HH:MM
        endTime: lesson.endTime.substring(0, 5),
        // Postgres numeric columns arrive as strings ("60.00", not 60) -
        // coerce here so the auto-calculate effect below and a submit
        // without touching these fields don't round-trip a string.
        duration: Number(lesson.duration),
        lessonNumber: lesson.lessonNumber || null,
        lessonType: lesson.lessonType,
        cost: Number(lesson.cost),
        pickupAddress: lesson.pickupAddress || '',
        notes: lesson.notes || '',
      });
    }
  }, [lesson]);

  // Auto-calculate duration when times change
  useEffect(() => {
    if (formData.startTime && formData.endTime) {
      const [startHours, startMinutes] = formData.startTime.split(':').map(Number);
      const [endHours, endMinutes] = formData.endTime.split(':').map(Number);

      const startTotalMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = endHours * 60 + endMinutes;

      if (endTotalMinutes > startTotalMinutes) {
        const calculatedDuration = endTotalMinutes - startTotalMinutes;
        setFormData((prev) => ({ ...prev, duration: calculatedDuration }));
      }
    }
  }, [formData.startTime, formData.endTime]);

  // Auto-suggest lesson number when student changes (create-only). Used to
  // count the student's existing lessons via an unscoped
  // lessonsApi.getAll(1, 10000) fetch of every lesson in the tenant,
  // repeated on every modal open including edits that never used the
  // result - removed per the lesson-edit-redesign performance pass. This
  // path is also currently unreachable from the UI (Lessons.tsx's "Add
  // Lesson" opens SmartBookingForm, not this component), so a plain
  // default rather than a real count is a reasonable interim behavior
  // until LessonModal's create branch is removed outright.
  useEffect(() => {
    if (!isEditing && formData.studentId && !formData.lessonNumber) {
      setFormData(prev => ({ ...prev, lessonNumber: 1 }));
    }
  }, [formData.studentId, isEditing, formData.lessonNumber]);

  // Auto-fill pickup address from student's home address when student changes (new lessons only)
  useEffect(() => {
    if (!isEditing && formData.studentId) {
      const student = studentsData?.data?.find(s => s.id === formData.studentId);
      if (student) {
        const addr = getStudentFullAddress(student);
        if (addr) {
          setFormData(prev => ({ ...prev, pickupAddress: addr }));
        }
      }
    }
  }, [formData.studentId, studentsData, isEditing]);

  const createMutation = useMutation({
    mutationFn: (data: CreateLessonInput) => lessonsApi.create(data),
    onSuccess: () => {
      // Use predicate-based invalidation to catch all lesson queries (including Weekly view)
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'lessons' ||
          query.queryKey[0] === 'instructor-lessons'
      });
      queryClient.invalidateQueries({ queryKey: ['treasury'] }); // Refresh treasury data
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateLessonInput) => lessonsApi.update(lesson!.id, data),
    onSuccess: () => {
      // Use predicate-based invalidation to catch all lesson queries (including Weekly view)
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'lessons' ||
          query.queryKey[0] === 'instructor-lessons'
      });
      // Also invalidate treasury (editing lesson cost affects treasury)
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      onClose();
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Validate required fields - vehicle is intentionally NOT required here:
    // assignment can happen after booking (e.g. a tenant with no vehicles
    // in its fleet yet), matching createLesson's own auto-assign-or-leave-
    // unassigned behavior on the backend.
    if (!formData.studentId || !formData.instructorId) {
      alert('Please select student and instructor');
      return;
    }

    if (!formData.date || !formData.startTime || !formData.endTime) {
      alert('Please fill in date and times');
      return;
    }

    if (formData.duration <= 0) {
      alert('End time must be after start time');
      return;
    }

    // No client-side conflict pre-check here (see note above the submit
    // button below) - the server re-runs the real scheduling-conflict
    // check on save and reports it via submitError/getConflictMessage.
    const sharedFields = {
      studentId: formData.studentId,
      instructorId: formData.instructorId,
      vehicleId: formData.vehicleId || null,
      lessonNumber: formData.lessonNumber,
      lessonType: formData.lessonType,
      cost: formData.cost,
      pickupAddress: formData.pickupAddress || null,
      notes: formData.notes,
    };

    try {
      if (isEditing) {
        // updateLesson (backend) only ever reads date/startTime/endTime/
        // duration directly - unlike createLesson, it has no
        // scheduledStart/scheduledEnd conversion path at all, so sending
        // those on edit silently dropped every date/time change (the
        // fields were present in the payload but nothing on the backend
        // ever looked at them). formData already holds these in the
        // correct native shape (populated straight from the lesson being
        // edited), so no client-side date math is needed here - unlike
        // scheduledStart/scheduledEnd's `${date}T${time}:00` construction
        // below, which has no timezone marker and is a separate, already-
        // working (if timezone-naive) behavior on the create path this
        // fix intentionally leaves unchanged.
        await updateMutation.mutateAsync({
          ...sharedFields,
          date: formData.date,
          startTime: formData.startTime,
          endTime: formData.endTime,
          duration: formData.duration,
        });
      } else {
        const scheduledStart = `${formData.date}T${formData.startTime}:00`;
        const scheduledEnd = `${formData.date}T${formData.endTime}:00`;
        await createMutation.mutateAsync({
          ...sharedFields,
          scheduledStart,
          scheduledEnd,
        } as any);
      }
    } catch (err: any) {
      const conflictType = err.response?.data?.conflictType;
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to save lesson';
      setSubmitError(getConflictMessage(conflictType, errorMsg));
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'cost' || name === 'duration' ? Number(value) : value
    }));
  };

  return (
    <ModalShell maxWidth="max-w-2xl">
      {/* Header */}
      <div className="sticky top-0 bg-surface/95 border-b border-edge-glass/40 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-tx-primary">
                  {isEditing ? 'Edit Lesson' : 'Add New Lesson'}
                </h2>
                <p className="text-sm text-tx-muted">
                  {isEditing ? 'Update lesson details' : 'Schedule a new driving lesson'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-tx-muted hover:text-tx-secondary hover:bg-surface2 rounded-lg transition-all"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Student & Lesson Number Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Student */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
                <User className="h-4 w-4 text-primary" />
                Student
                <span className="text-status-danger-text">*</span>
              </label>
              <select
                name="studentId"
                value={formData.studentId}
                onChange={handleChange}
                required
                title="Select Student"
                className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              >
                <option value="">Select Student</option>
                {studentsData?.data
                  // "Active" means "has an active driver_training enrollment
                  // right now" - lessons can only be booked against one.
                  ?.filter((s) => s.activeEnrollment?.status === 'active')
                  .map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.fullName}
                    </option>
                  ))}
              </select>
            </div>

            {/* Lesson Number */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
                <Hash className="h-4 w-4 text-primary" />
                Lesson #
              </label>
              <div className="flex items-center gap-2">
                <select
                  name="lessonNumber"
                  value={formData.lessonNumber || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    lessonNumber: e.target.value ? parseInt(e.target.value) : null
                  }))}
                  title="Lesson Number"
                  className="flex-1 px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                >
                  <option value="">--</option>
                  {Array.from({ length: Math.max(estimatedTotalLessons, 10) }, (_, i) => i + 1).map(num => (
                    <option key={num} value={num}>
                      Lesson #{num}
                    </option>
                  ))}
                </select>
                {formData.studentId && (
                  <span className="text-xs text-tx-muted whitespace-nowrap">
                    of ~{estimatedTotalLessons}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Instructor & Type Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Instructor */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
                <User className="h-4 w-4 text-primary" />
                Instructor
                <span className="text-status-danger-text">*</span>
              </label>
              <select
                name="instructorId"
                value={formData.instructorId}
                onChange={handleChange}
                required
                title="Select Instructor"
                className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              >
                <option value="">Select Instructor</option>
                {instructorsData?.data
                  ?.filter((i) => i.status === 'active')
                  .map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.fullName}
                    </option>
                  ))}
              </select>
            </div>

            {/* Lesson Type */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
                <FileText className="h-4 w-4 text-primary" />
                Lesson Type
                <span className="text-status-danger-text">*</span>
              </label>
              <select
                name="lessonType"
                value={formData.lessonType}
                onChange={handleChange}
                required
                title="Select Lesson Type"
                className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              >
                <option value="behind_wheel">Behind the Wheel</option>
                <option value="classroom">Classroom</option>
                <option value="road_test_prep">Road Test Prep</option>
              </select>
            </div>
          </div>

          {/* Date Row */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
              <Calendar className="h-4 w-4 text-primary" />
              Date
              <span className="text-status-danger-text">*</span>
            </label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              required
              autoComplete="off"
              title="Select Date"
              className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          {/* Time Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Start Time */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
                <Clock className="h-4 w-4 text-primary" />
                Start Time
                <span className="text-status-danger-text">*</span>
              </label>
              <input
                type="time"
                name="startTime"
                value={formData.startTime}
                onChange={handleChange}
                required
                autoComplete="off"
                title="Select Start Time"
                className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>

            {/* End Time */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
                <Clock className="h-4 w-4 text-primary" />
                End Time
                <span className="text-status-danger-text">*</span>
              </label>
              <input
                type="time"
                name="endTime"
                value={formData.endTime}
                onChange={handleChange}
                required
                autoComplete="off"
                title="Select End Time"
                className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>

            {/* Duration (auto-calculated) */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
                <Clock className="h-4 w-4 text-tx-muted" />
                Duration
              </label>
              <input
                type="text"
                value={`${formData.duration} min`}
                readOnly
                className="w-full px-4 py-3 rounded-lg border border-edge bg-surface2 text-tx-secondary cursor-not-allowed"
                title="Auto-calculated from start and end times"
              />
            </div>
          </div>

          {/* Cost Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
                <span className="text-primary">$</span>
                Cost
                <span className="text-status-danger-text">*</span>
              </label>
              <input
                type="number"
                name="cost"
                value={formData.cost}
                onChange={handleChange}
                min="0"
                step="0.01"
                required
                autoComplete="off"
                className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                placeholder="50.00"
              />
              {/* Set at booking time when the student had a completed
                  internal driver_education enrollment - shown here for
                  auditability, not editable (it reflects what was applied
                  when the lesson was created, not a live recalculation). */}
              {lesson?.deDiscountApplied != null && Number(lesson.deDiscountApplied) > 0 && (
                <p className="text-xs text-tx-muted mt-1">
                  ${Number(lesson.deDiscountApplied).toFixed(2)} driver education discount applied at booking
                </p>
              )}
            </div>
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
              value={formData.pickupAddress || ''}
              onChange={handleChange}
              placeholder="e.g. 123 Maple Ave, Los Angeles, CA 90006"
              autoComplete="off"
              className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
            {formData.studentId && (
              <p className="text-xs text-tx-muted mt-1">
                Auto-filled from student's home address. Edit to use a different pickup location.
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-tx-primary mb-2">
              <FileText className="h-4 w-4 text-primary" />
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Additional notes about this lesson..."
              className="w-full px-4 py-3 rounded-lg border border-edge focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
            />
          </div>

          {/* Server-side conflict / error banner (e.g. an edit that collides
              with another lesson once the full scheduling-conflict check
              runs) - this is now the ONLY conflict signal in this
              component. A client-side "instructor's schedule today" /
              time-conflict preview used to live here, computed from an
              unscoped lessonsApi.getByInstructor fetch of that
              instructor's entire lesson history recomputed inline on every
              render - removed per the lesson-edit-redesign performance
              pass, since the server already re-runs the real 8-dimension
              check on save (correctly excluding the lesson's own current
              slot on edit) and this client preview was always advisory-
              only duplication of that, never a substitute. */}
          {submitError && (
            <div className="flex items-start gap-3 rounded-lg border border-status-danger-border bg-status-danger-bg p-4">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-status-danger-text mt-0.5" />
              <p className="text-sm text-status-danger-text">{submitError}</p>
            </div>
          )}

          {/* BDP Info Banner */}
          {!isEditing && (
            <div className="rounded-lg bg-status-info-bg border border-status-info-border p-4">
              <p className="text-xs text-status-info-text">
                <strong>Note:</strong> Creating this lesson will automatically record a 5 satoshi treasury fee
                and queue email notifications (booking confirmation, 24hr reminder, 1hr reminder) for both
                student and instructor.
              </p>
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
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : isEditing
                ? 'Save Changes'
                : 'Create Lesson'}
            </button>
          </div>
        </form>
    </ModalShell>
  );
};
