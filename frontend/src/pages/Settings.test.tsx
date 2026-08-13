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
  timezone: 'America/New_York',
};
const MOCK_TENANT = { name: 'Test Driving School' };
const mockUpdateTheme = vi.fn();

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    settings: MOCK_SETTINGS,
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
