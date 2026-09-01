import React from 'react';
import { Plus, CheckCircle, RotateCcw, LogOut, Award, Clock, FileText } from 'lucide-react';
import type { Enrollment, ProgramType, Certificate } from '@/types';

const PROGRAM_LABELS: Record<ProgramType, string> = {
  driver_education: 'Driver Education',
  driver_training: 'Driver Training',
};

// "Dumb" component - takes the student's enrollments plus explicit callback
// props, same contract shape as GuardianSubPanel.tsx: it never decides
// create-vs-edit mode or calls an API itself, and "add"/"complete"/"reopen"/
// "withdraw"/"record certificate" are always explicit two-step actions (a
// click reveals a form, a second explicit click commits it), never implicit.
//
// Unlike guardians, there's no "create mode" staging here - a brand-new
// student already gets exactly one driver_training enrollment automatically
// at creation (Constraint A/D), so this tab is edit-mode-only, matching
// Progress/History.
interface EnrollmentSubPanelProps {
  enrollments: Enrollment[];
  canAddDriverEducation: boolean;
  canAddDriverTraining: boolean;
  isAddingProgramType: ProgramType | null;
  onStartAdd: (programType: ProgramType) => void;
  onCancelAdd: () => void;
  onConfirmAdd: (data: { hoursRequired?: number; manualCompletedHours?: number }) => void;
  isAddPending: boolean;
  onStartComplete: (enrollmentId: string) => void;
  onStartReopen: (enrollmentId: string) => void;
  completingEnrollmentId: string | null;
  reopeningEnrollmentId: string | null;
  onStartWithdraw: (enrollmentId: string) => void;
  withdrawingEnrollmentId: string | null;
  // No age check gates this action - recording is available for ANY
  // completed enrollment, not just the ones the worklist surfaces.
  onStartRecordCertificate: (enrollmentId: string) => void;
  recordingCertificateEnrollmentId: string | null;
  // Keyed by enrollmentId - undefined means "no certificate recorded yet"
  // for that enrollment, distinct from a loading/unfetched state (the
  // caller fetches this once for all of the student's enrollments).
  certificatesByEnrollmentId: Record<string, Certificate>;
  // 13 CCR §340.27 training-received transcript - no age check, available
  // for any non-completed driver_training enrollment (active, withdrawn,
  // inactive, or suspended alike).
  onGenerateTranscript: (enrollmentId: string) => void;
  generatingTranscriptEnrollmentId: string | null;
}

