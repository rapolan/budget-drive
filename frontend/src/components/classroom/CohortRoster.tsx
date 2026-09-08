import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, AlertTriangle, UserMinus } from 'lucide-react';
import { classroomApi } from '@/api';
import type { DeCohort } from '@/api/classroom';
import { Button, LoadingSpinner } from '@/components/common';
import { formatShortDate } from '@/utils/timeFormat';
import { MakeUpStudentPicker } from './MakeUpStudentPicker';
import { AddStudentPanel } from './AddStudentPanel';
import { StudentModal } from '@/components/students/StudentModal';

// Which "add a student to this cohort" surface is active - never more than
// one at a time, and never nested inside another (StudentModal owns its
// own full-size ModalShell, so it must be a sibling of AddStudentPanel's
// ModalShell, not a child rendered inside it).
type AddStudentMode = 'closed' | 'panel' | 'new-student';

interface CohortRosterProps {
  cohort: DeCohort;
  onCohortUpdated: () => void;
}

/**
 * A cohort's roster, students down the side and its 4 curriculum-day
 * sessions across the top. Each cell is a real per-(student, session)
 * de_attendance record, not a per-cohort flag - a checked cell here can
 * represent a make-up guest from a different home cohort, tagged as such.
 * "Missing N days" is cohort-agnostic (from the same batched roster
 * response), so a make-up attended elsewhere already counts here.
 */
export const CohortRoster: React.FC<CohortRosterProps> = ({ cohort, onCohortUpdated }) => {
  const queryClient = useQueryClient();
  const [addingMakeUpForSession, setAddingMakeUpForSession] = React.useState<string | null>(null);
  const [addStudentMode, setAddStudentMode] = React.useState<AddStudentMode>('closed');
  const [removingEnrollmentId, setRemovingEnrollmentId] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['classroom', 'cohort-roster', cohort.id],
    queryFn: () => classroomApi.getCohortRoster(cohort.id),
  });

  const roster = data?.data;
  const sessions = roster?.sessions ?? [];
  const students = roster?.students ?? [];

  const invalidateRoster = () => {
    queryClient.invalidateQueries({ queryKey: ['classroom', 'cohort-roster', cohort.id] });
    onCohortUpdated();
  };

  const attendanceMutation = useMutation({
    mutationFn: ({ sessionId, enrollmentId, present }: { sessionId: string; enrollmentId: string; present: boolean }) =>
      classroomApi.recordAttendance(sessionId, { enrollmentId, present }),
    onSuccess: invalidateRoster,
  });

  // Ends membership only - de_attendance has no FK to de_cohort_enrollments,
  // so days already attended are untouched and stay counted toward this
  // enrollment's 4/4 completion total even after removal. The enrollment
  // can join a different cohort afterward via the ordinary Add student flow.
  const removeMutation = useMutation({
    mutationFn: (enrollmentId: string) => classroomApi.removeCohortEnrollment(cohort.id, enrollmentId),
    onSuccess: () => {
      invalidateRoster();
      setRemovingEnrollmentId(null);
    },
  });

  return (
    <div className="rounded-xl border border-edge bg-surface">
      <div className="p-4 border-b border-edge flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-tx-primary">{cohort.name}</h2>
          <p className="text-xs text-tx-muted mt-1">{cohort.enrolledCount}/{cohort.capacity} enrolled</p>
        </div>
        <Button size="sm" onClick={() => setAddStudentMode('panel')}>
          <UserPlus className="h-4 w-4" />
          Add student
        </Button>
      </div>

      {addStudentMode === 'panel' && (
        <AddStudentPanel
          cohort={cohort}
          onClose={() => setAddStudentMode('closed')}
          onAdded={invalidateRoster}
          onSwitchToNewStudent={() => setAddStudentMode('new-student')}
        />
      )}

      {addStudentMode === 'new-student' && (
        <StudentModal
          student={null}
          initialEnrollmentPreset={{ cohortId: cohort.id, cohortName: cohort.name }}
          onClose={() => {
            setAddStudentMode('closed');
            invalidateRoster();
          }}
        />
      )}

      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {!isLoading && students.length === 0 && (
        <p className="text-sm text-tx-muted italic p-6">No students enrolled in this class yet.</p>
      )}

      {!isLoading && students.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">Student</th>
                {sessions.map((session) => (
                  <th key={session.id} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                    <div>Day {session.curriculumDay}</div>
                    <div className="text-tx-muted font-normal normal-case">{formatShortDate(session.sessionDate)}</div>
                    <button
                      type="button"
                      onClick={() => setAddingMakeUpForSession(session.id)}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline font-normal normal-case"
                    >
                      <UserPlus className="h-3 w-3" />
                      Add make-up
                    </button>
                    {addingMakeUpForSession === session.id && (
                      <MakeUpStudentPicker
                        sessionId={session.id}
                        existingEnrollmentIds={students.map((s) => s.enrollmentId)}
                        onClose={() => setAddingMakeUpForSession(null)}
                        onAdded={invalidateRoster}
                      />
                    )}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {students.map((student) => {
                const missingDays = student.missingCurriculumDays.length;
                const isRemoving = removingEnrollmentId === student.enrollmentId;
                return (
                  <React.Fragment key={student.enrollmentId}>
                    <tr>
                      <td className="px-4 py-3 text-sm text-tx-primary">
                        {student.studentName}
                        {missingDays > 0 && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-status-warning-text">
                            <AlertTriangle className="h-3 w-3" />
                            Missing {missingDays} day{missingDays === 1 ? '' : 's'}
                          </span>
                        )}
                      </td>
                      {sessions.map((session) => {
                        const entry = student.attendance[session.id];
                        const present = entry?.present ?? false;
                        const isHomeCohort = entry?.isHomeCohort ?? true;
                        return (
                          <td key={session.id} className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <input
                                type="checkbox"
                                aria-label={`${student.studentName} present Day ${session.curriculumDay}`}
                                checked={present}
                                disabled={attendanceMutation.isPending}
                                onChange={(e) =>
                                  attendanceMutation.mutate({
                                    sessionId: session.id,
                                    enrollmentId: student.enrollmentId,
                                    present: e.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-edge-strong text-primary focus:ring-primary"
                              />
                              {!isHomeCohort && (
                                <span className="text-xs text-tx-muted italic">(make-up)</span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setRemovingEnrollmentId(isRemoving ? null : student.enrollmentId)}
                          className="inline-flex items-center gap-1 text-xs text-tx-muted hover:text-status-danger-text"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </td>
                    </tr>
                    {isRemoving && (
                      <tr>
                        <td colSpan={sessions.length + 2} className="px-4 py-3 bg-status-warning-bg border-y border-status-warning-border">
                          <p className="text-sm text-status-warning-text mb-2">
                            This ends {student.studentName}'s membership in {cohort.name}. Their attendance record
                            for days already attended is kept. They can be added to another cohort afterward.
                          </p>
                          <div className="flex gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setRemovingEnrollmentId(null)}>
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => removeMutation.mutate(student.enrollmentId)}
                              disabled={removeMutation.isPending}
                            >
                              {removeMutation.isPending ? 'Removing...' : 'Confirm remove'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
