import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { classroomApi } from '@/api';
import { LoadingSpinner } from '@/components/common';

interface MakeUpStudentPickerProps {
  sessionId: string;
  existingEnrollmentIds: string[];
  onClose: () => void;
  onAdded: () => void;
}

/**
 * Search-and-pick a driver_education student to add to THIS session's
 * attendance as a make-up guest - the cross-cohort entry point (§2 of the
 * plan). Adding a student here writes a single de_attendance row for this
 * session; it never touches de_cohort_enrollments, so the student's home
 * cohort (if any) is unaffected.
 */
export const MakeUpStudentPicker: React.FC<MakeUpStudentPickerProps> = ({
  sessionId,
  existingEnrollmentIds,
  onClose,
  onAdded,
}) => {
  const [search, setSearch] = React.useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['classroom', 'make-up-candidates', search, existingEnrollmentIds],
    queryFn: () => classroomApi.searchMakeUpCandidates(search, existingEnrollmentIds),
  });

  const addMutation = useMutation({
    mutationFn: (enrollmentId: string) => classroomApi.recordAttendance(sessionId, { enrollmentId, present: true }),
    onSuccess: () => {
      onAdded();
      onClose();
    },
  });

  const candidates = data?.data || [];

  return (
    <div className="absolute z-20 mt-2 w-64 rounded-xl border border-edge-strong bg-surface shadow-lg p-3 text-left normal-case font-normal">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-tx-primary">Add make-up student</p>
        <button type="button" onClick={onClose} className="p-1 text-tx-muted hover:text-tx-secondary" aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search students..."
        autoFocus
        className="w-full px-2 py-1.5 border border-edge-strong rounded-lg text-xs bg-surface mb-2"
      />

      {isLoading && (
        <div className="flex justify-center py-2">
          <LoadingSpinner />
        </div>
      )}

      {!isLoading && candidates.length === 0 && (
        <p className="text-xs text-tx-muted italic py-1">
          {search ? 'No matching driver_education students.' : 'Type to search driver education students.'}
        </p>
      )}

      {!isLoading && candidates.length > 0 && (
        <div className="max-h-40 overflow-y-auto space-y-1">
          {candidates.map((candidate) => (
            <button
              key={candidate.enrollmentId}
              type="button"
              onClick={() => addMutation.mutate(candidate.enrollmentId)}
              disabled={addMutation.isPending}
              className="w-full text-left px-2 py-1.5 text-xs bg-surface2 rounded-lg hover:bg-surface3 disabled:opacity-50"
            >
              {candidate.studentName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
