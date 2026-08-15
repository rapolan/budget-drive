import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SettingsPage } from './Settings';

const mockRefreshSettings = vi.fn().mockResolvedValue(undefined);

// Hoisted so the object reference is stable across renders - GeneralSettings's
// useEffect depends on [settings], so a mock that returns a fresh object
// literal on every call would re-trigger setForm() every render, looping
// forever (this caused an actual OOM crash before being fixed).
const MOCK_SETTINGS = {
  businessName: 'Test Driving School',
  businessTagline: '',
  supportPhone: '',
  supportEmail: '',
  websiteUrl: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  zipCode: '',
  defaultHoursRequired: 6,
  standardLessonLengthMinutes: 120,
  defaultLessonCost: 150,
  maxLessonsPerStudentPerDay: 1,
  timezone: 'America/New_York',
};
const MOCK_TENANT = { name: 'Test Driving School' };
const mockUpdateTheme = vi.fn();

// Mutable so the timezone-suggestion tests can swap in a settings object
// with timezone: null without a full vi.mock reset - reset to the
// "explicitly set" fixture in each describe block's own beforeEach.
let mockTenantSettings: typeof MOCK_SETTINGS | (Omit<typeof MOCK_SETTINGS, 'timezone'> & { timezone: null }) = MOCK_SETTINGS;

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    settings: mockTenantSettings,
    tenant: MOCK_TENANT,
    tenantType: 'driving_school',
    loading: false,
    error: null,
    refreshSettings: mockRefreshSettings,
    updateTheme: mockUpdateTheme,
  }),
}));

vi.mock('./TeamSettings', () => ({ TeamSettings: () => null }));

const originalFetch = global.fetch;

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

// Regression coverage for item 8: tenant_settings.timezone was readable/
// writable through the API but had no UI surface - a school outside the
// hardcoded Pacific default had no way to correct it themselves.
describe('Settings - General tab timezone picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantSettings = MOCK_SETTINGS;
    mockRefreshSettings.mockResolvedValue(undefined);
    // SettingsPage defaults to the Scheduling tab, whose own component
    // fetches scheduling settings on mount - mock fetch globally so that
    // (unrelated to this test) request resolves instead of hanging.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    }) as unknown as typeof fetch;
  });

  it('renders the timezone select defaulted to the tenant\'s current value', async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const select = await screen.findByLabelText(/school timezone/i);
    expect((select as HTMLSelectElement).value).toBe('America/New_York');
  });

  it('submits the newly-selected timezone through the existing save path', async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const select = await screen.findByLabelText(/school timezone/i);
    fireEvent.change(select, { target: { value: 'America/Phoenix' } });
    expect((select as HTMLSelectElement).value).toBe('America/Phoenix');

    fireEvent.click(screen.getByRole('button', { name: /save general settings/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tenant/settings'),
        expect.objectContaining({ method: 'PUT' })
      );
    });

    const putCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([, options]) => options?.method === 'PUT'
    );
    expect(putCall).toBeDefined();
    const body = JSON.parse(putCall![1].body as string);
    expect(body.timezone).toBe('America/Phoenix');
  });
});

describe('Settings - General tab default lesson cost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantSettings = MOCK_SETTINGS;
    mockRefreshSettings.mockResolvedValue(undefined);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    }) as unknown as typeof fetch;
  });

  it('renders the default lesson cost field defaulted to the tenant\'s current value', async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const input = await screen.findByLabelText(/default lesson cost/i);
    expect((input as HTMLInputElement).value).toBe('150');
  });

  it('submits the newly-entered default lesson cost through the existing save path', async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const input = await screen.findByLabelText(/default lesson cost/i);
    fireEvent.change(input, { target: { value: '175' } });
    expect((input as HTMLInputElement).value).toBe('175');

    fireEvent.click(screen.getByRole('button', { name: /save general settings/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tenant/settings'),
        expect.objectContaining({ method: 'PUT' })
      );
    });

    const putCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([, options]) => options?.method === 'PUT'
    );
    expect(putCall).toBeDefined();
    const body = JSON.parse(putCall![1].body as string);
    expect(body.defaultLessonCost).toBe(175);
  });
});

