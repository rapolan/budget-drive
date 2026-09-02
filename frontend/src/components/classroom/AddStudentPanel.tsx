import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, UserPlus } from 'lucide-react';
import { classroomApi } from '@/api';
import type { DeCohort, RosterAddCandidate } from '@/api/classroom';
import { ModalShell, LoadingSpinner } from '@/components/common';
import { StudentModal } from '@/components/students/StudentModal';
import { useDebounce } from '@/hooks/useDebounce';

interface AddStudentPanelProps {
  cohort: DeCohort;
  onClose: () => void;
  onAdded: () => void;
}

type Tab = 'existing' | 'new';

/**
 * The Classroom roster's "Add student" entry point - lets an admin enroll a
 * student into this cohort without leaving the page. Two tabs:
 * "Existing student" searches the tenant's students and joins them via the
 * same race-safe classroomService.joinCohort every other entry point uses;
 * "New student" opens the existing create-student modal (never a second
 * form) pre-set to enroll the new student into this cohort on creation.
 */
export const AddStudentPanel: React.FC<AddStudentPanelProps> = ({ cohort, onClose, onAdded }) => {
  const [tab, setTab] = React.useState<Tab>('existing');
  const remainingSpots = cohort.capacity - cohort.enrolledCount;
  const isFull = remainingSpots <= 0;

  return (
    <ModalShell maxWidth="max-w-lg">
      <div className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-tx-primary">Add student to {cohort.name}</h2>
          <button type="button" onClick={onClose} className="p-1 text-tx-muted hover:text-tx-secondary" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className={`text-xs mb-4 ${isFull ? 'text-status-danger-text' : 'text-tx-muted'}`}>
          {isFull
            ? `This class is at capacity (${cohort.enrolledCount}/${cohort.capacity}).`
            : `${remainingSpots} spot${remainingSpots === 1 ? '' : 's'} remaining (${cohort.enrolledCount}/${cohort.capacity}).`}
        </p>

        <div className="flex gap-1 border-b border-edge mb-4">
          {(['existing', 'new'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-tx-muted hover:text-tx-secondary'
              }`}
            >
              {t === 'existing' ? 'Existing student' : 'New student'}
            </button>
          ))}
        </div>

        {tab === 'existing' && (
          <ExistingStudentTab cohort={cohort} isFull={isFull} onAdded={onAdded} onClose={onClose} />
        )}
        {tab === 'new' && (
          <NewStudentTab cohort={cohort} isFull={isFull} onAdded={onAdded} onClose={onClose} />
        )}
      </div>
    </ModalShell>
  );
};

interface TabProps {
  cohort: DeCohort;
  isFull: boolean;
  onAdded: () => void;
  onClose: () => void;
}

const ExistingStudentTab: React.FC<TabProps> = ({ cohort, isFull, onAdded, onClose }) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['classroom', 'roster-candidates', cohort.id, debouncedSearch],
    queryFn: () => classroomApi.searchRosterAddCandidates(cohort.id, debouncedSearch),
  });
  const candidates = data?.data || [];

  const addMutation = useMutation({
    mutationFn: (enrollmentId: string) => classroomApi.joinCohort(cohort.id, enrollmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classroom', 'roster-candidates', cohort.id] });
      onAdded();
    },
  });

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search students by name or email..."
        autoFocus
        className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm bg-surface mb-3"
      />

      {addMutation.isError && (
        <p className="text-xs text-status-danger-text mb-3">
          {(addMutation.error as Error & { response?: { data?: { error?: string } } })?.response?.data?.error
            || 'Could not add this student.'}
        </p>
      )}

      {isLoading && (
        <div className="flex justify-center py-6">
          <LoadingSpinner />
        </div>
      )}

      {!isLoading && candidates.length === 0 && (
        <p className="text-sm text-tx-muted italic py-2">
          {search ? 'No matching students.' : 'Type to search the tenant’s students.'}
        </p>
      )}

      {!isLoading && candidates.length > 0 && (
        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {candidates.map((candidate) => (
            <CandidateRow
              key={candidate.studentId}
              candidate={candidate}
              disabled={isFull}
              isPending={addMutation.isPending}
              onAdd={() => candidate.enrollmentId && addMutation.mutate(candidate.enrollmentId)}
            />
          ))}
        </ul>
      )}

      <div className="flex justify-end pt-4 mt-2 border-t border-edge">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-tx-secondary border border-edge rounded-lg hover:bg-surface2 transition-all"
        >
          Close
        </button>
      </div>
    </div>
  );
};

const CandidateRow: React.FC<{
  candidate: RosterAddCandidate;
  disabled: boolean;
  isPending: boolean;
  onAdd: () => void;
}> = ({ candidate, disabled, isPending, onAdd }) => {
  const ageLabel = candidate.age === null ? 'age unknown' : `${candidate.age}, ${candidate.isMinor ? 'minor' : 'adult'}`;

  let statusNode: React.ReactNode;
  let addable = false;
  switch (candidate.status) {
    case 'this_cohort':
      statusNode = <span className="text-xs text-tx-muted">Enrolled</span>;
      break;
    case 'other_cohort':
      statusNode = (
        <span className="text-xs text-status-danger-text">
          Already enrolled in {candidate.otherCohortName}
        </span>
      );
      break;
    case 'joinable':
      addable = true;
      statusNode = <span className="text-xs text-status-success-text">No home cohort yet</span>;
      break;
    case 'none':
    default:
      statusNode = <span className="text-xs text-tx-muted">No driver education enrollment yet</span>;
      break;
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm text-tx-primary truncate">{candidate.studentName}</p>
        <p className="text-xs text-tx-muted">{ageLabel}</p>
        <div className="mt-0.5">{statusNode}</div>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={!addable || disabled || isPending}
        className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:brightness-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Add to class
      </button>
    </li>
  );
};

const NewStudentTab: React.FC<TabProps> = ({ cohort, isFull, onClose, onAdded }) => {
  const [modalOpen, setModalOpen] = React.useState(true);

  if (isFull) {
    return (
      <div className="py-6">
        <p className="text-sm text-status-danger-text mb-4">
          This class is at capacity - new students can't be enrolled here until a spot opens up.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-tx-secondary border border-edge rounded-lg hover:bg-surface2 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!modalOpen) {
    return (
      <div className="py-6 text-sm text-tx-muted">
        Closed. <button type="button" onClick={() => setModalOpen(true)} className="text-primary hover:underline">Reopen the create-student form</button>.
      </div>
    );
  }

  return (
    <StudentModal
      student={null}
      initialEnrollmentPreset={{ cohortId: cohort.id, cohortName: cohort.name }}
      onClose={() => {
        setModalOpen(false);
        onAdded();
        onClose();
      }}
    />
  );
};
