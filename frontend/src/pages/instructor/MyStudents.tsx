import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { studentsApi } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs } from '@/components/common/Tabs';
import { StudentProgressBar } from '@/components/students/StudentProgressBar';
import { formatPhoneNumber } from '@/utils/phoneFormat';

type StudentsTab = 'active' | 'history';

// This instructor's own assigned students only - never the whole school's
// list. Active (default) vs History (every enrollment status this
// instructor has ever been assigned, not just active) via the same Tabs
// component the admin Students page uses for its own BTW/DE/All views.
// Deliberately excludes payment/balance information - the backend already
// strips it server-side for an instructor-role caller, so there is no
// paymentSummary/hasOutstandingFee/outstandingFeeAmount field on these
// Student objects to accidentally render.
export const InstructorMyStudentsPage: React.FC = () => {
  const { user } = useAuth();
  const instructorId = user?.instructorId ?? '';
  const [tab, setTab] = useState<StudentsTab>('active');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['instructor-students', instructorId, tab],
    queryFn: () => studentsApi.getByInstructor(instructorId, { includeHistory: tab === 'history' }),
    enabled: Boolean(instructorId),
  });

  const students = data?.data ?? [];

  return (
    <div>
      <h1 className="text-xl font-semibold text-tx-primary mb-1">My Students</h1>
      <p className="text-sm text-tx-muted mb-4">Students assigned to you</p>

      <div className="mb-4">
        <Tabs<StudentsTab>
          items={[
            { value: 'active', label: 'Active' },
            { value: 'history', label: 'History' },
          ]}
          activeValue={tab}
          onChange={setTab}
          aria-label="My Students view"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" />
        </div>
      ) : students.length === 0 ? (
        <div className="text-center py-12 text-tx-muted">
          {tab === 'active' ? 'No active students assigned to you yet.' : 'No student history yet.'}
        </div>
      ) : (
        <div className="space-y-2">
          {students.map((student) => {
            const isExpanded = expandedId === student.id;
            return (
              <div key={student.id} className="bg-surface border border-edge rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : student.id)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-surface2 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-tx-primary truncate">{student.fullName}</p>
                    <div className="mt-1">
                      <StudentProgressBar progress={student.progress} />
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-tx-muted flex-shrink-0 ml-3" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-tx-muted flex-shrink-0 ml-3" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-edge pt-3 space-y-2 text-sm">
                    {student.phone && (
                      <div className="flex items-center gap-2 text-tx-secondary">
                        <Phone className="h-4 w-4 text-tx-muted" />
                        {formatPhoneNumber(student.phone)}
                      </div>
                    )}
                    {student.email && (
                      <div className="flex items-center gap-2 text-tx-secondary">
                        <Mail className="h-4 w-4 text-tx-muted" />
                        {student.email}
                      </div>
                    )}
                    {student.primaryGuardian && (
                      <div className="flex items-center gap-2 text-tx-secondary">
                        <Phone className="h-4 w-4 text-tx-muted" />
                        Guardian: {student.primaryGuardian.firstName} {student.primaryGuardian.lastName}
                        {student.primaryGuardian.phone && ` - ${formatPhoneNumber(student.primaryGuardian.phone)}`}
                      </div>
                    )}
                    {student.notes && (
                      <p className="text-tx-secondary pt-1">{student.notes}</p>
                    )}
                    {student.activeEnrollment && (
                      <p className="text-xs text-tx-muted pt-1 capitalize">
                        {student.activeEnrollment.programType.replace('_', ' ')} - {student.activeEnrollment.status}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