describe('Settings - General tab max lessons per student per day', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantSettings = MOCK_SETTINGS;
    mockRefreshSettings.mockResolvedValue(undefined);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    }) as unknown as typeof fetch;
  });

  it('renders the max lessons per student per day field defaulted to the tenant\'s current value', async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const input = await screen.findByLabelText(/max lessons per student per day/i);
    expect((input as HTMLInputElement).value).toBe('1');
  });

  it('submits the newly-entered max lessons per student per day through the existing save path', async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const input = await screen.findByLabelText(/max lessons per student per day/i);
    fireEvent.change(input, { target: { value: '2' } });
    expect((input as HTMLInputElement).value).toBe('2');

    fireEvent.click(screen.getByRole('button', { name: /save general settings/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tenant/settings'),
        expect.objectContaining({ method: 'PUT' })
      );
    });

    const putCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([, options]) => options?.method === 'PUT'
    );
    expect(putCall).toBeDefined();
    const body = JSON.parse(putCall![1].body as string);
    expect(body.maxLessonsPerStudentPerDay).toBe(2);
  });
});

// Regression: Postgres numeric columns (tenant_settings.default_hours_required,
// standard_lesson_length_minutes) come back through the API as strings
// ("6.00", not 6). Previously only defaultLessonCost was coerced with
// Number() here - these two used `?? 6`/`?? 120`, which doesn't coerce a
// truthy string, so the quick-select buttons' `=== h` comparison never
// matched and no button ever showed as "active" for a tenant's real saved
// value.
describe('Settings - General tab numeric field coercion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshSettings.mockResolvedValue(undefined);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    }) as unknown as typeof fetch;
  });

  it('shows the matching quick-select as active when defaultHoursRequired arrives as a numeric string', async () => {
    mockTenantSettings = { ...MOCK_SETTINGS, defaultHoursRequired: '8.00' as unknown as number };
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const activeButton = await screen.findByRole('button', { name: '8h' });
    expect(activeButton.className).toContain('bg-primary');
  });

  it('shows the matching quick-select as active when standardLessonLengthMinutes arrives as a numeric string', async () => {
    mockTenantSettings = { ...MOCK_SETTINGS, standardLessonLengthMinutes: '90.00' as unknown as number };
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const activeButton = await screen.findByRole('button', { name: '90m' });
    expect(activeButton.className).toContain('bg-primary');
  });
});

// Detection is a CONVENIENCE ONLY (see CLAUDE.md / the plan for this item):
// it must never silently apply, and must only ever appear while the tenant
// has genuinely never set a timezone (settings.timezone === null).
describe('Settings - General tab timezone auto-detect suggestion', () => {
  const UNSET_SETTINGS = { ...MOCK_SETTINGS, timezone: null as unknown as string };
  let resolvedOptionsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshSettings.mockResolvedValue(undefined);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    }) as unknown as typeof fetch;

    resolvedOptionsSpy = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'America/Denver',
    } as Intl.ResolvedDateTimeFormatOptions);
  });

  afterEach(() => {
    resolvedOptionsSpy.mockRestore();
  });

  it('surfaces the browser-detected timezone as a suggestion when unset, and applies it only on explicit confirm', async () => {
    mockTenantSettings = UNSET_SETTINGS;
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const select = await screen.findByLabelText(/school timezone/i) as HTMLSelectElement;
    // Detection never auto-applies - the select still shows the ordinary
    // hardcoded fallback until the admin explicitly accepts the suggestion.
    expect(select.value).not.toBe('America/Denver');

    const suggestion = await screen.findByText(/suggested, based on your browser/i);
    expect(suggestion).toBeInTheDocument();

    const useButton = screen.getByRole('button', { name: /use this timezone/i });
    fireEvent.click(useButton);

    expect(select.value).toBe('America/Denver');
    // Accepting the suggestion is still just a form edit - it only takes
    // effect once the admin explicitly saves, same as any other field.
    fireEvent.click(screen.getByRole('button', { name: /save general settings/i }));
    await waitFor(() => {
      const putCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([, options]) => options?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
      const body = JSON.parse(putCall![1].body as string);
      expect(body.timezone).toBe('America/Denver');
    });
  });

  it('never shows the suggestion, and never overrides the stored value, when a timezone is already explicitly set', async () => {
    mockTenantSettings = MOCK_SETTINGS; // timezone: 'America/New_York', explicitly set
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const select = await screen.findByLabelText(/school timezone/i) as HTMLSelectElement;
    expect(select.value).toBe('America/New_York');

    expect(screen.queryByText(/suggested, based on your browser/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /use this timezone/i })).not.toBeInTheDocument();
  });
});
