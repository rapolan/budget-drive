import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Plus, X, Users, CheckCircle } from 'lucide-react';
import { classroomApi, instructorsApi, enrollmentsApi } from '@/api';
import type { DeCohort, CreateCohortSessionInput, OnlineDeInProgressEntry, OnlineDeCompletedEntry } from '@/api/classroom';
import { Button, EmptyState, LoadingSpinner, Tabs } from '@/components/common';
import type { TabItem } from '@/components/common';
import { formatShortDate } from '@/utils/timeFormat';
import { CohortRoster } from '@/components/classroom/CohortRoster';

const CURRICULUM_DAYS = [1, 2, 3, 4] as const;

type ClassroomTab = 'cohorts' | 'online';
const TAB_ITEMS: TabItem<ClassroomTab>[] = [
  { value: 'cohorts', label: 'Cohorts' },
  { value: 'online', label: 'Online' },
];

/**
 * Driver education classroom tracking (Phase 3 of the compliance-records
 * arc). Two views under one Tabs bar: Cohorts (the original two-pane
 * layout - cohort list + selected cohort's roster, students x 4
 * curriculum-day checkboxes) and Online - online DE has no cohort of its
 * own, so it had no "complete them here" surface until now; this tab
 * lists every in-progress online DE enrollment tenant-wide. No
 * conflict-checking against behind-the-wheel lessons - a cohort's teacher
 * and schedule are entirely independent of BTW scheduling.
 */
