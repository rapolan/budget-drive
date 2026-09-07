import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive as ArchiveIcon, PauseCircle, RotateCcw, ExternalLink } from 'lucide-react';
import { studentsApi } from '@/api';
import type { ArchiveReadyEntry, HeldStudentEntry, ArchivedStudentEntry } from '@/api/students';
import { Button, EmptyState, LoadingSpinner, Tabs } from '@/components/common';
import type { TabItem } from '@/components/common';
import { formatShortDate } from '@/utils/timeFormat';
import { useSessionState } from '@/hooks/useSessionState';

type ArchiveTab = 'worklist' | 'held' | 'sealed';
const isArchiveTab = (v: string): v is ArchiveTab => v === 'worklist' || v === 'held' || v === 'sealed';

const TAB_ITEMS: TabItem<ArchiveTab>[] = [
  { value: 'worklist', label: 'Ready to Archive' },
  { value: 'held', label: 'Held' },
  { value: 'sealed', label: 'Sealed Archive' },
];

const REASON_LABEL: Record<ArchiveReadyEntry['reason'], string> = {
  permit_expired: 'Permit expired',
  inactivity: 'No activity',
  de_year_end: 'DE completed',
};

const PROGRAM_LABEL: Record<string, string> = {
  driver_training: 'BTW',
  driver_education: 'DE',
};

/**
 * Phase 4 of the compliance-records arc: completed students recede from
 * the daily working views (the Students list) while staying fully
 * retained, searchable, and retrievable - filing away, never deletion.
 * Eligibility is live-computed on every load, never a background sweep -
 * sealing itself is always an explicit action from a worklist row here,
 * the same record-then-confirm shape the Certificates worklist uses.
 */
