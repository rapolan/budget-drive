import React from 'react';
import clsx from 'clsx';
import type { Lesson } from '@/types';
import { addCalendarDays, parseLocalDate } from '@/utils/timeFormat';

interface WeekStripProps {
  lessons: Lesson[];
  tenantToday: string; // YYYY-MM-DD
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
}

// Compact 7-day-ahead strip: one chip per day, walking forward from the
// tenant's today, with a scheduled-lesson count per day. Tapping a day
// selects it (the caller decides what "selected" means - e.g. filtering
// the lessons shown below). Mirrors the day-bucketing Dashboard.tsx's own
// weeklyLessons memo already does, just rendered as a horizontal strip
// instead of full day cards.
export const WeekStrip: React.FC<WeekStripProps> = ({ lessons, tenantToday, selectedDate, onSelectDate }) => {
  const days = Array.from({ length: 7 }, (_, i) => {
    const dateStr = addCalendarDays(tenantToday, i);
    const count = lessons.filter(
      (l) => String(l.date).split('T')[0] === dateStr && l.status === 'scheduled'
    ).length;
    return { dateStr, date: parseLocalDate(dateStr), count, isToday: i === 0 };
  });

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-4" role="tablist" aria-label="Week ahead">
      {days.map((day) => {
        const isSelected = day.dateStr === selectedDate;
        return (
          <button
            key={day.dateStr}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelectDate(day.dateStr)}
            className={clsx(
              'flex flex-col items-center justify-center min-w-[64px] px-3 py-2 rounded-lg border transition-colors flex-shrink-0',
              isSelected
                ? 'bg-primary text-white border-primary'
                : 'bg-surface border-edge text-tx-secondary hover:bg-surface2'
            )}
          >
            <span className={clsx('text-xs font-medium uppercase', isSelected ? 'text-blue-100' : 'text-tx-muted')}>
              {day.isToday ? 'Today' : day.date.toLocaleDateString('en-US', { weekday: 'short' })}
            </span>
            <span className="text-sm font-semibold">
              {day.date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
            </span>
            <span className={clsx('text-xs mt-0.5', isSelected ? 'text-blue-100' : 'text-tx-muted')}>
              {day.count} {day.count === 1 ? 'lesson' : 'lessons'}
            </span>
          </button>
        );
      })}
    </div>
  );
};
