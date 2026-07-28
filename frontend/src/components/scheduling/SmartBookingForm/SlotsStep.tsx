import React from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { GroupedAvailabilityView, SlotWithProximity } from './GroupedAvailabilityView';

interface SlotsStepProps {
  pickupAddress: string;
  staleSlotNotice: string | null;
  failedInstructorCount: number;
  slotsWithProximity: SlotWithProximity[];
  onSelectSlot: (slot: SlotWithProximity) => void;
  formatSlotDate: (dateStr: string) => string;
  formatTime: (time: string) => string;
  getProximityBadge: (score: number) => { label: string; class: string };
  onChangeFilters: () => void;
}

export const SlotsStep: React.FC<SlotsStepProps> = ({
  pickupAddress,
  staleSlotNotice,
  failedInstructorCount,
  slotsWithProximity,
  onSelectSlot,
  formatSlotDate,
  formatTime,
  getProximityBadge,
  onChangeFilters,
}) => {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-tx-primary">Available Time Slots</h3>
          <p className="text-sm text-tx-muted">
            Sorted by instructor proximity to pickup location
          </p>
        </div>
        <button
          type="button"
          onClick={onChangeFilters}
          className="text-sm text-primary hover:text-blue-800 font-medium"
        >
          ← Change Filters
        </button>
      </div>

      {/* Pickup reminder */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
        <MapPin className="h-4 w-4 text-amber-600 mt-0.5" />
        <div className="text-sm">
          <span className="font-medium text-amber-800">Pickup:</span>{' '}
          <span className="text-amber-700">{pickupAddress}</span>
        </div>
      </div>

      {/* Stale-slot recovery notice: shown after a confirm-time conflict auto-triggers a re-search */}
      {staleSlotNotice && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          {staleSlotNotice}
        </div>
      )}

      {/* Non-blocking notice: some instructors' lookups failed but the search still succeeded for the rest */}
      {failedInstructorCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          Couldn't check availability for {failedInstructorCount}{' '}
          {failedInstructorCount === 1 ? 'instructor' : 'instructors'}. Showing results from everyone else.
        </div>
      )}

      {slotsWithProximity.length === 0 ? (
        <div className="text-center py-12 text-tx-muted bg-surface2 rounded-lg border-2 border-dashed border-[var(--border-strong)]">
          <Calendar className="h-12 w-12 mx-auto mb-3 text-tx-muted" />
          <p className="font-medium">No available slots found</p>
          <p className="text-sm mt-1">Try changing the duration or time preference</p>
        </div>
      ) : (
        <GroupedAvailabilityView
          slots={slotsWithProximity}
          onSelectSlot={onSelectSlot}
          formatSlotDate={formatSlotDate}
          formatTime={formatTime}
          getProximityBadge={getProximityBadge}
        />
      )}

      {/* Back button */}
      <div className="border-t border-[var(--border)] pt-6">
        <button
          type="button"
          onClick={onChangeFilters}
          className="w-full px-6 py-3 border-2 border-[var(--border-strong)] text-tx-secondary rounded-lg hover:bg-surface2 transition-colors font-medium"
        >
          ← Back to Setup
        </button>
      </div>
    </div>
  );
};
