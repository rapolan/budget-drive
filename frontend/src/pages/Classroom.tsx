import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Plus, X, Users } from 'lucide-react';
import { classroomApi, instructorsApi } from '@/api';
import type { DeCohort, CreateCohortSessionInput } from '@/api/classroom';
import { Button, EmptyState, LoadingSpinner } from '@/components/common';
import { formatShortDate } from '@/utils/timeFormat';
import { CohortRoster } from '@/components/classroom/CohortRoster';

const CURRICULUM_DAYS = [1, 2, 3, 4] as const;

/**
 * Driver education classroom tracking (Phase 3 of the compliance-records
 * arc). Two-pane layout: cohort list on the left, the selected cohort's
 * roster (students x 4 curriculum-day checkboxes) on the right. No
 * conflict-checking against behind-the-wheel lessons - a cohort's teacher
 * and schedule are entirely independent of BTW scheduling.
 */
export const ClassroomPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedCohortId, setSelectedCohortId] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);

  const { data: cohortsData, isLoading: cohortsLoading } = useQuery({
    queryKey: ['classroom', 'cohorts'],
    queryFn: () => classroomApi.getCohorts(),
  });
  const { data: instructorsData } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
  });

  const cohorts: DeCohort[] = React.useMemo(() => cohortsData?.data || [], [cohortsData]);
  const deTeachers = React.useMemo(
    () => (instructorsData?.data || []).filter((i) => i.isDeTeacher === true),
    [instructorsData]
  );

  const selectedCohort = cohorts.find((c) => c.id === selectedCohortId) || null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['classroom', 'cohorts'] });
  };

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      teacherInstructorId: string | null;
      capacity: number;
      sessions: CreateCohortSessionInput[];
    }) => classroomApi.createCohort(data),
    onSuccess: (response) => {
      invalidate();
      setIsCreating(false);
      if (response.data) {
        setSelectedCohortId(response.data.id);
      }
    },
  });

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-tx-primary">Classroom</h1>
          <p className="mt-1 text-sm text-tx-muted">Schedule driver education classes and track attendance.</p>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="h-4 w-4" />
          New class
        </Button>
      </div>

      {cohortsLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {!cohortsLoading && cohorts.length === 0 && !isCreating && (
        <EmptyState
          icon={<GraduationCap className="h-10 w-10" />}
          title="No classes scheduled yet"
          description="Create a class to start scheduling driver education sessions."
        />
      )}

      {!cohortsLoading && (cohorts.length > 0 || isCreating) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left pane: cohort list */}
          <div className="lg:col-span-1 space-y-3">
            {isCreating && (
              <NewCohortForm
                deTeachers={deTeachers}
                onCancel={() => setIsCreating(false)}
                onSubmit={(data) => createMutation.mutate(data)}
                isPending={createMutation.isPending}
                error={createMutation.isError ? 'Failed to create class' : null}
              />
            )}
            {cohorts.map((cohort) => (
              <button
                key={cohort.id}
                type="button"
                onClick={() => setSelectedCohortId(cohort.id)}
                className={`w-full text-left rounded-xl border p-4 transition-colors ${
                  selectedCohortId === cohort.id
                    ? 'border-primary bg-status-info-bg'
                    : 'border-edge bg-surface hover:bg-surface2'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-tx-primary truncate">{cohort.name}</p>
                  {cohort.status !== 'scheduled' && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${
                        cohort.status === 'cancelled'
                          ? 'bg-status-danger-bg text-status-danger-text'
                          : 'bg-status-success-bg text-status-success-text'
                      }`}
                    >
                      {cohort.status}
                    </span>
                  )}
                </div>
                {cohort.sessions.length > 0 && (
                  <p className="text-xs text-tx-muted mt-1">
                    {formatShortDate(cohort.sessions[0].sessionDate)} &ndash;{' '}
                    {formatShortDate(cohort.sessions[cohort.sessions.length - 1].sessionDate)}
                  </p>
                )}
                <p className="text-xs text-tx-muted mt-1 flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {cohort.enrolledCount}/{cohort.capacity} enrolled
                </p>
              </button>
            ))}
          </div>

          {/* Right pane: selected cohort's roster */}
          <div className="lg:col-span-2">
            {selectedCohort ? (
              <CohortRoster cohort={selectedCohort} onCohortUpdated={invalidate} />
            ) : (
              <div className="h-full flex items-center justify-center rounded-xl border border-edge bg-surface p-12">
                <p className="text-sm text-tx-muted">Select a class to view its roster.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface NewCohortFormProps {
  deTeachers: { id: string; fullName: string }[];
  onCancel: () => void;
  onSubmit: (data: {
    name: string;
    teacherInstructorId: string | null;
    capacity: number;
    sessions: CreateCohortSessionInput[];
  }) => void;
  isPending: boolean;
  error: string | null;
}

const NewCohortForm: React.FC<NewCohortFormProps> = ({ deTeachers, onCancel, onSubmit, isPending, error }) => {
  const [name, setName] = React.useState('');
  const [teacherInstructorId, setTeacherInstructorId] = React.useState('');
  const [capacity, setCapacity] = React.useState('20');
  const [dates, setDates] = React.useState<Record<1 | 2 | 3 | 4, string>>({ 1: '', 2: '', 3: '', 4: '' });

  const canSubmit = name.trim() && capacity && CURRICULUM_DAYS.every((day) => dates[day]);

  return (
    <div className="rounded-xl border border-edge-strong bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-tx-primary">New class</p>
        <button type="button" onClick={onCancel} className="p-1 text-tx-muted hover:text-tx-secondary" aria-label="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && <p className="text-xs text-status-danger-text">{error}</p>}

      <div>
        <label htmlFor="new-cohort-name" className="block text-xs font-medium text-tx-secondary mb-1">Class name</label>
        <input
          id="new-cohort-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nov 2026 Weekend"
          className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
        />
      </div>

      <div>
        <label htmlFor="new-cohort-teacher" className="block text-xs font-medium text-tx-secondary mb-1">Teacher</label>
        <select
          id="new-cohort-teacher"
          value={teacherInstructorId}
          onChange={(e) => setTeacherInstructorId(e.target.value)}
          className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
        >
          <option value="">No teacher assigned</option>
          {deTeachers.map((t) => (
            <option key={t.id} value={t.id}>{t.fullName}</option>
          ))}
        </select>
        {deTeachers.length === 0 && (
          <p className="text-xs text-tx-muted mt-1">No instructors are flagged as DE teachers yet.</p>
        )}
      </div>

      <div>
        <label htmlFor="new-cohort-capacity" className="block text-xs font-medium text-tx-secondary mb-1">Capacity</label>
        <input
          id="new-cohort-capacity"
          type="number"
          min="1"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-tx-secondary">Class dates</p>
        {CURRICULUM_DAYS.map((day) => (
          <div key={day} className="flex items-center gap-2">
            <label htmlFor={`new-cohort-day-${day}`} className="text-xs text-tx-secondary w-12 flex-shrink-0">Day {day}</label>
            <input
              id={`new-cohort-day-${day}`}
              type="date"
              value={dates[day]}
              onChange={(e) => setDates((d) => ({ ...d, [day]: e.target.value }))}
              className="flex-1 px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
            />
          </div>
        ))}
      </div>

      <Button
        className="w-full justify-center"
        disabled={!canSubmit || isPending}
        onClick={() =>
          onSubmit({
            name: name.trim(),
            teacherInstructorId: teacherInstructorId || null,
            capacity: Number(capacity),
            sessions: CURRICULUM_DAYS.map((day) => ({ curriculumDay: day, sessionDate: dates[day] })),
          })
        }
      >
        {isPending ? 'Creating...' : 'Create class'}
      </Button>
    </div>
  );
};
