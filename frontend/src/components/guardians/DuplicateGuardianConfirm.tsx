import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { guardiansApi } from '@/api';
import type { Guardian } from '@/types';

interface DuplicateGuardianConfirmProps {
  matches: Guardian[];
  onLinkExisting: (guardianId: string) => void;
  onCreateSeparate: () => void;
  onCancel: () => void;
}

const MatchRow: React.FC<{
  match: Guardian;
  onLinkExisting: (guardianId: string) => void;
}> = ({ match, onLinkExisting }) => {
  const { data: linkedStudentsData } = useQuery({
    queryKey: ['guardians', match.id, 'students'],
    queryFn: () => guardiansApi.getStudentsForGuardian(match.id),
  });
  const linkedStudents = linkedStudentsData?.data ?? [];
  const name = `${match.firstName ?? ''} ${match.lastName ?? ''}`.trim() || 'This guardian';

  return (
    <div className="bg-status-warning-bg border border-status-warning-border rounded-lg px-4 py-3">
      <p className="text-sm text-status-warning-text">
        <span className="font-medium">{name}</span>
        {match.email && <> — {match.email}</>}
        {!match.email && match.phone && <> — {match.phone}</>}
        {linkedStudents.length > 0 && (
          <>, parent of {linkedStudents.map((s) => s.fullName).join(', ')}</>
        )}
      </p>
      <button
        type="button"
        onClick={() => onLinkExisting(match.id)}
        className="mt-2 px-3 py-1.5 text-sm font-medium bg-status-warning-text text-white rounded-lg hover:brightness-90 transition-colors"
      >
        Link to this guardian
      </button>
    </div>
  );
};

/**
 * Shown at submit time when a NEW guardian's email/phone exactly matches
 * an existing one that wasn't explicitly selected via the type-ahead.
 * Constraint C: nothing here links automatically - both actions require
 * an explicit click, and Cancel returns to the form with nothing changed.
 */
export const DuplicateGuardianConfirm: React.FC<DuplicateGuardianConfirmProps> = ({
  matches,
  onLinkExisting,
  onCreateSeparate,
  onCancel,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-5 w-5 text-status-warning-text mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-tx-primary">
            {matches.length === 1
              ? 'A guardian with this email or phone already exists'
              : 'Guardians with this email or phone already exist'}
          </h3>
          <p className="text-sm text-tx-muted mt-1">
            Link to one of these existing records, or continue creating a separate one.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {matches.map((match) => (
          <MatchRow key={match.id} match={match} onLinkExisting={onLinkExisting} />
        ))}
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-edge">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 text-sm font-medium text-tx-secondary border border-edge rounded-lg hover:bg-surface2 transition-all"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onCreateSeparate}
          className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:brightness-90 transition-colors"
        >
          Create separate record
        </button>
      </div>
    </div>
  );
};
