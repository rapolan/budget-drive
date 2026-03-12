import React, { useState, useEffect, useMemo } from 'react';
import { schedulingApi } from '@/api';
import { InstructorAvailability } from '@/types';

const API_BASE = 'http://127.0.0.1:4000/api/v1';


interface AvailabilityCalendarProps {
  instructorId: string;
  onSlotClick?: (dayOfWeek: number, startTime: string, endTime: string) => void;
  editable?: boolean;
}

interface BookableSlot {
  startTime: string;
  endTime: string;
  slotNumber: number;
}

interface SchedulingSettings {
  defaultLessonDuration: number;
  bufferTimeBetweenLessons: number;
  defaultMaxStudentsPerDay: number;
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

// Time slots from 7 AM to 9 PM (practical hours for driving lessons)
const START_HOUR = 7;
const END_HOUR = 21;
const TIME_SLOTS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => {
  const hour = (START_HOUR + i).toString().padStart(2, '0');
  return `${hour}:00`;
});

// Convert minutes to HH:MM format
const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// Convert HH:MM to minutes
const timeToMinutes = (time: string): number => {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
};

export const AvailabilityCalendar: React.FC<AvailabilityCalendarProps> = ({
  instructorId,
  onSlotClick,
  editable = false,
}) => {
  const [availability, setAvailability] = useState<InstructorAvailability[]>([]);
  const [schedulingSettings, setSchedulingSettings] = useState<SchedulingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (instructorId) {
      console.log('📅 AvailabilityCalendar: Loading data for instructor:', instructorId);
      loadData();
    }
  }, [instructorId]);

  const loadData = async () => {
    if (!instructorId) {
      console.log('⚠️ AvailabilityCalendar: No instructor ID provided');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('🔄 AvailabilityCalendar: Fetching availability for instructor:', instructorId);

      // Load both availability and scheduling settings
      const [availData, settingsResponse] = await Promise.all([
        schedulingApi.getInstructorAvailability(instructorId),
        fetch(`${API_BASE}/availability/settings`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'X-Tenant-ID': localStorage.getItem('tenant_id') || '',
          },
        }),
      ]);

      console.log('📊 AvailabilityCalendar: Received availability data:', availData);
      console.log('📊 AvailabilityCalendar: Data count:', availData.length);

      // Normalize time format (remove seconds if present)
      const normalizedAvailData = availData.map(slot => ({
        ...slot,
        startTime: slot.startTime.substring(0, 5), // HH:MM:SS -> HH:MM
        endTime: slot.endTime.substring(0, 5),     // HH:MM:SS -> HH:MM
      }));

      console.log('✅ AvailabilityCalendar: Normalized data:', normalizedAvailData);
      setAvailability(normalizedAvailData);

      if (settingsResponse.ok) {
        const settingsResult = await settingsResponse.json();
        console.log('⚙️ AvailabilityCalendar: Settings loaded:', settingsResult.data);
        setSchedulingSettings(settingsResult.data);
      } else {
        console.log('⚠️ AvailabilityCalendar: Using default settings');
        // Use defaults if settings can't be loaded
        setSchedulingSettings({
          defaultLessonDuration: 120,
          bufferTimeBetweenLessons: 30,
          defaultMaxStudentsPerDay: 3,
        });
      }
    } catch (err: any) {
      console.error('❌ AvailabilityCalendar: Error loading availability:', err);
      setError(err.response?.data?.error || 'Failed to load availability');
    } finally {
      setLoading(false);
    }
  };

  // Calculate bookable slots for each availability entry
  const bookableSlotsByDay = useMemo(() => {
    console.log('🔄 AvailabilityCalendar: Calculating bookable slots');
    console.log('   - Scheduling settings:', schedulingSettings);
    console.log('   - Availability count:', availability.length);

    if (!schedulingSettings) {
      console.log('⚠️ AvailabilityCalendar: No scheduling settings, returning empty map');
      return new Map<number, BookableSlot[]>();
    }

    const slotsByDay = new Map<number, BookableSlot[]>();

    availability.forEach((avail) => {
      console.log(`   - Processing slot for day ${avail.dayOfWeek}:`, avail);

      if (!avail.isActive) {
        console.log(`     ⚠️ Slot is inactive, skipping`);
        return;
      }

      const lessonDuration = schedulingSettings.defaultLessonDuration;
      const buffer = schedulingSettings.bufferTimeBetweenLessons;
      // Use slot-specific maxStudents or fall back to default
      const maxStudents = avail.maxStudents ?? schedulingSettings.defaultMaxStudentsPerDay;

      console.log(`     ✓ Lesson: ${lessonDuration}min, Buffer: ${buffer}min, Max students: ${maxStudents}`);

      const startMinutes = timeToMinutes(avail.startTime);
      const slots: BookableSlot[] = [];

      for (let i = 0; i < maxStudents; i++) {
        const slotStartMinutes = startMinutes + (i * (lessonDuration + buffer));
        const slotEndMinutes = slotStartMinutes + lessonDuration;

        slots.push({
          startTime: minutesToTime(slotStartMinutes),
          endTime: minutesToTime(slotEndMinutes),
          slotNumber: i + 1,
        });
      }

      console.log(`     ✓ Created ${slots.length} bookable slots:`, slots);

      const existingSlots = slotsByDay.get(avail.dayOfWeek) || [];
      slotsByDay.set(avail.dayOfWeek, [...existingSlots, ...slots]);
    });

    console.log('✅ AvailabilityCalendar: Final slots by day:', slotsByDay);
    return slotsByDay;
  }, [availability, schedulingSettings]);

  // Check if a time slot hour falls within a bookable slot
  const getBookableSlotForTime = (dayOfWeek: number, timeSlot: string): BookableSlot | null => {
    const daySlots = bookableSlotsByDay.get(dayOfWeek) || [];
    const timeHour = parseInt(timeSlot.split(':')[0]);

    return daySlots.find((slot) => {
      const slotStartHour = parseInt(slot.startTime.split(':')[0]);
      const slotStartMin = parseInt(slot.startTime.split(':')[1]);
      const slotEndHour = parseInt(slot.endTime.split(':')[0]);
      const slotEndMin = parseInt(slot.endTime.split(':')[1]);

      // Check if the timeHour falls within this slot
      const startInMinutes = slotStartHour * 60 + slotStartMin;
      const endInMinutes = slotEndHour * 60 + slotEndMin;
      const timeInMinutes = timeHour * 60;

      return timeInMinutes >= startInMinutes && timeInMinutes < endInMinutes;
    }) || null;
  };

  // Check if this is the start of a bookable slot
  const isSlotStart = (dayOfWeek: number, timeSlot: string): BookableSlot | null => {
    const daySlots = bookableSlotsByDay.get(dayOfWeek) || [];
    const timeHour = parseInt(timeSlot.split(':')[0]);

    return daySlots.find((slot) => {
      const slotStartHour = parseInt(slot.startTime.split(':')[0]);
      return slotStartHour === timeHour;
    }) || null;
  };

  const handleSlotClick = (dayOfWeek: number, timeSlot: string) => {
    if (!editable || !onSlotClick) return;

    const bookableSlot = isSlotStart(dayOfWeek, timeSlot);
    if (bookableSlot) {
      onSlotClick(dayOfWeek, bookableSlot.startTime, bookableSlot.endTime);
    }
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
          onClick={loadData}
          className="mt-2 text-red-600 hover:text-red-800 font-medium"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Legend */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span>Lesson Start</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-green-100 rounded"></div>
          <span>Lesson Time</span>
        </div>
        <div className="text-gray-500">
          ({schedulingSettings?.defaultLessonDuration || 120} min lessons, {schedulingSettings?.bufferTimeBetweenLessons || 30} min buffer)
        </div>
      </div>

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
                  const bookableSlot = getBookableSlotForTime(day.value, timeSlot);
                  const slotStart = isSlotStart(day.value, timeSlot);
                  const isInSlot = bookableSlot !== null;

                  return (
                    <td
                      key={`${day.value}-${timeSlot}`}
                      onClick={() => handleSlotClick(day.value, timeSlot)}
                      className={`px-3 py-2 text-center text-sm ${editable && slotStart ? 'cursor-pointer' : ''
                        } ${slotStart
                          ? 'bg-green-500 hover:bg-green-600'
                          : isInSlot
                            ? 'bg-green-100'
                            : 'bg-gray-50'
                        }`}
                    >
                      {slotStart && (
                        <div className="text-xs text-white font-medium">
                          Slot {slotStart.slotNumber}
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
