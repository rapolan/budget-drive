import React from 'react';
import { Mail, Phone, Users, User } from 'lucide-react';
import type { PersonSearchResult } from '@/types';
import { EmptyState, LoadingSpinner } from '@/components/common';

interface UnifiedSearchResultsProps {
  results: PersonSearchResult[];
  isLoading: boolean;
  onSelectStudent: (id: string) => void;
  onSelectGuardian: (id: string) => void;
}

/**
 * Renders exactly what GET /search/people returns (Constraint B - no
 * client-side re-ranking or merging beyond the backend's own ORDER BY
 * name). A search can surface a guardian while browsing students, or a
 * student while browsing guardians - clicking a row opens the matching
 * detail view regardless of which tab is currently active.
 */
export const UnifiedSearchResults: React.FC<UnifiedSearchResultsProps> = ({
  results,
  isLoading,
  onSelectStudent,
  onSelectGuardian,
}) => {
  if (isLoading) {
    return (
      <div className="rounded-xl bg-surface shadow-sm border border-edge py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="rounded-xl bg-surface shadow-sm border border-edge">
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="No matches found"
          description="No students or guardians match your search."
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface shadow-sm border border-edge divide-y divide-white/20">
      {results.map((result) => (
        <button
          type="button"
          key={`${result.type}-${result.id}`}
          onClick={() => (result.type === 'student' ? onSelectStudent(result.id) : onSelectGuardian(result.id))}
          className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-surface2 transition-colors text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0 ${
                result.type === 'student' ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 'bg-primary'
              }`}
            >
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-tx-primary truncate">{result.name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                    result.type === 'student'
                      ? 'bg-status-info-bg text-primary'
                      : 'bg-surface3 text-tx-secondary'
                  }`}
                >
                  {result.type === 'student' ? 'Student' : 'Guardian'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-tx-muted mt-0.5">
                {result.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {result.email}
                  </span>
                )}
                {result.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {result.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};
