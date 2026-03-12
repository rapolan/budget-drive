import React from 'react';
import { Calendar, X } from 'lucide-react';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from 'date-fns';

export type DateRangePreset = 'all' | 'today' | 'this_week' | 'this_month' | 'custom';

export interface DateRangeValue {
  start: string;
  end: string;
  preset: DateRangePreset;
}

interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
}

const presetButtons: { label: string; value: DateRangePreset }[] = [
  { label: 'All Time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'this_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Custom', value: 'custom' },
];

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ value, onChange }) => {
  const handlePresetClick = (preset: DateRangePreset) => {
    const now = new Date();
    let start = '';
    let end = '';

    switch (preset) {
      case 'today':
        start = format(startOfDay(now), 'yyyy-MM-dd');
        end = format(endOfDay(now), 'yyyy-MM-dd');
        break;
      case 'this_week':
        start = format(startOfWeek(now, { weekStartsOn: 0 }), 'yyyy-MM-dd');
        end = format(endOfWeek(now, { weekStartsOn: 0 }), 'yyyy-MM-dd');
        break;
      case 'this_month':
        start = format(startOfMonth(now), 'yyyy-MM-dd');
        end = format(endOfMonth(now), 'yyyy-MM-dd');
        break;
      case 'all':
      case 'custom':
      default:
        start = '';
        end = '';
        break;
    }

    onChange({ start, end, preset });
  };

  const handleCustomDateChange = (field: 'start' | 'end', dateValue: string) => {
    onChange({
      ...value,
      [field]: dateValue,
      preset: 'custom',
    });
  };

  const clearCustomDates = () => {
    onChange({ start: '', end: '', preset: 'all' });
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-white p-4 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">Date:</span>
      </div>

      {/* Preset Buttons */}
      <div className="flex flex-wrap gap-2">
        {presetButtons.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => handlePresetClick(preset.value)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all hover:scale-105 active:scale-95 ${
              value.preset === preset.value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Custom Date Inputs */}
      {value.preset === 'custom' && (
        <div className="flex items-center gap-2 mt-2 sm:mt-0 sm:ml-2 sm:border-l sm:pl-4">
          <input
            type="date"
            value={value.start}
            onChange={(e) => handleCustomDateChange('start', e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            title="Start date"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={value.end}
            onChange={(e) => handleCustomDateChange('end', e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            title="End date"
          />
          {(value.start || value.end) && (
            <button
              type="button"
              onClick={clearCustomDates}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              title="Clear dates"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
