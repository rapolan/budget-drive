import React, { useState, useEffect } from 'react';
import { schedulingApi } from '@/api';
import { InstructorAvailability, Instructor } from '@/types';

interface AvailabilityCalendarProps {
  instructorId: string;
  onSlotClick?: (dayOfWeek: number, startTime: string, endTime: string) => void;
  editable?: boolean;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, '0');
  return `${hour}:00`;
});

export const AvailabilityCalendar: React.FC<AvailabilityCalendarProps> = ({
  instructorId,
  onSlotClick,
  editable = false,
}) => {
  const [availability, setAvailability] = useState<InstructorAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAvailability();
  }, [instructorId]);

  const loadAvailability = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await schedulingApi.getInstructorAvailability(instructorId);
      setAvailability(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load availability');
      console.error('Error loading availability:', err);
    } finally {
      setLoading(false);
    }
  };

  const getAvailabilityForSlot = (dayOfWeek: number, timeSlot: string): InstructorAvailability | null => {
    return availability.find((slot) => {
      if (!slot.isActive || slot.dayOfWeek !== dayOfWeek) return false;

      const slotHour = parseInt(timeSlot.split(':')[0]);
      const startHour = parseInt(slot.startTime.split(':')[0]);
      const endHour = parseInt(slot.endTime.split(':')[0]);

      return slotHour >= startHour && slotHour < endHour;
    }) || null;
  };

  const handleSlotClick = (dayOfWeek: number, timeSlot: string) => {
    if (!editable || !onSlotClick) return;

    const nextHour = (parseInt(timeSlot.split(':')[0]) + 1).toString().padStart(2, '0');
    onSlotClick(dayOfWeek, timeSlot, `${nextHour}:00`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading availability...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
        <button
          onClick={loadAvailability}
          className="mt-2 text-red-600 hover:text-red-800 font-medium"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50">
                Time
              </th>
              {DAYS_OF_WEEK.map((day) => (
                <th
                  key={day.value}
                  className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  <div className="hidden md:block">{day.label}</div>
                  <div className="md:hidden">{day.short}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {TIME_SLOTS.map((timeSlot) => (
              <tr key={timeSlot} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 sticky left-0 bg-white font-medium">
                  {timeSlot}
                </td>
                {DAYS_OF_WEEK.map((day) => {
                  const slot = getAvailabilityForSlot(day.value, timeSlot);
                  const isAvailable = slot !== null;

                  return (
                    <td
                      key={`${day.value}-${timeSlot}`}
                      onClick={() => handleSlotClick(day.value, timeSlot)}
                      className={`px-3 py-2 text-center text-sm ${
                        editable ? 'cursor-pointer' : ''
                      } ${
                        isAvailable
                          ? 'bg-green-100 hover:bg-green-200'
                          : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      {isAvailable && (
                        <div className="text-xs text-green-700 font-medium">
                          Available
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {availability.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No availability set. {editable && 'Click on time slots to add availability.'}
        </div>
      )}
    </div>
  );
};