export const ArchivePage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useSessionState<ArchiveTab>('archive-active-tab', 'worklist', isArchiveTab);
  const [holdingStudentId, setHoldingStudentId] = React.useState<string | null>(null);
  const [restoringStudentId, setRestoringStudentId] = React.useState<string | null>(null);
  // Explicit per-year open/closed overrides from a toggle click. A year
  // with no entry here falls back to its default (newest year open,
  // every older year collapsed) - see isYearExpanded below.
  const [yearOverrides, setYearOverrides] = React.useState<Map<number, boolean>>(new Map());

  const { data: worklistData, isLoading: worklistLoading } = useQuery({
    queryKey: ['archive', 'worklist'],
    queryFn: () => studentsApi.getArchiveWorklist(),
    enabled: activeTab === 'worklist',
  });
  const { data: heldData, isLoading: heldLoading } = useQuery({
    queryKey: ['archive', 'held'],
    queryFn: () => studentsApi.getHeldStudents(),
    enabled: activeTab === 'held',
  });
  const { data: sealedData, isLoading: sealedLoading } = useQuery({
    queryKey: ['archive', 'sealed'],
    queryFn: () => studentsApi.getArchived(),
    enabled: activeTab === 'sealed',
  });

  const worklist: ArchiveReadyEntry[] = React.useMemo(() => worklistData?.data || [], [worklistData]);
  const held: HeldStudentEntry[] = React.useMemo(() => heldData?.data || [], [heldData]);
  const sealed: ArchivedStudentEntry[] = React.useMemo(() => sealedData?.data || [], [sealedData]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['archive'] });
    queryClient.invalidateQueries({ queryKey: ['students'] });
  };

  const archiveMutation = useMutation({
    mutationFn: (studentId: string) => studentsApi.archive(studentId),
    onSuccess: () => invalidate(),
  });

  const holdMutation = useMutation({
    mutationFn: ({ studentId, reason }: { studentId: string; reason: string }) =>
      studentsApi.archiveHold(studentId, reason),
    onSuccess: () => {
      invalidate();
      setHoldingStudentId(null);
    },
  });

  const clearHoldMutation = useMutation({
    mutationFn: (studentId: string) => studentsApi.clearArchiveHold(studentId),
    onSuccess: () => invalidate(),
  });

  const restoreMutation = useMutation({
    mutationFn: (studentId: string) => studentsApi.restore(studentId),
    onSuccess: () => {
      invalidate();
      setRestoringStudentId(null);
    },
  });

  const archiveAllMutation = useMutation({
    mutationFn: async (entries: ArchiveReadyEntry[]) => {
      for (const entry of entries) {
        await studentsApi.archive(entry.studentId);
      }
    },
    onSuccess: () => invalidate(),
  });

  // Grouped year -> month, newest first - grouping happens here (the
  // backend returns a flat, sorted list, matching Certificates.tsx's log
  // convention of shipping flat data and letting the page bucket it).
  const groupedByYear = React.useMemo(() => {
    const years = new Map<number, Map<number, ArchivedStudentEntry[]>>();
    for (const entry of sealed) {
      const date = new Date(entry.archivedAt);
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth();
      if (!years.has(year)) years.set(year, new Map());
      const monthsMap = years.get(year)!;
      if (!monthsMap.has(month)) monthsMap.set(month, []);
      monthsMap.get(month)!.push(entry);
    }
    return Array.from(years.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, monthsMap]) => ({
        year,
        months: Array.from(monthsMap.entries()).sort((a, b) => b[0] - a[0]),
      }));
  }, [sealed]);

  const toggleYear = (year: number, currentlyExpanded: boolean) => {
    setYearOverrides((prev) => {
      const next = new Map(prev);
      next.set(year, !currentlyExpanded);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-tx-primary">Archive</h1>
          <p className="mt-1 text-sm text-tx-muted">
            Completed records recede from the working views here, fully retained and searchable - filing away, never deletion.
          </p>
        </div>
      </div>

      <Tabs items={TAB_ITEMS} activeValue={activeTab} onChange={setActiveTab} aria-label="Archive view" />

      {activeTab === 'worklist' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-tx-primary">Ready to archive</h2>
            {worklist.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => archiveAllMutation.mutate(worklist)}
                disabled={archiveAllMutation.isPending}
              >
                <ArchiveIcon className="h-3.5 w-3.5" />
                {archiveAllMutation.isPending ? 'Archiving...' : `Archive all ${worklist.length} eligible`}
              </Button>
            )}
          </div>

          {worklistLoading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {!worklistLoading && worklist.length === 0 && (
            <EmptyState
              icon={<ArchiveIcon className="h-10 w-10" />}
              title="Nothing ready to archive"
              description="Completed students whose permit has expired, who've gone quiet past the inactivity grace period, or whose DE completion year has rolled over will show up here."
            />
          )}

          {!worklistLoading && worklist.length > 0 && (
            <div className="rounded-xl border border-edge bg-surface divide-y divide-edge overflow-hidden">
              {worklist.map((entry) => (
                <ArchiveWorklistRow
                  key={entry.studentId}
                  entry={entry}
                  isHolding={holdingStudentId === entry.studentId}
                  onStartHold={() => setHoldingStudentId(entry.studentId)}
                  onCancelHold={() => setHoldingStudentId(null)}
                  onConfirmHold={(reason) => holdMutation.mutate({ studentId: entry.studentId, reason })}
                  onArchive={() => archiveMutation.mutate(entry.studentId)}
                  isPending={archiveMutation.isPending || holdMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'held' && (
        <div>
          <h2 className="text-sm font-semibold text-tx-primary mb-3">Held students</h2>

          {heldLoading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {!heldLoading && held.length === 0 && (
            <EmptyState
              icon={<PauseCircle className="h-10 w-10" />}
              title="Nothing held"
              description="A hold stays until explicitly cleared - review this list periodically so a hold never quietly accumulates forgotten."
            />
          )}

          {!heldLoading && held.length > 0 && (
            <div className="rounded-xl border border-edge bg-surface divide-y divide-edge overflow-hidden">
              {held.map((entry) => (
                <div key={entry.studentId} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-tx-primary truncate">{entry.studentName}</p>
                    <p className="text-xs text-tx-muted truncate">
                      {entry.archiveHoldReason ?? 'No reason given'}
                      {entry.archiveHeldByName ? ` - held by ${entry.archiveHeldByName}` : ''}
                      {entry.archiveHeldAt ? ` on ${formatShortDate(entry.archiveHeldAt.slice(0, 10))}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => clearHoldMutation.mutate(entry.studentId)}
                    disabled={clearHoldMutation.isPending}
                  >
                    Clear hold
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'sealed' && (
        <div>
          <h2 className="text-sm font-semibold text-tx-primary mb-3">Sealed archive</h2>

          {sealedLoading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {!sealedLoading && sealed.length === 0 && (
            <EmptyState
              icon={<ArchiveIcon className="h-10 w-10" />}
              title="Nothing archived yet"
              description="Sealed records will appear here, grouped by the year they were archived."
            />
          )}

          {!sealedLoading && groupedByYear.length > 0 && (
            <div className="space-y-3">
              {groupedByYear.map(({ year, months }, yearIndex) => {
                // Newest year (index 0) defaults open; every older year
                // defaults collapsed. An explicit toggle click overrides
                // that default for just that year.
                const defaultExpanded = yearIndex === 0;
                const isExpanded = yearOverrides.get(year) ?? defaultExpanded;

                return (
                  <div key={year} className="rounded-xl border border-edge bg-surface overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleYear(year, isExpanded)}
                      className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-surface2 transition-colors"
                    >
                      <span className="text-sm font-semibold text-tx-primary">{year}</span>
                      <span className="text-xs text-tx-muted">
                        {months.reduce((sum, [, entries]) => sum + entries.length, 0)} archived
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="divide-y divide-edge border-t border-edge">
                        {months.map(([month, entries]) => (
                          <div key={month} className="px-5 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-tx-secondary mb-2">
                              {new Date(Date.UTC(year, month, 1)).toLocaleString('en-US', { month: 'long' })}
                            </p>
                            <div className="space-y-2">
                              {entries.map((entry) => (
                                <ArchivedStudentRow
                                  key={entry.studentId}
                                  entry={entry}
                                  isRestoring={restoringStudentId === entry.studentId}
                                  onStartRestore={() => setRestoringStudentId(entry.studentId)}
                                  onCancelRestore={() => setRestoringStudentId(null)}
                                  onConfirmRestore={() => restoreMutation.mutate(entry.studentId)}
                                  isPending={restoreMutation.isPending}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface ArchiveWorklistRowProps {
  entry: ArchiveReadyEntry;
  isHolding: boolean;
  onStartHold: () => void;
  onCancelHold: () => void;
  onConfirmHold: (reason: string) => void;
  onArchive: () => void;
  isPending: boolean;
}

const ArchiveWorklistRow: React.FC<ArchiveWorklistRowProps> = ({
  entry,
  isHolding,
  onStartHold,
  onCancelHold,
  onConfirmHold,
  onArchive,
  isPending,
}) => {
  const [reason, setReason] = React.useState('');

  return (
    <div className="px-5 py-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-tx-primary truncate">{entry.studentName}</p>
          <p className="text-xs text-tx-muted truncate">
            {REASON_LABEL[entry.reason]} - {formatShortDate(entry.reasonDate)}
            {' - '}
            {entry.programTypes.map((p) => PROGRAM_LABEL[p]).join(', ')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={isHolding ? onCancelHold : onStartHold}>
            <PauseCircle className="h-3.5 w-3.5" />
            {isHolding ? 'Cancel' : 'Hold active'}
          </Button>
          <Button size="sm" onClick={onArchive} disabled={isPending}>
            <ArchiveIcon className="h-3.5 w-3.5" />
            Archive
          </Button>
        </div>
      </div>

      {isHolding && (
        <div className="mt-3 pt-3 border-t border-edge bg-status-warning-bg border border-status-warning-border rounded-lg p-4 space-y-2">
          <label className="block text-xs font-medium text-status-warning-text" htmlFor={`hold-reason-${entry.studentId}`}>
            Reason for holding (required)
          </label>
          <input
            id={`hold-reason-${entry.studentId}`}
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Family said they're returning in the fall"
            className="w-full px-3 py-2 border border-status-warning-border rounded-lg text-sm bg-surface"
          />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onCancelHold}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => onConfirmHold(reason)} disabled={!reason.trim()}>
              Confirm hold
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

interface ArchivedStudentRowProps {
  entry: ArchivedStudentEntry;
  isRestoring: boolean;
  onStartRestore: () => void;
  onCancelRestore: () => void;
  onConfirmRestore: () => void;
  isPending: boolean;
}

const ArchivedStudentRow: React.FC<ArchivedStudentRowProps> = ({
  entry,
  isRestoring,
  onStartRestore,
  onCancelRestore,
  onConfirmRestore,
  isPending,
}) => {
  return (
    <div className="rounded-lg border border-edge bg-surface2 p-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-tx-primary truncate">{entry.studentName}</p>
          <p className="text-xs text-tx-muted truncate">
            {entry.programTypes.map((p) => PROGRAM_LABEL[p] ?? p).join(', ')} - sealed {formatShortDate(entry.archivedAt.slice(0, 10))}
          </p>
          <p className="text-xs text-tx-muted mt-1">
            {entry.archiveLedgerTxid ? (
              <span className="inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Anchored on-chain
              </span>
            ) : (
              'Hash recorded - not yet anchored'
            )}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={isRestoring ? onCancelRestore : onStartRestore}>
          <RotateCcw className="h-3.5 w-3.5" />
          {isRestoring ? 'Cancel' : 'Restore to active'}
        </Button>
      </div>

      {isRestoring && (
        <div className="mt-3 pt-3 border-t border-edge bg-status-warning-bg border border-status-warning-border rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-status-warning-text">
            Restoring returns this student to the working Students list. The seal's hash record stays in place as
            history - it will not be cleared.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onCancelRestore}>
              Cancel
            </Button>
            <Button size="sm" onClick={onConfirmRestore} disabled={isPending}>
              {isPending ? 'Restoring...' : 'Confirm restore'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
