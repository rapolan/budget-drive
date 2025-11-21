import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { TimeSlot } from '@/types';

interface WeeklySlotViewProps {
  availableSlots: TimeSlot[];
  onSelectSlot: (slot: TimeSlot) => void;
  selectedSlot?: TimeSlot | null;
}

export const WeeklySlotView: React.FC<WeeklySlotViewProps> = ({
  availableSlots,
  onSelectSlot,
  selectedSlot,
}) => {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    // Start from the earliest available slot's week
    if (availableSlots.length > 0) {
      const firstSlotDate = new Date(availableSlots[0].date);
      const dayOfWeek = firstSlotDate.getDay();
      const weekStart = new Date(firstSlotDate);
      weekStart.setDate(firstSlotDate.getDate() - dayOfWeek);
      return weekStart;
    }
    return new Date();
  });

  // Generate week days
  const getWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const weekDays = getWeekDays();

  // Generate time slots (0:00 to 23:30 to cover all possible times)
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        slots.push(timeString);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Group available slots by date and time
  const slotsByDateAndTime = new Map<string, TimeSlot>();
  availableSlots.forEach((slot) => {
    // Parse the date from slot.date (YYYY-MM-DD format)
    const slotDate = new Date(slot.date);
    const dateKey = `${slotDate.getFullYear()}-${(slotDate.getMonth() + 1).toString().padStart(2, '0')}-${slotDate.getDate().toString().padStart(2, '0')}`;

    // Extract time from ISO 8601 startTime (e.g., "2025-11-22T01:00:00.000Z" -> "01:00:00")
    const slotStartTime = new Date(slot.startTime);
    const timeKey = `${slotStartTime.getUTCHours().toString().padStart(2, '0')}:${slotStartTime.getUTCMinutes().toString().padStart(2, '0')}:00`;

    const key = `${dateKey}-${timeKey}`;
    slotsByDateAndTime.set(key, slot);
  });

  // Find slot for a given date and time
  const findSlot = (date: Date, time: string): TimeSlot | undefined => {
    const dateKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    const key = `${dateKey}-${time}`;
    return slotsByDateAndTime.get(key);
  };

  // Check if a slot is selected
  const isSlotSelected = (slot: TimeSlot): boolean => {
    if (!selectedSlot) return false;
    return (
      slot.date === selectedSlot.date &&
      slot.startTime === selectedSlot.startTime
    );
  };

  // Format time for display
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Format date for display
  const formatDate = (date: Date): { day: string; date: string } => {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
    });
    return { day: dayName, date: dateStr };
  };

  // Navigate weeks
  const previousWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(currentWeekStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const nextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(currentWeekStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  // Check if today
  const isToday = (date: Date): boolean => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  return (
    <div className="space-y-4">
      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={previousWeek}
          className="p-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          title="Previous week"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <div className="text-lg font-semibold text-gray-900">
            {currentWeekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <div className="text-sm text-gray-600">
            Week of {currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>
        <button
          onClick={nextWeek}
          className="p-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          title="Next week"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Header Row - Days of Week */}
            <div className="grid grid-cols-8 border-b border-gray-200 bg-gray-50">
              <div className="p-2 text-xs font-semibold text-gray-500 border-r border-gray-200">
                Time
              </div>
              {weekDays.map((day, idx) => {
                const { day: dayName, date: dateStr } = formatDate(day);
                return (
                  <div
                    key={idx}
                    className={`p-2 text-center border-r border-gray-200 last:border-r-0 ${
                      isToday(day) ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className={`text-xs font-semibold ${isToday(day) ? 'text-blue-600' : 'text-gray-700'}`}>
                      {dayName}
                    </div>
                    <div className={`text-xs ${isToday(day) ? 'text-blue-600' : 'text-gray-500'}`}>
                      {dateStr}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time Slot Rows */}
            <div className="max-h-96 overflow-y-auto">
              {timeSlots.map((time, timeIdx) => (
                <div
                  key={timeIdx}
                  className="grid grid-cols-8 border-b border-gray-200 last:border-b-0"
                >
                  {/* Time Label */}
                  <div className="p-2 text-xs font-medium text-gray-600 border-r border-gray-200 bg-gray-50 sticky left-0 z-10">
                    {formatTime(time)}
                  </div>

                  {/* Day Cells */}
                  {weekDays.map((day, dayIdx) => {
                    const slot = findSlot(day, time);
                    const isSelected = slot && isSlotSelected(slot);

                    return (
                      <div
                        key={dayIdx}
                        className="border-r border-gray-200 last:border-r-0 min-h-[40px]"
                      >
                        {slot ? (
                          <button
                            onClick={() => onSelectSlot(slot)}
                            className={`w-full h-full p-1 text-xs transition-colors ${
                              isSelected
                                ? 'bg-blue-500 text-white font-semibold'
                                : 'bg-green-100 hover:bg-green-200 text-green-800'
                            }`}
                            title={`Available: ${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`}
                          >
                            {isSelected ? '✓ Selected' : 'Available'}
                          </button>
                        ) : (
                          <div className="w-full h-full bg-gray-50"></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-600">
        <div className="flex items-center">
          <div className="w-4 h-4 bg-green-100 border border-green-300 rounded mr-2"></div>
          <span>Available</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-blue-500 rounded mr-2"></div>
          <span>Selected</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-gray-50 border border-gray-200 rounded mr-2"></div>
          <span>Not Available</span>
        </div>
      </div>
    </div>
  );
};
