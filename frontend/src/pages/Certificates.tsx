import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Award, CheckCircle2, Ban, X, LayoutList, LayoutGrid, Eye } from 'lucide-react';
import { certificatesApi } from '@/api';
import type { AwaitingCertificateEntry, CertificateLogEntry, DeReadyForIssuanceEntry } from '@/api/certificates';
import { Button, EmptyState, LoadingSpinner, Tabs } from '@/components/common';
import type { TabItem } from '@/components/common';
import { CertificateView } from '@/components/certificates/CertificateView';
import { formatShortDate } from '@/utils/timeFormat';
import { useSessionState } from '@/hooks/useSessionState';

type LogViewMode = 'table' | 'cards';
const isLogViewMode = (v: string): v is LogViewMode => v === 'table' || v === 'cards';

type ProgramTab = 'btw' | 'de';
const isProgramTab = (v: string): v is ProgramTab => v === 'btw' || v === 'de';

// The unified log's program-filter buckets - BTW is DL_400D, DE is either
// classroom (DL_400B) or online (DL_400C) delivery. 'all' shows every
// form_type; the log itself never splits into two datasets (item 3).
type LogProgramFilter = 'all' | 'btw' | 'de';
const formTypeMatchesProgram = (formType: string, filter: LogProgramFilter): boolean => {
  if (filter === 'all') return true;
  if (filter === 'btw') return formType === 'DL_400D';
  return formType === 'DL_400B' || formType === 'DL_400C';
};

const PROGRAM_TAB_ITEMS: TabItem<ProgramTab>[] = [
  { value: 'btw', label: 'Behind-the-Wheel' },
  { value: 'de', label: 'Driver Education' },
];

/**
 * Certificate issuance tracking (13 CCR §340.27) for both programs. BTW
 * (DL 400D) is a reconciliation workflow: instructors hand a physical
 * certificate to a student at their final lesson and write the serial on
 * the student's paper record sheet; sheets come back to the admin, who
 * works the BTW worklist to enter each serial against the enrollment it
 * belongs to. DE (DL 400B classroom / DL 400C online) is immediate
 * issuance: a student surfaces the moment their cohort completes (or they
 * complete online), and the admin issues right then - see the Driver
 * Education tab's worklist. Both programs share ONE certificates table,
 * ONE issued/void log (filterable by program, never split), and the same
 * digital certificate view and void-handling flow.
 */
