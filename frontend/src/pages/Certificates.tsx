import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Award, CheckCircle2, Ban, X } from 'lucide-react';
import { certificatesApi } from '@/api';
import type { AwaitingCertificateEntry } from '@/api/certificates';
import { Button, EmptyState, LoadingSpinner } from '@/components/common';
import { formatShortDate } from '@/utils/timeFormat';

/**
 * The reconciliation view for certificate issuance tracking (13 CCR
 * §340.27). Instructors hand a physical certificate to a student at their
 * final lesson and write the serial on the student's paper record sheet;
 * sheets come back to the admin, who works this worklist to enter each
 * serial against the enrollment it belongs to. This is NOT a live-issuance
 * system - nothing here creates a certificate at completion time.
 */
export const CertificatesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isVoiding, setIsVoiding] = React.useState(false);
  const [expandedEnrollmentId, setExpandedEnrollmentId] = React.useState<string | null>(null);
  // Instructor filter for the worklist - NOT a date filter (item 1). Sheets
  // arrive on no fixed schedule, so the admin needs to narrow by whose
  // stack of paper they're holding, not by when students finished.
  const [worklistInstructorId, setWorklistInstructorId] = React.useState<string>('all');

  const { data: worklistData, isLoading: worklistLoading } = useQuery({
    queryKey: ['certificates', 'worklist'],
    queryFn: () => certificatesApi.getWorklist(),
  });
  const { data: countsData } = useQuery({
    queryKey: ['certificates', 'counts'],
    queryFn: () => certificatesApi.getCounts(),
  });

  const worklist: AwaitingCertificateEntry[] = React.useMemo(() => worklistData?.data || [], [worklistData]);
  const counts = countsData?.data || { issued: 0, void: 0 };

  // Only instructors who actually have an awaiting student - never list one
  // with nothing pending, per item 1's explicit requirement.
  const worklistInstructors = React.useMemo(() => {
    const byId = new Map<string, string>();
    for (const entry of worklist) {
      if (entry.suggestedInstructorId && entry.suggestedInstructorName) {
        byId.set(entry.suggestedInstructorId, entry.suggestedInstructorName);
      }
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [worklist]);

  const filteredWorklist = React.useMemo(() => {
    if (worklistInstructorId === 'all') return worklist;
    return worklist.filter((entry) => entry.suggestedInstructorId === worklistInstructorId);
  }, [worklist, worklistInstructorId]);

  const activeWorklistInstructorName = worklistInstructors.find((i) => i.id === worklistInstructorId)?.name ?? null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['certificates', 'worklist'] });
    queryClient.invalidateQueries({ queryKey: ['certificates', 'counts'] });
  };

  const recordMutation = useMutation({
    mutationFn: ({ enrollmentId, serialNumber, issueDate, issuedByInstructorId }: {
      enrollmentId: string;
      serialNumber: string;
      issueDate: string;
      issuedByInstructorId?: string | null;
    }) => certificatesApi.record(enrollmentId, { serialNumber, issueDate, issuedByInstructorId }),
    onSuccess: () => {
      invalidate();
      setExpandedEnrollmentId(null);
    },
  });

  const voidMutation = useMutation({
    mutationFn: ({ serialNumber, voidReason, issueDate }: { serialNumber: string; voidReason: string; issueDate: string }) =>
      certificatesApi.recordVoid({ serialNumber, voidReason, issueDate }),
    onSuccess: () => {
      invalidate();
      setIsVoiding(false);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-tx-primary">Certificates</h1>
          <p className="mt-1 text-sm text-tx-muted">
            Record certificate serials from returned paper sheets, and log any voided, lost, or stolen certificate.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setIsVoiding(true)}>
          <Ban className="h-4 w-4" />
          Record void
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-md">
        <div className="rounded-xl border border-edge bg-surface p-4">
          <div className="flex items-center gap-2 text-status-success-text">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs font-medium">Issued</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-tx-primary">{counts.issued}</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4">
          <div className="flex items-center gap-2 text-status-warning-text">
            <Ban className="h-4 w-4" />
            <span className="text-xs font-medium">Void</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-tx-primary">{counts.void}</p>
        </div>
      </div>

      {isVoiding && (
        <VoidForm
          onCancel={() => setIsVoiding(false)}
          onSubmit={(data) => voidMutation.mutate(data)}
          isPending={voidMutation.isPending}
          error={voidMutation.isError ? 'Could not record void - check the serial number and reason.' : null}
        />
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-tx-primary">Awaiting certificate</h2>

          {worklistInstructors.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="worklist-instructor-filter" className="text-xs font-medium text-tx-secondary">
                Instructor
              </label>
              <select
                id="worklist-instructor-filter"
                value={worklistInstructorId}
                onChange={(e) => setWorklistInstructorId(e.target.value)}
                className="px-3 py-1.5 border border-edge-strong rounded-lg text-sm bg-surface"
              >
                <option value="all">All</option>
                {worklistInstructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {instructor.name}
                  </option>
                ))}
              </select>
              {activeWorklistInstructorName && (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-status-info-bg text-primary whitespace-nowrap">
                  Showing: {activeWorklistInstructorName}
                </span>
              )}
            </div>
          )}
        </div>

        {worklistLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!worklistLoading && worklist.length === 0 && (
          <EmptyState
            icon={<Award className="h-10 w-10" />}
            title="Nothing awaiting a certificate"
            description="Every completed minor enrollment has a certificate recorded."
          />
        )}

        {!worklistLoading && worklist.length > 0 && filteredWorklist.length === 0 && (
          <EmptyState
            icon={<Award className="h-10 w-10" />}
            title="Nothing awaiting a certificate for this instructor"
            description="Try a different instructor, or switch back to All."
          />
        )}

        {!worklistLoading && filteredWorklist.length > 0 && (
          <div className="rounded-xl border border-edge bg-surface divide-y divide-edge overflow-hidden">
            {filteredWorklist.map((entry) => (
              <WorklistRow
                key={entry.enrollmentId}
                entry={entry}
                isExpanded={expandedEnrollmentId === entry.enrollmentId}
                onToggle={() =>
                  setExpandedEnrollmentId(expandedEnrollmentId === entry.enrollmentId ? null : entry.enrollmentId)
                }
                onRecord={(data) => recordMutation.mutate({ enrollmentId: entry.enrollmentId, ...data })}
                isPending={recordMutation.isPending}
                error={recordMutation.isError ? 'Could not record certificate - check the serial number.' : null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface WorklistRowProps {
  entry: AwaitingCertificateEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onRecord: (data: { serialNumber: string; issueDate: string; issuedByInstructorId?: string | null }) => void;
  isPending: boolean;
  error: string | null;
}

const WorklistRow: React.FC<WorklistRowProps> = ({ entry, isExpanded, onToggle, onRecord, isPending, error }) => {
  const [serialNumber, setSerialNumber] = React.useState('');
  const [issueDate, setIssueDate] = React.useState(entry.completedAt.slice(0, 10));
  const [issuedByInstructorId, setIssuedByInstructorId] = React.useState(entry.suggestedInstructorId ?? '');

  return (
    <div className="px-5 py-3">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-tx-primary truncate">{entry.studentName}</p>
          <p className="text-xs text-tx-muted truncate">
            Completed {formatShortDate(entry.completedAt.slice(0, 10))}
            {entry.suggestedInstructorName ? ` - ${entry.suggestedInstructorName}` : ''}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          <Award className="h-3.5 w-3.5" />
          {isExpanded ? 'Cancel' : 'Record certificate'}
        </Button>
      </button>

      {isExpanded && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onRecord({ serialNumber, issueDate, issuedByInstructorId: issuedByInstructorId || null });
          }}
          className="mt-3 pt-3 border-t border-edge grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <div>
            <label className="block text-xs font-medium text-tx-secondary mb-1" htmlFor={`serial-${entry.enrollmentId}`}>
              Serial number
            </label>
            <input
              id={`serial-${entry.enrollmentId}`}
              type="text"
              required
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="CS7218767"
              className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-tx-secondary mb-1" htmlFor={`issue-date-${entry.enrollmentId}`}>
              Issue date
            </label>
            <input
              id={`issue-date-${entry.enrollmentId}`}
              type="date"
              required
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-tx-secondary mb-1" htmlFor={`instructor-${entry.enrollmentId}`}>
              Issuing instructor ID
            </label>
            <input
              id={`instructor-${entry.enrollmentId}`}
              type="text"
              value={issuedByInstructorId}
              onChange={(e) => setIssuedByInstructorId(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
            />
          </div>
          <div className="sm:col-span-3 flex items-center gap-3">
            <Button type="submit" size="sm" disabled={isPending || !serialNumber || !issueDate}>
              {isPending ? 'Recording...' : 'Record'}
            </Button>
            {error && <p className="text-xs text-status-danger-text">{error}</p>}
          </div>
        </form>
      )}
    </div>
  );
};

interface VoidFormProps {
  onCancel: () => void;
  onSubmit: (data: { serialNumber: string; voidReason: string; issueDate: string }) => void;
  isPending: boolean;
  error: string | null;
}

const VoidForm: React.FC<VoidFormProps> = ({ onCancel, onSubmit, isPending, error }) => {
  const [serialNumber, setSerialNumber] = React.useState('');
  const [voidReason, setVoidReason] = React.useState('');
  const [issueDate, setIssueDate] = React.useState(() => new Date().toISOString().slice(0, 10));

  return (
    <div className="bg-status-warning-bg border border-status-warning-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-medium text-status-warning-text">
          Record a spoiled, lost, or stolen certificate (13 CCR §340.27 / DL 803 accounting)
        </p>
        <button type="button" onClick={onCancel} className="text-status-warning-text hover:opacity-70 flex-shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ serialNumber, voidReason, issueDate });
        }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        <div>
          <label className="block text-xs font-medium text-tx-secondary mb-1" htmlFor="void-serial">
            Serial number
          </label>
          <input
            id="void-serial"
            type="text"
            required
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-tx-secondary mb-1" htmlFor="void-date">
            Date
          </label>
          <input
            id="void-date"
            type="date"
            required
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-tx-secondary mb-1" htmlFor="void-reason">
            Reason
          </label>
          <input
            id="void-reason"
            type="text"
            required
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Damaged, lost, stolen..."
            className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
          />
        </div>
        <div className="sm:col-span-3 flex items-center gap-3">
          <Button type="submit" variant="secondary" size="sm" disabled={isPending || !serialNumber || !voidReason}>
            {isPending ? 'Recording...' : 'Record void'}
          </Button>
          {error && <p className="text-xs text-status-danger-text">{error}</p>}
        </div>
      </form>
    </div>
  );
};