export const ClassroomPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<ClassroomTab>('cohorts');
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
  const { data: onlineData, isLoading: onlineLoading } = useQuery({
    queryKey: ['classroom', 'online-in-progress'],
    queryFn: () => classroomApi.getOnlineDeInProgress(),
    enabled: activeTab === 'online',
  });
  const { data: onlineCompletedData, isLoading: onlineCompletedLoading } = useQuery({
    queryKey: ['classroom', 'online-completed'],
    queryFn: () => classroomApi.getOnlineDeCompleted(),
    enabled: activeTab === 'online',
  });

  const allCohorts: DeCohort[] = React.useMemo(() => cohortsData?.data || [], [cohortsData]);
  // Active/completed split (item 3) - a closed class (status='completed',
  // set only by the "Close class" action) moves out of the working list
  // into a browsable, read-only record below it, mirroring the
  // Certificates page's worklist-then-issued-log structure. Cancelled
  // cohorts stay in the active list (unaffected by this split - they're
  // not a completed record, and CohortRoster still lets them be edited).
  const cohorts = React.useMemo(() => allCohorts.filter((c) => c.status !== 'completed'), [allCohorts]);
  const completedCohorts = React.useMemo(
    () =>
      allCohorts
        .filter((c) => c.status === 'completed')
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [allCohorts]
  );
  const deTeachers = React.useMemo(
    () => (instructorsData?.data || []).filter((i) => i.isDeTeacher === true),
    [instructorsData]
  );
  const onlineInProgress: OnlineDeInProgressEntry[] = React.useMemo(() => onlineData?.data || [], [onlineData]);
  const onlineCompleted: OnlineDeCompletedEntry[] = React.useMemo(
    () => onlineCompletedData?.data || [],
    [onlineCompletedData]
  );

  const selectedCohort = allCohorts.find((c) => c.id === selectedCohortId) || null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['classroom', 'cohorts'] });
  };

  const invalidateOnline = () => {
    queryClient.invalidateQueries({ queryKey: ['classroom', 'online-in-progress'] });
    queryClient.invalidateQueries({ queryKey: ['classroom', 'online-completed'] });
    queryClient.invalidateQueries({ queryKey: ['students'] });
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

  const updateHoursMutation = useMutation({
    mutationFn: ({ enrollmentId, manualCompletedHours }: { enrollmentId: string; manualCompletedHours: number }) =>
      enrollmentsApi.update(enrollmentId, { manualCompletedHours }),
    onSuccess: () => invalidateOnline(),
  });

  // Reused as-is - the same endpoint EnrollmentSubPanel's "Mark complete"
  // button calls. Marking complete here flows into the exact same
  // certificate worklist as every other completion path (see the DE
  // worklist's readyReason='completed' branch) - no separate completion
  // logic for the Online tab.
  const completeMutation = useMutation({
    mutationFn: (enrollmentId: string) => enrollmentsApi.complete(enrollmentId),
    onSuccess: () => invalidateOnline(),
  });

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-tx-primary">Classroom</h1>
          <p className="mt-1 text-sm text-tx-muted">Schedule driver education classes and track attendance.</p>
        </div>
        {activeTab === 'cohorts' && (
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4" />
            New class
          </Button>
        )}
      </div>

      <Tabs items={TAB_ITEMS} activeValue={activeTab} onChange={setActiveTab} aria-label="Classroom view" />

      {activeTab === 'cohorts' && (
        <>
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

          {/* Completed classes (item 3) - browse/history only, newest
              first. Selecting one reuses the exact same CohortRoster
              component the active list uses; CohortRoster itself switches
              to a read-only render once cohort.status === 'completed', so
              there's no separate "closed roster" component here. */}
          {!cohortsLoading && completedCohorts.length > 0 && (
            <div className="pt-2">
              <h2 className="text-sm font-semibold text-tx-primary mb-3">Completed classes</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-3">
                  {completedCohorts.map((cohort) => (
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
                        <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 capitalize bg-status-success-bg text-status-success-text">
                          {cohort.status}
                        </span>
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

                <div className="lg:col-span-2">
                  {selectedCohort && selectedCohort.status === 'completed' ? (
                    <CohortRoster cohort={selectedCohort} onCohortUpdated={invalidate} />
                  ) : (
                    <div className="h-full flex items-center justify-center rounded-xl border border-edge bg-surface p-12">
                      <p className="text-sm text-tx-muted">Select a completed class to view its final roster.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'online' && (
        <div>
          {onlineLoading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {!onlineLoading && onlineInProgress.length === 0 && (
            <EmptyState
              icon={<GraduationCap className="h-10 w-10" />}
              title="Nothing in progress"
              description="Online driver education students being worked toward completion will show up here."
            />
          )}

          {!onlineLoading && onlineInProgress.length > 0 && (
            <div className="rounded-xl border border-edge bg-surface divide-y divide-edge overflow-hidden">
              {onlineInProgress.map((entry) => (
                <OnlineDeRow
                  key={entry.enrollmentId}
                  entry={entry}
                  onSaveHours={(hours) =>
                    updateHoursMutation.mutate({ enrollmentId: entry.enrollmentId, manualCompletedHours: hours })
                  }
                  onMarkComplete={() => completeMutation.mutate(entry.enrollmentId)}
                  isSavingHours={updateHoursMutation.isPending}
                  isCompleting={completeMutation.isPending}
                />
              ))}
            </div>
          )}

          {/* Completed (item 4) - browse/history only, newest first.
              Certificate issuance is handled entirely by the certificate
              worklist; no actions live here beyond viewing. */}
          {!onlineCompletedLoading && onlineCompleted.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-tx-primary mb-3">Completed</h2>
              <div className="rounded-xl border border-edge bg-surface divide-y divide-edge overflow-hidden">
                {onlineCompleted.map((entry) => (
                  <div key={entry.enrollmentId} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-tx-primary truncate">{entry.studentName}</p>
                      <p className="text-xs text-tx-muted">
                        {entry.manualCompletedHours ?? 0} hours logged
                        {entry.completedAt ? ` · Completed ${formatShortDate(entry.completedAt)}` : ''}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-status-success-bg text-status-success-text flex-shrink-0">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Completed
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface OnlineDeRowProps {
  entry: OnlineDeInProgressEntry;
  onSaveHours: (hours: number) => void;
  onMarkComplete: () => void;
  isSavingHours: boolean;
  isCompleting: boolean;
}

const OnlineDeRow: React.FC<OnlineDeRowProps> = ({ entry, onSaveHours, onMarkComplete, isSavingHours, isCompleting }) => {
  const [hoursInput, setHoursInput] = React.useState(String(entry.manualCompletedHours ?? ''));

  return (
    <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-tx-primary truncate">{entry.studentName}</p>
        <p className="text-xs text-tx-muted">
          {entry.manualCompletedHours ?? 0} / {entry.hoursRequired} hours logged
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <input
          type="number"
          min="0"
          step="0.5"
          value={hoursInput}
          onChange={(e) => setHoursInput(e.target.value)}
          placeholder="Hours"
          className="w-20 px-2 py-1.5 border border-edge-strong rounded-lg text-sm bg-surface"
          aria-label={`Hours logged for ${entry.studentName}`}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onSaveHours(Number(hoursInput) || 0)}
          disabled={isSavingHours}
        >
          Save hours
        </Button>
        <Button size="sm" onClick={onMarkComplete} disabled={isCompleting}>
          <CheckCircle className="h-3.5 w-3.5" />
          Mark complete
        </Button>
      </div>
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