export const CertificatesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isVoiding, setIsVoiding] = React.useState(false);
  const [expandedEnrollmentId, setExpandedEnrollmentId] = React.useState<string | null>(null);
  const [programTab, setProgramTab] = useSessionState<ProgramTab>('certificates-program-tab', 'btw', isProgramTab);
  // Instructor filter for the worklist - NOT a date filter (item 1). Sheets
  // arrive on no fixed schedule, so the admin needs to narrow by whose
  // stack of paper they're holding, not by when students finished.
  const [worklistInstructorId, setWorklistInstructorId] = React.useState<string>('all');

  const { data: worklistData, isLoading: worklistLoading } = useQuery({
    queryKey: ['certificates', 'worklist'],
    queryFn: () => certificatesApi.getWorklist(),
    enabled: programTab === 'btw',
  });
  const { data: deWorklistData, isLoading: deWorklistLoading } = useQuery({
    queryKey: ['certificates', 'de-worklist'],
    queryFn: () => certificatesApi.getDeWorklist(),
    enabled: programTab === 'de',
  });
  const { data: countsData } = useQuery({
    queryKey: ['certificates', 'counts'],
    queryFn: () => certificatesApi.getCounts(),
  });

  const worklist: AwaitingCertificateEntry[] = React.useMemo(() => worklistData?.data || [], [worklistData]);
  const deWorklist: DeReadyForIssuanceEntry[] = React.useMemo(() => deWorklistData?.data || [], [deWorklistData]);
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

  // Same instructor-filter pattern for the DE worklist.
  const [deWorklistInstructorId, setDeWorklistInstructorId] = React.useState<string>('all');

  const deWorklistInstructors = React.useMemo(() => {
    const byId = new Map<string, string>();
    for (const entry of deWorklist) {
      if (entry.suggestedInstructorId && entry.suggestedInstructorName) {
        byId.set(entry.suggestedInstructorId, entry.suggestedInstructorName);
      }
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [deWorklist]);

  const filteredDeWorklist = React.useMemo(() => {
    if (deWorklistInstructorId === 'all') return deWorklist;
    return deWorklist.filter((entry) => entry.suggestedInstructorId === deWorklistInstructorId);
  }, [deWorklist, deWorklistInstructorId]);

  const activeDeWorklistInstructorName =
    deWorklistInstructors.find((i) => i.id === deWorklistInstructorId)?.name ?? null;

  // Issued log - same instructor-filter pattern as the worklist (item 2),
  // plus a table/card view toggle (item 3), plus a program filter (item 3:
  // ONE unified log, filterable by program - never a data split).
  const [logInstructorId, setLogInstructorId] = React.useState<string>('all');
  const [logProgramFilter, setLogProgramFilter] = useSessionState<LogProgramFilter>(
    'certificates-log-program-filter',
    'all',
    (v): v is LogProgramFilter => v === 'all' || v === 'btw' || v === 'de'
  );
  const [logViewMode, setLogViewMode] = useSessionState<LogViewMode>(
    'certificates-log-view-mode',
    'table',
    isLogViewMode
  );

  const { data: logData, isLoading: logLoading } = useQuery({
    queryKey: ['certificates', 'log'],
    queryFn: () => certificatesApi.getLog(),
  });

  const log: CertificateLogEntry[] = React.useMemo(() => logData?.data || [], [logData]);

  // Only instructors who actually appear on an issued record - a void has
  // no instructor by construction, so it never contributes an option here.
  const logInstructors = React.useMemo(() => {
    const byId = new Map<string, string>();
    for (const entry of log) {
      if (entry.instructorId && entry.instructorName) {
        byId.set(entry.instructorId, entry.instructorName);
      }
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [log]);

  // A void record isn't attributable to an instructor (recordVoid never
  // sets issued_by_instructor_id) - it shows under "All" and disappears
  // once a specific instructor is selected, same as it would if an
  // instructor asked "show only what I issued." The program filter applies
  // alongside it - both are view filters over the one unified log.
  const filteredLog = React.useMemo(() => {
    return log.filter((entry) => {
      if (logInstructorId !== 'all' && entry.instructorId !== logInstructorId) return false;
      if (!formTypeMatchesProgram(entry.formType, logProgramFilter)) return false;
      return true;
    });
  }, [log, logInstructorId, logProgramFilter]);

  const activeLogInstructorName = logInstructors.find((i) => i.id === logInstructorId)?.name ?? null;

  // The digital certificate view - only issued records have a document to
  // show (a void was never handed to a student, see getCertificateDetail).
  const [viewingCertificateId, setViewingCertificateId] = React.useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['certificates', 'worklist'] });
    queryClient.invalidateQueries({ queryKey: ['certificates', 'de-worklist'] });
    queryClient.invalidateQueries({ queryKey: ['certificates', 'log'] });
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

  // Classroom DE's combined action - marks the enrollment complete and
  // records the certificate atomically, in one request (item 2).
  const completeAndIssueMutation = useMutation({
    mutationFn: ({ enrollmentId, serialNumber, issueDate, issuedByInstructorId }: {
      enrollmentId: string;
      serialNumber: string;
      issueDate: string;
      issuedByInstructorId?: string | null;
    }) => certificatesApi.completeAndIssueDeCertificate(enrollmentId, { serialNumber, issueDate, issuedByInstructorId }),
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
            {programTab === 'btw'
              ? 'Record certificate serials from returned paper sheets, and log any voided, lost, or stolen certificate.'
              : 'Issue Driver Education certificates as cohorts and online students complete, and log any voided, lost, or stolen certificate.'}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setIsVoiding(true)}>
          <Ban className="h-4 w-4" />
          Record void
        </Button>
      </div>

      <Tabs items={PROGRAM_TAB_ITEMS} activeValue={programTab} onChange={setProgramTab} aria-label="Program" />

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

      {programTab === 'btw' && (
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
      )}

      {programTab === 'de' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-tx-primary">Ready for issuance</h2>

            {deWorklistInstructors.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="de-worklist-instructor-filter" className="text-xs font-medium text-tx-secondary">
                  Instructor
                </label>
                <select
                  id="de-worklist-instructor-filter"
                  value={deWorklistInstructorId}
                  onChange={(e) => setDeWorklistInstructorId(e.target.value)}
                  className="px-3 py-1.5 border border-edge-strong rounded-lg text-sm bg-surface"
                >
                  <option value="all">All</option>
                  {deWorklistInstructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.name}
                    </option>
                  ))}
                </select>
                {activeDeWorklistInstructorName && (
                  <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-status-info-bg text-primary whitespace-nowrap">
                    Showing: {activeDeWorklistInstructorName}
                  </span>
                )}
              </div>
            )}
          </div>

          {deWorklistLoading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {!deWorklistLoading && deWorklist.length === 0 && (
            <EmptyState
              icon={<Award className="h-10 w-10" />}
              title="Nothing ready for issuance"
              description="Completed DE students with no certificate yet, and classroom cohorts that just hit 4/4 attendance, will show up here."
            />
          )}

          {!deWorklistLoading && deWorklist.length > 0 && filteredDeWorklist.length === 0 && (
            <EmptyState
              icon={<Award className="h-10 w-10" />}
              title="Nothing ready for issuance for this instructor"
              description="Try a different instructor, or switch back to All."
            />
          )}

          {!deWorklistLoading && filteredDeWorklist.length > 0 && (
            <div className="rounded-xl border border-edge bg-surface divide-y divide-edge overflow-hidden">
              {filteredDeWorklist.map((entry) => (
                <DeWorklistRow
                  key={entry.enrollmentId}
                  entry={entry}
                  isExpanded={expandedEnrollmentId === entry.enrollmentId}
                  onToggle={() =>
                    setExpandedEnrollmentId(expandedEnrollmentId === entry.enrollmentId ? null : entry.enrollmentId)
                  }
                  onRecord={(data) => recordMutation.mutate({ enrollmentId: entry.enrollmentId, ...data })}
                  onCompleteAndIssue={(data) =>
                    completeAndIssueMutation.mutate({ enrollmentId: entry.enrollmentId, ...data })
                  }
                  isPending={recordMutation.isPending || completeAndIssueMutation.isPending}
                  error={
                    recordMutation.isError || completeAndIssueMutation.isError
                      ? 'Could not record certificate - check the serial number.'
                      : null
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-tx-primary">Certificate log</h2>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="log-program-filter" className="text-xs font-medium text-tx-secondary">
                Program
              </label>
              <select
                id="log-program-filter"
                value={logProgramFilter}
                onChange={(e) => setLogProgramFilter(e.target.value as LogProgramFilter)}
                className="px-3 py-1.5 border border-edge-strong rounded-lg text-sm bg-surface"
              >
                <option value="all">All</option>
                <option value="btw">Behind-the-Wheel</option>
                <option value="de">Driver Education</option>
              </select>
            </div>

            {logInstructors.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="log-instructor-filter" className="text-xs font-medium text-tx-secondary">
                  Instructor
                </label>
                <select
                  id="log-instructor-filter"
                  value={logInstructorId}
                  onChange={(e) => setLogInstructorId(e.target.value)}
                  className="px-3 py-1.5 border border-edge-strong rounded-lg text-sm bg-surface"
                >
                  <option value="all">All</option>
                  {logInstructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.name}
                    </option>
                  ))}
                </select>
                {activeLogInstructorName && (
                  <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-status-info-bg text-primary whitespace-nowrap">
                    Showing: {activeLogInstructorName}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-1 border border-edge-strong rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setLogViewMode('table')}
                aria-label="Table view"
                title="Table view"
                className={`p-1.5 rounded-md transition-colors ${logViewMode === 'table' ? 'bg-primary/10 text-primary' : 'text-tx-muted hover:text-tx-secondary'}`}
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setLogViewMode('cards')}
                aria-label="Card view"
                title="Card view"
                className={`p-1.5 rounded-md transition-colors ${logViewMode === 'cards' ? 'bg-primary/10 text-primary' : 'text-tx-muted hover:text-tx-secondary'}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {logLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!logLoading && log.length === 0 && (
          <EmptyState
            icon={<Award className="h-10 w-10" />}
            title="No certificates recorded yet"
            description="Issued and void certificates will appear here as they're recorded."
          />
        )}

        {!logLoading && log.length > 0 && filteredLog.length === 0 && (
          <EmptyState
            icon={<Award className="h-10 w-10" />}
            title="Nothing recorded for this instructor"
            description="Try a different instructor, or switch back to All. Void records never appear here - they aren't attributable to an instructor."
          />
        )}

        {!logLoading && filteredLog.length > 0 && logViewMode === 'table' && (
          <div className="rounded-xl border border-edge bg-surface overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface/8">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">Student</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">Serial</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">Issue date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">Instructor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {filteredLog.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-sm text-tx-primary">
                      {entry.studentName ?? <span className="text-tx-muted italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-tx-primary font-mono">{entry.serialNumber}</td>
                    <td className="px-4 py-3 text-sm text-tx-secondary">{formatShortDate(entry.issueDate.slice(0, 10))}</td>
                    <td className="px-4 py-3">
                      <CertificateStatusBadge status={entry.status} voidReason={entry.voidReason} />
                    </td>
                    <td className="px-4 py-3 text-sm text-tx-secondary">
                      {entry.instructorName ?? <span className="text-tx-muted italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.status === 'issued' && (
                        <button
                          type="button"
                          onClick={() => setViewingCertificateId(entry.id)}
                          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!logLoading && filteredLog.length > 0 && logViewMode === 'cards' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLog.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-edge bg-surface p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-medium text-tx-primary truncate">
                    {entry.studentName ?? <span className="text-tx-muted italic">Void</span>}
                  </p>
                  <CertificateStatusBadge status={entry.status} voidReason={entry.voidReason} />
                </div>
                <p className="text-xs text-tx-muted font-mono">{entry.serialNumber}</p>
                <p className="text-xs text-tx-muted mt-1">Issued {formatShortDate(entry.issueDate.slice(0, 10))}</p>
                {entry.instructorName && (
                  <p className="text-xs text-tx-muted mt-1">{entry.instructorName}</p>
                )}
                {entry.status === 'issued' && (
                  <button
                    type="button"
                    onClick={() => setViewingCertificateId(entry.id)}
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-3"
                  >
                    <Eye className="h-4 w-4" />
                    View certificate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {viewingCertificateId && (
          <CertificateView
            certificateId={viewingCertificateId}
            onClose={() => setViewingCertificateId(null)}
          />
        )}
      </div>
    </div>
  );
};

interface CertificateStatusBadgeProps {
  status: 'issued' | 'void';
  voidReason: string | null;
}

const CertificateStatusBadge: React.FC<CertificateStatusBadgeProps> = ({ status, voidReason }) => {
  if (status === 'void') {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-status-warning-bg text-status-warning-text whitespace-nowrap"
        title={voidReason ?? undefined}
      >
        Void
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-status-success-bg text-status-success-text whitespace-nowrap">
      Issued
    </span>
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

interface DeWorklistRowProps {
  entry: DeReadyForIssuanceEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onRecord: (data: { serialNumber: string; issueDate: string; issuedByInstructorId?: string | null }) => void;
  onCompleteAndIssue: (data: { serialNumber: string; issueDate: string; issuedByInstructorId?: string | null }) => void;
  isPending: boolean;
  error: string | null;
}

// A DE worklist entry is either 'attendance_complete' (classroom, 4/4
// days, not yet marked complete - the combined "Complete & issue"
// action) or 'completed' (already completed, no cert yet - the plain
// record-certificate form, same as BTW). Same expandable-row shell as
// WorklistRow, different action per readyReason.
const DeWorklistRow: React.FC<DeWorklistRowProps> = ({
  entry,
  isExpanded,
  onToggle,
  onRecord,
  onCompleteAndIssue,
  isPending,
  error,
}) => {
  const [serialNumber, setSerialNumber] = React.useState('');
  const [issueDate, setIssueDate] = React.useState(entry.readyAt.slice(0, 10));
  const [issuedByInstructorId, setIssuedByInstructorId] = React.useState(entry.suggestedInstructorId ?? '');

  const isCombinedAction = entry.readyReason === 'attendance_complete';
  const deliveryLabel = entry.deDeliveryMode === 'classroom' ? 'Classroom' : 'Online';

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
            {deliveryLabel}
            {entry.cohortName ? ` - ${entry.cohortName}` : ''}
            {isCombinedAction
              ? ` - 4/4 days attended ${formatShortDate(entry.readyAt.slice(0, 10))}`
              : ` - Completed ${formatShortDate(entry.readyAt.slice(0, 10))}`}
            {entry.suggestedInstructorName ? ` - ${entry.suggestedInstructorName}` : ''}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          <Award className="h-3.5 w-3.5" />
          {isExpanded ? 'Cancel' : isCombinedAction ? 'Complete & issue certificate' : 'Record certificate'}
        </Button>
      </button>

      {isExpanded && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = { serialNumber, issueDate, issuedByInstructorId: issuedByInstructorId || null };
            if (isCombinedAction) {
              onCompleteAndIssue(data);
            } else {
              onRecord(data);
            }
          }}
          className="mt-3 pt-3 border-t border-edge grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <div>
            <label className="block text-xs font-medium text-tx-secondary mb-1" htmlFor={`de-serial-${entry.enrollmentId}`}>
              Serial number
            </label>
            <input
              id={`de-serial-${entry.enrollmentId}`}
              type="text"
              required
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="CS7218767"
              className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-tx-secondary mb-1" htmlFor={`de-issue-date-${entry.enrollmentId}`}>
              Issue date
            </label>
            <input
              id={`de-issue-date-${entry.enrollmentId}`}
              type="date"
              required
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-tx-secondary mb-1" htmlFor={`de-instructor-${entry.enrollmentId}`}>
              Issuing instructor ID
            </label>
            <input
              id={`de-instructor-${entry.enrollmentId}`}
              type="text"
              value={issuedByInstructorId}
              onChange={(e) => setIssuedByInstructorId(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface"
            />
          </div>
          <div className="sm:col-span-3 flex items-center gap-3">
            <Button type="submit" size="sm" disabled={isPending || !serialNumber || !issueDate}>
              {isPending ? 'Recording...' : isCombinedAction ? 'Complete & issue' : 'Record'}
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
