import React, { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { schedulingApi } from '@/api';
import { WeekDayAvailabilityInput } from '@/types';
import { Button } from '@/components/common';

interface WeeklyAvailabilityGridProps {
  instructorId: string;
  onUpdate?: () => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

// Backend's real scheduling_settings shape (see availabilityService.ts's
// transformSchedulingSettings) - deliberately narrower than the stale,
// mismatched SchedulingSettings type in @/types (that interface describes
// fields this table doesn't have; AvailabilityEditor.tsx worked around the
// same mismatch with an untyped `any`). Only the one field this grid
// actually displays is typed here.
interface RawSchedulingSettings {
  defaultMaxStudentsPerDay?: number;
}

interface DayRow extends WeekDayAvailabilityInput {
  startTime: string;
  endTime: string;
  maxStudents: number | null;
}

const DEFAULT_START = '09:00';
const DEFAULT_END = '17:00';

function blankWeek(): DayRow[] {
  return DAYS_OF_WEEK.map((day) => ({
    dayOfWeek: day.value,
    isActive: false,
    startTime: DEFAULT_START,
    endTime: DEFAULT_END,
    maxStudents: null,
  }));
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

function weeksEqual(a: DayRow[], b: DayRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => {
    const other = b[i];
    if (row.dayOfWeek !== other.dayOfWeek || row.isActive !== other.isActive) return false;
    if (!row.isActive) return true;
    return (
      row.startTime === other.startTime &&
      row.endTime === other.endTime &&
      row.maxStudents === other.maxStudents
    );
  });
}

export const WeeklyAvailabilityGrid: React.FC<WeeklyAvailabilityGridProps> = ({
  instructorId,
  onUpdate,
}) => {
  const [days, setDays] = useState<DayRow[]>(blankWeek());
  const [savedDays, setSavedDays] = useState<DayRow[]>(blankWeek());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultMaxStudents, setDefaultMaxStudents] = useState(3);

  useEffect(() => {
    if (!instructorId) return;
    loadWeek();
    loadSchedulingSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructorId]);

  const loadSchedulingSettings = async () => {
    try {
      const settings = (await schedulingApi.getSchedulingSettings()) as unknown as RawSchedulingSettings;
      if (settings?.defaultMaxStudentsPerDay) {
        setDefaultMaxStudents(settings.defaultMaxStudentsPerDay);
      }
    } catch (err) {
      console.error('Error loading scheduling settings:', err);
    }
  };

  const loadWeek = async () => {
    try {
      setLoading(true);
      setError(null);
      const rows = await schedulingApi.getInstructorAvailability(instructorId);

      const week = blankWeek();
      for (const row of rows) {
        const idx = week.findIndex((d) => d.dayOfWeek === row.dayOfWeek);
        if (idx === -1) continue;
        week[idx] = {
          dayOfWeek: row.dayOfWeek,
          isActive: row.isActive,
          startTime: row.startTime.substring(0, 5),
          endTime: row.endTime.substring(0, 5),
          maxStudents: row.maxStudents,
        };
      }

      setDays(week);
      setSavedDays(week);
    } catch (err) {
      const apiError = err as { response?: { data?: { error?: string } } };
      setError(apiError.response?.data?.error || 'Failed to load availability');
      console.error('Error loading availability:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateDay = (dayOfWeek: number, patch: Partial<DayRow>) => {
    setDays((prev) =>
      prev.map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row))
    );
  };

  const toggleDay = (dayOfWeek: number, isActive: boolean) => {
    updateDay(dayOfWeek, { isActive });
  };

  const copyToAllCheckedDays = (sourceDayOfWeek: number) => {
    const source = days.find((d) => d.dayOfWeek === sourceDayOfWeek);
    if (!source) return;
    setDays((prev) =>
      prev.map((row) =>
        row.isActive && row.dayOfWeek !== sourceDayOfWeek
          ? { ...row, startTime: source.startTime, endTime: source.endTime, maxStudents: source.maxStudents }
          : row
      )
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      for (const row of days) {
        if (row.isActive && row.startTime >= row.endTime) {
          const label = DAYS_OF_WEEK.find((d) => d.value === row.dayOfWeek)?.label;
          throw new Error(`${label}: start time must be before end time`);
        }
      }

      const payload: WeekDayAvailabilityInput[] = days.map((row) =>
        row.isActive
          ? {
              dayOfWeek: row.dayOfWeek,
              isActive: true,
              startTime: row.startTime,
              endTime: row.endTime,
              maxStudents: row.maxStudents,
            }
          : { dayOfWeek: row.dayOfWeek, isActive: false }
      );

      const saved = await schedulingApi.setWeekAvailability(instructorId, payload);

      const week = blankWeek();
      for (const row of saved) {
        const idx = week.findIndex((d) => d.dayOfWeek === row.dayOfWeek);
        if (idx === -1) continue;
        week[idx] = {
          dayOfWeek: row.dayOfWeek,
          isActive: row.isActive,
          startTime: row.startTime.substring(0, 5),
          endTime: row.endTime.substring(0, 5),
          maxStudents: row.maxStudents,
        };
      }
      // Preserve locally-known times for now-inactive days so an
      // uncheck-then-save-then-recheck within the same session still shows
      // the times the admin last had, even though the server no longer
      // returns an inactive row.
      for (let i = 0; i < week.length; i++) {
        if (!week[i].isActive) {
          week[i] = { ...week[i], startTime: days[i].startTime, endTime: days[i].endTime, maxStudents: days[i].maxStudents };
        }
      }

      setDays(week);
      setSavedDays(week);
      onUpdate?.();
    } catch (err) {
      const apiError = err as { response?: { data?: { error?: string } }; message?: string };
      setError(apiError.response?.data?.error || apiError.message || 'Failed to save availability');
      console.error('Error saving weekly availability:', err);
    } finally {
      setSaving(false);
    }
  };

  const isDirty = !weeksEqual(days, savedDays);
  const workingDays = days.filter((d) => d.isActive);
  const totalHours = workingDays.reduce(
    (sum, d) => sum + Math.max(0, timeToMinutes(d.endTime) - timeToMinutes(d.startTime)) / 60,
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-tx-muted">Loading availability...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-status-danger-bg border border-status-danger-border rounded-lg p-4">
          <p className="text-status-danger-text">{error}</p>
        </div>
      )}

      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-tx-primary">Weekly Availability</h3>
        <p className="text-sm text-tx-secondary" data-testid="week-summary">
          {workingDays.length} {workingDays.length === 1 ? 'day' : 'days'} · {totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)} hrs
        </p>
      </div>

      <div className="bg-surface rounded-lg shadow divide-y divide-edge">
        {days.map((row) => {
          const dayLabel = DAYS_OF_WEEK.find((d) => d.value === row.dayOfWeek)?.label ?? '';
          return (
            <div key={row.dayOfWeek} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="flex items-center gap-3 sm:w-40 flex-shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={row.isActive}
                  onChange={(e) => toggleDay(row.dayOfWeek, e.target.checked)}
                  aria-label={`${dayLabel} works this day`}
                  className="h-4 w-4 rounded border-edge-strong text-primary focus:ring-primary"
                />
                <span className="font-medium text-tx-primary">{dayLabel}</span>
              </label>

              {row.isActive ? (
                <div className="flex flex-1 flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-tx-muted" htmlFor={`start-${row.dayOfWeek}`}>Start</label>
                    <input
                      id={`start-${row.dayOfWeek}`}
                      type="time"
                      value={row.startTime}
                      onChange={(e) => updateDay(row.dayOfWeek, { startTime: e.target.value })}
                      autoComplete="nope"
                      className="px-2 py-1.5 border border-edge-strong rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-tx-muted" htmlFor={`end-${row.dayOfWeek}`}>End</label>
                    <input
                      id={`end-${row.dayOfWeek}`}
                      type="time"
                      value={row.endTime}
                      onChange={(e) => updateDay(row.dayOfWeek, { endTime: e.target.value })}
                      autoComplete="nope"
                      className="px-2 py-1.5 border border-edge-strong rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-tx-muted" htmlFor={`max-${row.dayOfWeek}`}>Max students</label>
                    <select
                      id={`max-${row.dayOfWeek}`}
                      value={row.maxStudents ?? ''}
                      onChange={(e) =>
                        updateDay(row.dayOfWeek, {
                          maxStudents: e.target.value === '' ? null : parseInt(e.target.value, 10),
                        })
                      }
                      className="px-2 py-1.5 border border-edge-strong rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      <option value="">Default ({defaultMaxStudents})</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToAllCheckedDays(row.dayOfWeek)}
                    disabled={workingDays.length < 2}
                    title="Copy this day's times and cap to every other checked day"
                    className="flex items-center gap-1 px-2 py-1.5 text-xs text-tx-secondary hover:text-primary hover:bg-status-info-bg rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-tx-secondary"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy to all checked days
                  </button>
                </div>
              ) : (
                <span className="text-tx-muted text-sm italic">Not working</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={!isDirty} loading={saving}>
          {saving ? 'Saving...' : 'Save Week'}
        </Button>
      </div>
    </div>
  );
};
