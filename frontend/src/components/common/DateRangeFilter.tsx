import React from 'react';
import { Calendar, X } from 'lucide-react';

export type DateRangePreset = 'all' | 'today' | 'this_week' | 'this_month' | 'custom';

export interface DateRangeValue {
  start: string;
  end: string;
  preset: DateRangePreset;
}

interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
  // Tenant-timezone-resolved boundaries (YYYY-MM-DD) - this component stays
  // presentational and never derives "today"/week/month itself, so it
  // never needs date-fns's Date-based boundary helpers or the browser's
  // own clock (see docs/ARCHITECTURE.md §7).
  tenantToday: string;
  tenantWeekStart: string;
  tenantWeekEnd: string;
  tenantMonthStart: string;
  tenantMonthEnd: string;
}

const presetButtons: { label: string; value: DateRangePreset }[] = [
  { label: 'All Time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'this_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Custom', value: 'custom' },
];

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  value,
  onChange,
  tenantToday,
  tenantWeekStart,
  tenantWeekEnd,
  tenantMonthStart,
  tenantMonthEnd,
}) => {
  const handlePresetClick = (preset: DateRangePreset) => {
    let start = '';
    let end = '';

    switch (preset) {
      case 'today':
        start = tenantToday;
        end = tenantToday;
        break;
      case 'this_week':
        start = tenantWeekStart;
        end = tenantWeekEnd;
        break;
      case 'this_month':
        start = tenantMonthStart;
        end = tenantMonthEnd;
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
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-surface p-4 shadow-sm border border-edge">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-tx-muted" />
        <span className="text-sm font-medium text-tx-secondary">Date:</span>
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
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-tx-secondary border-edge-strong hover:bg-surface2'
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
            className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
            title="Start date"
          />
          <span className="text-tx-muted">to</span>
          <input
            type="date"
            value={value.end}
            onChange={(e) => handleCustomDateChange('end', e.target.value)}
            className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
            title="End date"
          />
          {(value.start || value.end) && (
            <button
              type="button"
              onClick={clearCustomDates}
              className="p-1.5 text-tx-muted hover:text-tx-secondary rounded-full hover:bg-surface2 transition-colors"
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
