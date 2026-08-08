import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Mail, Phone, Users, X } from 'lucide-react';
import { guardiansApi } from '@/api';
import type { Guardian } from '@/types';
import { EmptyState, LoadingSpinner } from '@/components/common';

interface GuardiansListProps {
  onSelect: (guardian: Guardian) => void;
}

export const GuardiansList: React.FC<GuardiansListProps> = ({ onSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['guardians', currentPage],
    queryFn: () => guardiansApi.getAll(currentPage, 50),
  });

  const filteredGuardians = (data?.data ?? []).filter((guardian) => {
    const name = `${guardian.firstName ?? ''} ${guardian.lastName ?? ''}`.trim().toLowerCase();
    const term = searchTerm.toLowerCase();
    return (
      name.includes(term) ||
      (guardian.email?.toLowerCase().includes(term) ?? false) ||
      (guardian.phone?.includes(searchTerm) ?? false)
    );
  });

  const getDisplayName = (guardian: Guardian): string => {
    const name = `${guardian.firstName ?? ''} ${guardian.lastName ?? ''}`.trim();
    return name || 'Unnamed guardian';
  };

  const getInitials = (guardian: Guardian): string => {
    const first = guardian.firstName?.[0] ?? '';
    const last = guardian.lastName?.[0] ?? '';
    return (first + last).toUpperCase() || '?';
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="flex items-center rounded-xl border border-edge bg-surface px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
        <Search className="h-5 w-5 text-tx-muted flex-shrink-0" />
        <input
          type="text"
          placeholder="Search guardians by name, email, or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoComplete="nope"
          className="ml-3 flex-1 border-none bg-transparent outline-none text-tx-primary placeholder-gray-400"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="p-1 text-tx-muted hover:text-tx-secondary rounded-full hover:bg-surface2 transition-colors"
            title="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* List */}
      <div className="overflow-x-auto rounded-xl bg-surface shadow-sm border border-edge">
        <table className="min-w-full divide-y divide-white/20">
          <thead className="bg-surface/8">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary">
                Guardian
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-tx-secondary hidden md:table-cell">
                Contact
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/20 bg-transparent">
            {isLoading ? (
              <tr>
                <td colSpan={2} className="py-12">
                  <LoadingSpinner />
                </td>
              </tr>
            ) : filteredGuardians.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-2">
                  <EmptyState
                    icon={<Users className="h-12 w-12" />}
                    title="No guardians found"
                    description={
                      searchTerm
                        ? `No guardians match your search for "${searchTerm}"`
                        : 'Guardians linked to students will appear here'
                    }
                  />
                </td>
              </tr>
            ) : (
              filteredGuardians.map((guardian) => (
                <tr
                  key={guardian.id}
                  className="hover:bg-surface2 cursor-pointer"
                  onClick={() => onSelect(guardian)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                        {getInitials(guardian)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-tx-primary truncate">{getDisplayName(guardian)}</div>
                        <div className="text-sm text-tx-muted md:hidden truncate">
                          {guardian.email || guardian.phone || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    {guardian.email && (
                      <div className="flex items-center gap-2 text-sm text-tx-primary">
                        <Mail className="h-3.5 w-3.5 text-tx-muted flex-shrink-0" />
                        {guardian.email}
                      </div>
                    )}
                    {guardian.phone && (
                      <div className="flex items-center gap-2 text-sm text-tx-muted">
                        <Phone className="h-3.5 w-3.5 text-tx-muted flex-shrink-0" />
                        {guardian.phone}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-3 shadow-sm border border-edge">
          <div className="text-sm text-tx-secondary">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </div>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-tx-secondary hover:bg-surface2 disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === data.pagination.totalPages}
              className="rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-tx-secondary hover:bg-surface2 disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
