import React from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { GroupedAvailabilityView, SlotWithProximity } from './GroupedAvailabilityView';
import { Button } from '@/components/common';

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
          className="text-sm text-primary hover:brightness-75 font-medium"
        >
          ← Change Filters
        </button>
      </div>

      {/* Pickup reminder */}
      <div className="bg-status-warning-bg border border-status-warning-border rounded-lg p-3 flex items-start gap-2">
        <MapPin className="h-4 w-4 text-status-warning-text mt-0.5" />
        <div className="text-sm">
          <span className="font-medium text-status-warning-text">Pickup:</span>{' '}
          <span className="text-status-warning-text">{pickupAddress}</span>
        </div>
      </div>

      {/* Stale-slot recovery notice: shown after a confirm-time conflict auto-triggers a re-search */}
      {staleSlotNotice && (
        <div className="bg-status-info-bg border border-status-info-border rounded-lg p-3 text-sm text-status-info-text">
          {staleSlotNotice}
        </div>
      )}

      {/* Non-blocking notice: some instructors' lookups failed but the search still succeeded for the rest */}
      {failedInstructorCount > 0 && (
        <div className="bg-status-warning-bg border border-status-warning-border rounded-lg p-3 text-sm text-status-warning-text">
          Couldn't check availability for {failedInstructorCount}{' '}
          {failedInstructorCount === 1 ? 'instructor' : 'instructors'}. Showing results from everyone else.
        </div>
      )}

      {slotsWithProximity.length === 0 ? (
        <div className="text-center py-12 text-tx-muted bg-surface2 rounded-lg border-2 border-dashed border-edge-strong">
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
      <div className="border-t border-edge pt-6">
        <Button type="button" variant="secondary" onClick={onChangeFilters} className="w-full">
          ← Back to Setup
        </Button>
      </div>
    </div>
  );
};
