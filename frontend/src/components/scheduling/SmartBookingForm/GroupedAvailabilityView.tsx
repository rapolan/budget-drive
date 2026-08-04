import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { RankedTimeSlot } from '@/types';

// Slot with proximity info, computed server-side by findRankedAvailableSlots
export type SlotWithProximity = RankedTimeSlot;

// Instructor-Based Grouped Availability View Component for SmartBookingForm
interface GroupedAvailabilityViewProps {
  slots: SlotWithProximity[];
  onSelectSlot: (slot: SlotWithProximity) => void;
  formatSlotDate: (dateStr: string) => string;
  formatTime: (time: string) => string;
  getProximityBadge: (score: number) => { label: string; class: string };
}

export const GroupedAvailabilityView: React.FC<GroupedAvailabilityViewProps> = ({
  slots,
  onSelectSlot,
  formatSlotDate,
  formatTime,
  getProximityBadge,
}) => {
  const [expandedInstructors, setExpandedInstructors] = useState<Set<string>>(new Set());

  // Group slots by instructor
  const instructorGroups = useMemo(() => {
    const groups = new Map<string, SlotWithProximity[]>();

    slots.forEach(slot => {
      if (!groups.has(slot.instructorId)) {
        groups.set(slot.instructorId, []);
      }
      groups.get(slot.instructorId)!.push(slot);
    });

    // Convert to array and sort by best proximity score of each instructor
    return Array.from(groups.entries())
      .map(([instructorId, instructorSlots]) => {
        const bestScore = Math.max(...instructorSlots.map((s: SlotWithProximity) => s.proximityScore));
        const instructor = instructorSlots[0]; // Get instructor details from first slot

        // Group this instructor's slots by date
        const slotsByDate: { [date: string]: SlotWithProximity[] } = {};
        instructorSlots.forEach((slot: SlotWithProximity) => {
          if (!slotsByDate[slot.date]) {
            slotsByDate[slot.date] = [];
          }
          slotsByDate[slot.date].push(slot);
        });

        // Sort dates and slots
        const sortedDates = Object.entries(slotsByDate)
          .map(([date, dateSlots]) => ({
            date,
            label: formatSlotDate(date),
            slots: dateSlots.sort((a, b) => a.startTime.localeCompare(b.startTime)),
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        return {
          instructorId: instructorId,
          instructorName: instructor.instructorName,
          bestProximityScore: bestScore,
          comingFrom: instructor.comingFrom,
          totalSlots: instructorSlots.length,
          dateGroups: sortedDates,
        };
      })
      .sort((a, b) => b.bestProximityScore - a.bestProximityScore); // Sort by best proximity
  }, [slots, formatSlotDate]);

  const toggleInstructor = (instructorId: string) => {
    setExpandedInstructors(prev => {
      const newSet = new Set(prev);
      if (newSet.has(instructorId)) {
        newSet.delete(instructorId);
      } else {
        newSet.add(instructorId);
      }
      return newSet;
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-tx-muted">{instructorGroups.length} instructors available (sorted by proximity)</p>
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {instructorGroups.map((instructor, index) => {
          const isExpanded = expandedInstructors.has(instructor.instructorId);
          const badge = getProximityBadge(instructor.bestProximityScore);

          return (
            <div key={instructor.instructorId} className="bg-surface rounded-xl border-2 border-edge overflow-hidden">
              {/* Instructor Header - Clickable */}
              <button
                type="button"
                onClick={() => toggleInstructor(instructor.instructorId)}
                className="w-full p-4 flex items-center gap-3 hover:bg-surface2 transition-colors text-left"
              >
                {/* Rank indicator */}
                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-sm md:text-base flex-shrink-0 ${
                  index < 3 ? 'bg-status-success-bg text-status-success-text' : 'bg-surface2 text-tx-muted'
                }`}>
                  #{index + 1}
                </div>

                {/* Instructor info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-tx-primary text-base md:text-lg">{instructor.instructorName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${badge.class}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-sm text-tx-secondary mt-1">
                    {instructor.totalSlots} available {instructor.totalSlots === 1 ? 'slot' : 'slots'}
                  </div>
                </div>

                {/* Expand/Collapse Icon */}
                <div className="text-tx-muted flex-shrink-0">
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
              </button>

              {/* Expanded: Show slots grouped by date */}
              {isExpanded && (
                <div className="border-t border-edge bg-surface2 p-3 space-y-3">
                  {instructor.dateGroups.map(dateGroup => (
                    <div key={dateGroup.date}>
                      {/* Date header */}
                      <div className="text-xs font-semibold text-tx-secondary mb-2 px-1">
                        {dateGroup.label}
                      </div>

                      {/* Time slots for this date */}
                      <div className="space-y-2">
                        {dateGroup.slots.map((slot, idx) => (
                          <button
                            key={`${slot.instructorId}-${slot.date}-${slot.startTime}-${idx}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectSlot(slot);
                            }}
                            className="w-full p-3 bg-surface border border-edge rounded-lg hover:border-primary hover:bg-status-info-bg transition-all text-left flex items-center justify-between active:scale-[0.98]"
                          >
                            <span className="text-sm font-medium text-tx-primary">
                              {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                            </span>
                            <span className="text-tx-muted text-sm">→</span>
                          </button>
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
    </div>
  );
};
