import React from 'react';
import { Plus, CheckCircle, RotateCcw, LogOut, Award, Clock, FileText, Users } from 'lucide-react';
import type { Enrollment, ProgramType, Certificate } from '@/types';
import type { DeCohort } from '@/api/classroom';

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
  onConfirmAdd: (data: {
    hoursRequired?: number;
    manualCompletedHours?: number;
    deDeliveryMode?: 'classroom' | 'online';
    joinCohortId?: string;
  }) => void;
  isAddPending: boolean;
  // Upcoming (non-cancelled) cohorts with remaining capacity, for the
  // classroom-delivery "join a class" picker. Cohort CREATION never
  // happens from here - only from the Classroom page.
  joinableCohorts: DeCohort[];
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

  // "Enroll in BTW" (item 5, directional DE -> BTW only) - a distinct row
  // shown when the student has no active driver_training enrollment,
  // regardless of whether canAddDriverTraining is also true (it always is
  // in that case - this row REPLACES the generic "Add driver training
  // enrollment" link, it doesn't duplicate it). Eligibility (internal OR
  // external DE completion) is soft guidance, never a hard gate - an admin
  // can still act with the escape hatch even when neither is true yet.
  hasCompletedInternalDe: boolean;
  // The most recently added driver_training enrollment's own external-DE
  // fields, if the student has one (e.g. reopened) - a second signal
  // alongside hasCompletedInternalDe. Undefined when no such enrollment
  // exists yet, which is the common case this row exists for.
  mostRecentExternalDeCompleted?: boolean;
  isEnrollingBtw: boolean;
  onStartEnrollInBtw: () => void;
  onCancelEnrollInBtw: () => void;
  onConfirmEnrollInBtw: (data: {
    hoursRequired?: number;
    permit?: { number?: string; issueDate?: string; expiration?: string };
    externalDeCompleted?: { date?: string; provider?: string };
  }) => void;
  isEnrollInBtwPending: boolean;
  // Prefills the permit sub-form with the student's current permit, if any
  // - the fields stay editable afterward on the student record either way.
  currentPermit: { number?: string; issueDate?: string; expiration?: string };
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
  joinableCohorts,
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
  hasCompletedInternalDe,
  mostRecentExternalDeCompleted,
  isEnrollingBtw,
  onStartEnrollInBtw,
  onCancelEnrollInBtw,
  onConfirmEnrollInBtw,
  isEnrollInBtwPending,
  currentPermit,
}) => {
  const [draftHoursRequired, setDraftHoursRequired] = React.useState('');
  const [draftManualHours, setDraftManualHours] = React.useState('');
  const [draftDeliveryMode, setDraftDeliveryMode] = React.useState<'classroom' | 'online' | null>(null);
  const [draftCohortId, setDraftCohortId] = React.useState('');

  React.useEffect(() => {
    if (isAddingProgramType === null) {
      setDraftHoursRequired('');
      setDraftManualHours('');
      setDraftDeliveryMode(null);
      setDraftCohortId('');
    }
  }, [isAddingProgramType]);

  const isDeEligible = hasCompletedInternalDe || !!mostRecentExternalDeCompleted;
  const [btwPermitNumber, setBtwPermitNumber] = React.useState('');
  const [btwPermitIssueDate, setBtwPermitIssueDate] = React.useState('');
  const [btwPermitExpiration, setBtwPermitExpiration] = React.useState('');
  const [btwRecordExternalDe, setBtwRecordExternalDe] = React.useState(false);
  const [btwExternalDeDate, setBtwExternalDeDate] = React.useState('');
  const [btwExternalDeProvider, setBtwExternalDeProvider] = React.useState('');
  const [btwHoursRequired, setBtwHoursRequired] = React.useState('');

  React.useEffect(() => {
    if (isEnrollingBtw) {
      setBtwPermitNumber(currentPermit.number ?? '');
      setBtwPermitIssueDate(currentPermit.issueDate ?? '');
      setBtwPermitExpiration(currentPermit.expiration ?? '');
      setBtwRecordExternalDe(false);
      setBtwExternalDeDate('');
      setBtwExternalDeProvider('');
      setBtwHoursRequired('');
    }
  }, [isEnrollingBtw, currentPermit.number, currentPermit.issueDate, currentPermit.expiration]);

  // The escape hatch itself flips eligibility on for THIS submission -
  // checking "record DE completed elsewhere" travels with the same
  // enrollInBtw call, so the button doesn't need to wait for a page
  // refresh to unlock.
  const isEnrollInBtwEnabled = isDeEligible || btwRecordExternalDe;

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
            <>
              {/* Delivery mode decides both the DMV form (DL 400B/C, via
                  certificateService) and how completion is tracked -
                  classroom uses real attendance, online stays manual-entry. */}
              <div>
                <span id="new-enrollment-delivery-mode-label" className="block text-xs font-medium text-tx-secondary mb-1">Delivery</span>
                <div role="group" aria-labelledby="new-enrollment-delivery-mode-label" className="flex gap-2">
                  {(['classroom', 'online'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={draftDeliveryMode === mode}
                      onClick={() => {
                        setDraftDeliveryMode(mode);
                        setDraftCohortId('');
                      }}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors capitalize ${
                        draftDeliveryMode === mode
                          ? 'bg-primary text-white border-primary'
                          : 'bg-surface text-tx-secondary border-edge-strong hover:border-blue-400'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {draftDeliveryMode === 'classroom' && (
                <div>
                  <label htmlFor="new-enrollment-cohort" className="block text-xs font-medium text-tx-secondary mb-1">
                    Join a class
                  </label>
                  {joinableCohorts.length === 0 ? (
                    <p className="text-xs text-tx-muted italic">
                      No upcoming classes with open spots. Create one from the Classroom page first.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {joinableCohorts.map((c) => {
                        const remaining = c.capacity - c.enrolledCount;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setDraftCohortId(c.id)}
                            className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                              draftCohortId === c.id
                                ? 'border-primary bg-status-info-bg'
                                : 'border-edge-strong bg-surface hover:bg-surface2'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-tx-primary">{c.name}</span>
                              <span
                                className={`flex items-center gap-1 text-xs ${
                                  remaining <= 0 ? 'text-status-danger-text' : 'text-tx-muted'
                                }`}
                              >
                                <Users className="h-3 w-3" />
                                {remaining <= 0 ? 'Full' : `${remaining} open`}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {draftDeliveryMode === 'online' && (
                <div>
                  <label htmlFor="new-enrollment-manual-hours" className="block text-xs font-medium text-tx-secondary mb-1">
                    Hours completed (manually entered - no lesson tracking for online driver education)
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
            </>
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
                    : draftDeliveryMode === 'classroom'
                    ? { deDeliveryMode: 'classroom', joinCohortId: draftCohortId || undefined }
                    : { deDeliveryMode: 'online', manualCompletedHours: draftManualHours ? Number(draftManualHours) : undefined }
                )
              }
              disabled={
                isAddPending ||
                (isAddingProgramType === 'driver_education' &&
                  (draftDeliveryMode === null || (draftDeliveryMode === 'classroom' && !draftCohortId)))
              }
              className="px-3 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:brightness-90 transition-colors disabled:opacity-50"
            >
              {isAddPending ? 'Adding...' : 'Add enrollment'}
            </button>
          </div>
        </div>
      )}

      {/* "Enroll in BTW" (item 5) - REPLACES the generic driver_training
          add-link with a distinct row, same visual weight as the
          enrollment cards above, whenever the student has no active
          driver_training enrollment. Directional only: no reverse
          "Enroll in DE" row ever appears here. */}
      {!isAddingProgramType && !isEnrollingBtw && canAddDriverTraining && (
        <div className="bg-surface2 rounded-lg p-4 flex items-center justify-between gap-3">
          <div>
            <span className="font-medium text-tx-primary">Behind-the-Wheel</span>
            <span className="text-sm text-tx-muted ml-2">Not enrolled</span>
            {!isDeEligible && (
              <p className="text-xs text-tx-muted mt-0.5">Requires DE completion</p>
            )}
          </div>
          <button
            type="button"
            onClick={onStartEnrollInBtw}
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 ${
              isDeEligible
                ? 'bg-primary text-white hover:brightness-90'
                : 'text-tx-secondary hover:bg-surface3'
            }`}
          >
            <Plus className="h-4 w-4" />
            Enroll in BTW
          </button>
        </div>
      )}

      {isEnrollingBtw && (
        <div className="bg-surface border border-edge-strong rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-tx-primary">Enroll in Behind-the-Wheel</p>

          {!isDeEligible && (
            <div className="bg-surface2 rounded-lg p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-tx-primary">
                <input
                  type="checkbox"
                  checked={btwRecordExternalDe}
                  onChange={(e) => setBtwRecordExternalDe(e.target.checked)}
                />
                Record DE completed elsewhere
              </label>
              {btwRecordExternalDe && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="btw-external-de-date" className="block text-xs font-medium text-tx-secondary mb-1">Completion date</label>
                    <input
                      id="btw-external-de-date"
                      type="date"
                      value={btwExternalDeDate}
                      onChange={(e) => setBtwExternalDeDate(e.target.value)}
                      className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
                    />
                  </div>
                  <div>
                    <label htmlFor="btw-external-de-provider" className="block text-xs font-medium text-tx-secondary mb-1">Provider</label>
                    <input
                      id="btw-external-de-provider"
                      type="text"
                      value={btwExternalDeProvider}
                      onChange={(e) => setBtwExternalDeProvider(e.target.value)}
                      className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
                      placeholder="School name"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="btw-hours-required" className="block text-xs font-medium text-tx-secondary mb-1">Hours required</label>
            <input
              id="btw-hours-required"
              type="number"
              min="0"
              step="0.5"
              value={btwHoursRequired}
              onChange={(e) => setBtwHoursRequired(e.target.value)}
              className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
              placeholder="6"
            />
          </div>

          {/* Permit capture - optional-but-prompted, never required; these
              fields stay editable on the student record afterward either way. */}
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label htmlFor="btw-permit-number" className="block text-xs font-medium text-tx-secondary mb-1">Permit number</label>
              <input
                id="btw-permit-number"
                type="text"
                value={btwPermitNumber}
                onChange={(e) => setBtwPermitNumber(e.target.value)}
                className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
              />
            </div>
            <div>
              <label htmlFor="btw-permit-issue-date" className="block text-xs font-medium text-tx-secondary mb-1">Issue date</label>
              <input
                id="btw-permit-issue-date"
                type="date"
                value={btwPermitIssueDate}
                onChange={(e) => setBtwPermitIssueDate(e.target.value)}
                className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
              />
            </div>
            <div>
              <label htmlFor="btw-permit-expiration" className="block text-xs font-medium text-tx-secondary mb-1">Expiration</label>
              <input
                id="btw-permit-expiration"
                type="date"
                value={btwPermitExpiration}
                onChange={(e) => setBtwPermitExpiration(e.target.value)}
                className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancelEnrollInBtw}
              className="px-3 py-2 text-sm font-medium bg-surface border border-edge-strong rounded-lg hover:bg-surface2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                onConfirmEnrollInBtw({
                  hoursRequired: btwHoursRequired ? Number(btwHoursRequired) : undefined,
                  permit: (btwPermitNumber || btwPermitIssueDate || btwPermitExpiration)
                    ? {
                        number: btwPermitNumber || undefined,
                        issueDate: btwPermitIssueDate || undefined,
                        expiration: btwPermitExpiration || undefined,
                      }
                    : undefined,
                  externalDeCompleted: btwRecordExternalDe
                    ? { date: btwExternalDeDate || undefined, provider: btwExternalDeProvider || undefined }
                    : undefined,
                })
              }
              disabled={isEnrollInBtwPending || !isEnrollInBtwEnabled}
              className="px-3 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:brightness-90 transition-colors disabled:opacity-50"
            >
              {isEnrollInBtwPending ? 'Enrolling...' : 'Enroll in BTW'}
            </button>
          </div>
        </div>
      )}

      {!isAddingProgramType && !isEnrollingBtw && canAddDriverEducation && (
        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={() => onStartAdd('driver_education')}
            className="flex items-center gap-1.5 text-sm text-primary hover:text-primary font-medium"
          >
            <Plus className="h-4 w-4" />
            Add driver education enrollment
          </button>
        </div>
      )}
    </div>
  );
};
