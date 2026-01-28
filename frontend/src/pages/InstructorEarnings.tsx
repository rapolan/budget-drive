import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, TrendingUp, Calendar, Award } from 'lucide-react';
import { instructorsApi } from '@/api';

export const InstructorEarningsPage: React.FC = () => {
  const [selectedInstructorId, setSelectedInstructorId] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch all instructors for dropdown
  const { data: instructorsData } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
  });

  // Fetch earnings for selected instructor
  const { data: earningsData, isLoading: earningsLoading } = useQuery({
    queryKey: ['instructor-earnings', selectedInstructorId, startDate, endDate],
    queryFn: () => instructorsApi.getEarnings(selectedInstructorId!, startDate, endDate),
    enabled: !!selectedInstructorId,
  });

  const earnings = earningsData?.data;
  const instructors = instructorsData?.data || [];
  const selectedInstructor = instructors.find(i => i.id === selectedInstructorId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Instructor Earnings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track instructor earnings and Budget Drive Protocol fees
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="grid gap-4 md:grid-cols-3">
          {/* Instructor Selection */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Select Instructor
            </label>
            <select
              value={selectedInstructorId}
              onChange={(e) => setSelectedInstructorId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none"
            >
              <option value="">-- Select Instructor --</option>
              {instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              autoComplete="nope"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              autoComplete="nope"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Clear Filters Button */}
        {(startDate || endDate) && (
          <div className="mt-4">
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="px-3 py-1 text-sm text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
            >
              Clear date filters
            </button>
          </div>
        )}
      </div>

      {/* Earnings Stats */}
      {selectedInstructorId && (
        <div>
          {/* Instructor Info Header */}
          {selectedInstructor && (
            <div className="mb-4 rounded-lg bg-blue-50 p-4">
              <div className="flex items-center">
                <Award className="mr-3 h-8 w-8 text-blue-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedInstructor.fullName}
                  </h2>
                  <p className="text-sm text-gray-600">{selectedInstructor.email}</p>
                </div>
              </div>
            </div>
          )}

          {earningsLoading ? (
            <div className="rounded-lg bg-white p-8 text-center shadow">
              <p className="text-gray-500">Loading earnings...</p>
            </div>
          ) : earnings ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {/* Total Lessons */}
              <div className="rounded-lg bg-white p-6 shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Lessons</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {earnings.totalLessons}
                    </p>
                  </div>
                  <Calendar className="h-12 w-12 text-blue-500" />
                </div>
              </div>

              {/* Gross Earnings */}
              <div className="rounded-lg bg-white p-6 shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Gross Earnings</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      ${earnings.grossEarnings.toFixed(2)}
                    </p>
                  </div>
                  <DollarSign className="h-12 w-12 text-green-500" />
                </div>
              </div>

              {/* BDP Fees */}
              <div className="rounded-lg bg-white p-6 shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">BDP Fees</p>
                    <p className="mt-2 text-3xl font-bold text-orange-600">
                      ${earnings.totalFees.toFixed(8)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Satoshi-level fees
                    </p>
                  </div>
                  <TrendingUp className="h-12 w-12 text-orange-500" />
                </div>
              </div>

              {/* Net Earnings */}
              <div className="rounded-lg bg-gradient-to-br from-primary to-blue-700 p-6 shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white/90">Net Earnings</p>
                    <p className="mt-2 text-3xl font-bold text-white">
                      ${earnings.netEarnings.toFixed(2)}
                    </p>
                    <p className="mt-1 text-xs text-white/80">
                      After BDP fees
                    </p>
                  </div>
                  <DollarSign className="h-12 w-12 text-white/90" />
                </div>
              </div>
            </div>
          ) : null}

          {/* Explanation */}
          {earnings && (
            <div className="mt-6 rounded-lg bg-gray-50 p-6">
              <h3 className="mb-3 font-semibold text-gray-900">
                Budget Drive Protocol (BDP) Fee Model
              </h3>
              <div className="space-y-2 text-sm text-gray-700">
                <p>
                  <strong>Gross Earnings:</strong> Total amount from all completed lessons
                </p>
                <p>
                  <strong>BDP Fees:</strong> Satoshi-level blockchain fees (5 sats per booking = ~$0.00000235 USD)
                </p>
                <p>
                  <strong>Net Earnings:</strong> Amount instructor receives after tiny BDP fees
                </p>
                <p className="mt-4 rounded border-l-4 border-blue-500 bg-blue-50 p-3">
                  <strong>Why satoshi-level fees?</strong> Unlike traditional platforms that charge
                  10-30% commission, Budget Drive Protocol uses cost-based fees aligned with Craig Wright's
                  Bitcoin philosophy. Instructors keep 99.999%+ of their earnings.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* No Instructor Selected */}
      {!selectedInstructorId && (
        <div className="rounded-lg bg-white p-12 text-center shadow">
          <Award className="mx-auto h-16 w-16 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            Select an Instructor
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            Choose an instructor from the dropdown above to view their earnings breakdown
          </p>
        </div>
      )}
    </div>
  );
};