export const EnrollmentSubPanel: React.FC<EnrollmentSubPanelProps> = ({
  enrollments,
  canAddDriverEducation,
  canAddDriverTraining,
  isAddingProgramType,
  onStartAdd,
  onCancelAdd,
  onConfirmAdd,
  isAddPending,
  onStartComplete,
  onStartReopen,
  completingEnrollmentId,
  reopeningEnrollmentId,
  onStartWithdraw,
  withdrawingEnrollmentId,
  onStartRecordCertificate,
  recordingCertificateEnrollmentId,
  certificatesByEnrollmentId,
  onGenerateTranscript,
  generatingTranscriptEnrollmentId,
}) => {
  const [draftHoursRequired, setDraftHoursRequired] = React.useState('');
  const [draftManualHours, setDraftManualHours] = React.useState('');

  React.useEffect(() => {
    if (isAddingProgramType === null) {
      setDraftHoursRequired('');
      setDraftManualHours('');
    }
  }, [isAddingProgramType]);

  return (
    <div className="space-y-3">
      {enrollments.map((enrollment) => {
        const isDriverTraining = enrollment.programType === 'driver_training';
        const certificate = certificatesByEnrollmentId[enrollment.id];
        const awaitingCertificate =
          isDriverTraining && enrollment.completed && !certificate && !!enrollment.wasMinorAtCompletion;
        return (
          <div key={enrollment.id} className="bg-surface2 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-tx-primary">{PROGRAM_LABELS[enrollment.programType]}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                    enrollment.status === 'active'
                      ? 'bg-status-info-bg text-status-info-text'
                      : enrollment.status === 'completed'
                      ? 'bg-status-success-bg text-status-success-text'
                      : enrollment.status === 'withdrawn'
                      ? 'bg-status-danger-bg text-status-danger-text'
                      : 'bg-surface3 text-tx-muted'
                  }`}
                >
                  {enrollment.status}
                </span>
                {certificate && (
                  <span
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0 bg-status-warning-bg text-status-warning-text border border-status-warning-border"
                    title={`Serial ${certificate.serialNumber}, issued ${certificate.issueDate}`}
                  >
                    <Award className="h-3 w-3" />
                    {certificate.status === 'issued' ? 'Certificate issued' : 'Certificate void'}
                  </span>
                )}
                {awaitingCertificate && (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0 bg-surface3 text-tx-muted">
                    <Clock className="h-3 w-3" />
                    Awaiting certificate
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {isDriverTraining && enrollment.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => onStartComplete(enrollment.id)}
                    disabled={completingEnrollmentId === enrollment.id}
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg text-status-success-text hover:bg-status-success-bg disabled:opacity-50"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Mark complete
                  </button>
                )}
                {enrollment.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => onStartWithdraw(enrollment.id)}
                    disabled={withdrawingEnrollmentId === enrollment.id}
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg text-status-danger-text hover:bg-status-danger-bg disabled:opacity-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Withdraw
                  </button>
                )}
                {enrollment.completed && (
                  <button
                    type="button"
                    onClick={() => onStartReopen(enrollment.id)}
                    disabled={reopeningEnrollmentId === enrollment.id}
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg text-status-warning-text hover:bg-status-warning-bg disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reopen
                  </button>
                )}
                {/* No age check - recording is available for ANY completed
                    enrollment, not just the ones the worklist surfaces. */}
                {enrollment.completed && !certificate && (
                  <button
                    type="button"
                    onClick={() => onStartRecordCertificate(enrollment.id)}
                    disabled={recordingCertificateEnrollmentId === enrollment.id}
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg text-status-warning-text hover:bg-status-warning-bg disabled:opacity-50"
                  >
                    <Award className="h-3.5 w-3.5" />
                    Record certificate
                  </button>
                )}
                {/* 13 CCR §340.27 training-received transcript - always
                    available on demand for a non-completed driver_training
                    enrollment, no age check, not restricted to withdrawn. */}
                {isDriverTraining && !enrollment.completed && (
                  <button
                    type="button"
                    onClick={() => onGenerateTranscript(enrollment.id)}
                    disabled={generatingTranscriptEnrollmentId === enrollment.id}
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg text-tx-secondary hover:bg-surface3 disabled:opacity-50"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {generatingTranscriptEnrollmentId === enrollment.id ? 'Generating...' : 'Generate transcript'}
                  </button>
                )}
              </div>
            </div>

            {isDriverTraining ? (
              <p className="text-sm text-tx-secondary">
                {enrollment.progress?.displayLabel ?? 'Progress unavailable'}
              </p>
            ) : enrollment.deDeliveryMode === 'classroom' && enrollment.classroomAttendance ? (
              <p className="text-sm text-tx-secondary">
                {enrollment.completed
                  ? `Completed - ${enrollment.classroomAttendance.attendedCurriculumDays.length}/4 days attended`
                  : `${enrollment.classroomAttendance.attendedCurriculumDays.length}/4 days attended`}
              </p>
            ) : (
              <p className="text-sm text-tx-secondary">
                {enrollment.completed
                  ? `Completed - ${enrollment.manualCompletedHours ?? '?'} hours`
                  : `Manually entered - ${enrollment.manualCompletedHours ?? '0'} hours logged so far`}
              </p>
            )}

            {enrollment.completed && enrollment.completionReason && (
              <p className="text-xs text-tx-muted italic">{enrollment.completionReason}</p>
            )}

            {enrollment.status === 'withdrawn' && enrollment.withdrawnReason && (
              <p className="text-xs text-status-danger-text italic">Withdrawn: {enrollment.withdrawnReason}</p>
            )}
          </div>
        );
      })}

      {enrollments.length === 0 && (
        <p className="text-sm text-tx-muted italic">No enrollments yet.</p>
      )}

      {/* Add-enrollment form - shown only while actively adding one program
          type. Gated independently per type: driver_education appears when
          the student has none yet; driver_training (the returning-student
          case) appears only when there's no ACTIVE one right now. */}
      {isAddingProgramType && (
        <div className="bg-surface border border-edge-strong rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-tx-primary">
            Add {PROGRAM_LABELS[isAddingProgramType]} enrollment
          </p>
          {isAddingProgramType === 'driver_training' ? (
            <div>
              <label htmlFor="new-enrollment-hours-required" className="block text-xs font-medium text-tx-secondary mb-1">Hours required</label>
              <input
                id="new-enrollment-hours-required"
                type="number"
                min="0"
                step="0.5"
                value={draftHoursRequired}
                onChange={(e) => setDraftHoursRequired(e.target.value)}
                className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
                placeholder="6"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="new-enrollment-manual-hours" className="block text-xs font-medium text-tx-secondary mb-1">
                Hours completed (manually entered - no lesson tracking for driver education)
              </label>
              <input
                id="new-enrollment-manual-hours"
                type="number"
                min="0"
                step="0.5"
                value={draftManualHours}
                onChange={(e) => setDraftManualHours(e.target.value)}
                className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
                placeholder="30"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancelAdd}
              className="px-3 py-2 text-sm font-medium bg-surface border border-edge-strong rounded-lg hover:bg-surface2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                onConfirmAdd(
                  isAddingProgramType === 'driver_training'
                    ? { hoursRequired: draftHoursRequired ? Number(draftHoursRequired) : undefined }
                    : { manualCompletedHours: draftManualHours ? Number(draftManualHours) : undefined }
                )
              }
              disabled={isAddPending}
              className="px-3 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:brightness-90 transition-colors disabled:opacity-50"
            >
              {isAddPending ? 'Adding...' : 'Add enrollment'}
            </button>
          </div>
        </div>
      )}

      {!isAddingProgramType && (canAddDriverEducation || canAddDriverTraining) && (
        <div className="flex flex-wrap gap-3 pt-1">
          {canAddDriverTraining && (
            <button
              type="button"
              onClick={() => onStartAdd('driver_training')}
              className="flex items-center gap-1.5 text-sm text-primary hover:text-primary font-medium"
            >
              <Plus className="h-4 w-4" />
              Add driver training enrollment
            </button>
          )}
          {canAddDriverEducation && (
            <button
              type="button"
              onClick={() => onStartAdd('driver_education')}
              className="flex items-center gap-1.5 text-sm text-primary hover:text-primary font-medium"
            >
              <Plus className="h-4 w-4" />
              Add driver education enrollment
            </button>
          )}
        </div>
      )}
    </div>
  );
};
