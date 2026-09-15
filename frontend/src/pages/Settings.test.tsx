import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsPage } from './Settings';
import { tenantsApi, schedulingApi } from '@/api';

function renderSettingsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>
  );
}

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
  defaultDeClassroomCost: 150,
  defaultDeOnlineCost: 150,
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

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    tenantsApi: { ...actual.tenantsApi, updateSettings: vi.fn() },
    schedulingApi: { ...actual.schedulingApi, getSchedulingSettings: vi.fn(), updateSchedulingSettings: vi.fn() },
  };
});

// SettingsPage defaults to the Scheduling tab, whose own component fetches
// scheduling settings via schedulingApi on mount - every describe block
// below cares about a different tab, but this must always resolve or that
// unrelated query hangs pending underneath whichever tab is actually
// under test.
function mockSchedulingSettingsLoad() {
  vi.mocked(schedulingApi.getSchedulingSettings).mockResolvedValue({
    id: 'settings-1',
    tenantId: 'tenant-1',
    bufferTimeBetweenLessons: 30,
    bufferTimeBeforeFirstLesson: 0,
    bufferTimeAfterLastLesson: 0,
    minHoursAdvanceBooking: 24,
    maxDaysAdvanceBooking: 60,
    defaultLessonDuration: 120,
    defaultMaxStudentsPerDay: 3,
    lessonDurationTemplates: [],
    allowBackToBackLessons: false,
    defaultWorkStartTime: '07:00:00',
    defaultWorkEndTime: '20:00:00',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

afterEach(() => {
  cleanup();
});

// Regression coverage for item 8: tenant_settings.timezone was readable/
// writable through the API but had no UI surface - a school outside the
// hardcoded Pacific default had no way to correct it themselves.
describe('Settings - General tab timezone picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantSettings = MOCK_SETTINGS;
    mockRefreshSettings.mockResolvedValue(undefined);
    mockSchedulingSettingsLoad();
    vi.mocked(tenantsApi.updateSettings).mockResolvedValue({ success: true, data: {} as any });
  });

  it('renders the timezone select defaulted to the tenant\'s current value', async () => {
    renderSettingsPage();

    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const select = await screen.findByLabelText(/school timezone/i);
    expect((select as HTMLSelectElement).value).toBe('America/New_York');
  });

  it('submits the newly-selected timezone through the existing save path', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const select = await screen.findByLabelText(/school timezone/i);
    fireEvent.change(select, { target: { value: 'America/Phoenix' } });
    expect((select as HTMLSelectElement).value).toBe('America/Phoenix');

    fireEvent.click(screen.getByRole('button', { name: /save general settings/i }));

    await waitFor(() => {
      expect(tenantsApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ timezone: 'America/Phoenix' })
      );
    });
  });
});

describe('Settings - General tab default lesson cost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantSettings = MOCK_SETTINGS;
    mockRefreshSettings.mockResolvedValue(undefined);
    mockSchedulingSettingsLoad();
    vi.mocked(tenantsApi.updateSettings).mockResolvedValue({ success: true, data: {} as any });
  });

  it('renders the default lesson cost field defaulted to the tenant\'s current value', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const input = await screen.findByLabelText(/default lesson cost/i);
    expect((input as HTMLInputElement).value).toBe('150');
  });

  it('submits the newly-entered default lesson cost through the existing save path', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const input = await screen.findByLabelText(/default lesson cost/i);
    fireEvent.change(input, { target: { value: '175' } });
    expect((input as HTMLInputElement).value).toBe('175');

    fireEvent.click(screen.getByRole('button', { name: /save general settings/i }));

    await waitFor(() => {
      expect(tenantsApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ defaultLessonCost: 175 })
      );
    });
  });
});

// DE pricing: one flat course fee at enrollment, with separate
// classroom/online defaults - mirrors defaultLessonCost's exact
// prefill-then-editable pattern, just for the DE program instead of BTW.
describe('Settings - General tab DE course fee defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantSettings = MOCK_SETTINGS;
    mockRefreshSettings.mockResolvedValue(undefined);
    mockSchedulingSettingsLoad();
    vi.mocked(tenantsApi.updateSettings).mockResolvedValue({ success: true, data: {} as any });
  });

  it('renders both DE cost fields defaulted to the tenant\'s current values', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const classroomInput = await screen.findByLabelText(/default classroom driver education cost/i);
    const onlineInput = await screen.findByLabelText(/default online driver education cost/i);
    expect((classroomInput as HTMLInputElement).value).toBe('150');
    expect((onlineInput as HTMLInputElement).value).toBe('150');
  });

  it('submits newly-entered classroom and online DE costs independently through the existing save path', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const classroomInput = await screen.findByLabelText(/default classroom driver education cost/i);
    const onlineInput = await screen.findByLabelText(/default online driver education cost/i);
    fireEvent.change(classroomInput, { target: { value: '175' } });
    fireEvent.change(onlineInput, { target: { value: '125' } });

    fireEvent.click(screen.getByRole('button', { name: /save general settings/i }));

    await waitFor(() => {
      expect(tenantsApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ defaultDeClassroomCost: 175, defaultDeOnlineCost: 125 })
      );
    });
  });
});

// Phase 1 of the compliance-records arc (docs/compliance-records-build-plan.md):
// the DMV driving school license number, added to the existing School
// Identity box - not a new section, not a new save endpoint.
describe('Settings - General tab DMV license number', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantSettings = MOCK_SETTINGS;
    mockRefreshSettings.mockResolvedValue(undefined);
    mockSchedulingSettingsLoad();
    vi.mocked(tenantsApi.updateSettings).mockResolvedValue({ success: true, data: {} as any });
  });

  it('renders the license number field in the School Identity section, empty when unset', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const input = await screen.findByLabelText(/dmv driving school license number/i);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('submits the newly-entered license number through the existing save path', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const input = await screen.findByLabelText(/dmv driving school license number/i);
    fireEvent.change(input, { target: { value: 'E1234' } });
    expect((input as HTMLInputElement).value).toBe('E1234');

    fireEvent.click(screen.getByRole('button', { name: /save general settings/i }));

    await waitFor(() => {
      expect(tenantsApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ licenseNumber: 'E1234' })
      );
    });
  });

  it('pre-fills from an already-saved license number', async () => {
    mockTenantSettings = { ...MOCK_SETTINGS, licenseNumber: 'E9999' } as typeof MOCK_SETTINGS;
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const input = await screen.findByLabelText(/dmv driving school license number/i);
    expect((input as HTMLInputElement).value).toBe('E9999');
  });
});

describe('Settings - General tab max lessons per student per day', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantSettings = MOCK_SETTINGS;
    mockRefreshSettings.mockResolvedValue(undefined);
    mockSchedulingSettingsLoad();
    vi.mocked(tenantsApi.updateSettings).mockResolvedValue({ success: true, data: {} as any });
  });

  it('renders the max lessons per student per day field defaulted to the tenant\'s current value', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const input = await screen.findByLabelText(/max lessons per student per day/i);
    expect((input as HTMLInputElement).value).toBe('1');
  });

  it('submits the newly-entered max lessons per student per day through the existing save path', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const input = await screen.findByLabelText(/max lessons per student per day/i);
    fireEvent.change(input, { target: { value: '2' } });
    expect((input as HTMLInputElement).value).toBe('2');

    fireEvent.click(screen.getByRole('button', { name: /save general settings/i }));

    await waitFor(() => {
      expect(tenantsApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ maxLessonsPerStudentPerDay: 2 })
      );
    });
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
    mockSchedulingSettingsLoad();
    vi.mocked(tenantsApi.updateSettings).mockResolvedValue({ success: true, data: {} as any });
  });

  it('shows the matching quick-select as active when defaultHoursRequired arrives as a numeric string', async () => {
    mockTenantSettings = { ...MOCK_SETTINGS, defaultHoursRequired: '8.00' as unknown as number };
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const activeButton = await screen.findByRole('button', { name: '8h' });
    expect(activeButton.className).toContain('bg-primary');
  });

  it('shows the matching quick-select as active when standardLessonLengthMinutes arrives as a numeric string', async () => {
    mockTenantSettings = { ...MOCK_SETTINGS, standardLessonLengthMinutes: '90.00' as unknown as number };
    renderSettingsPage();
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
    mockSchedulingSettingsLoad();
    vi.mocked(tenantsApi.updateSettings).mockResolvedValue({ success: true, data: {} as any });

    resolvedOptionsSpy = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'America/Denver',
    } as Intl.ResolvedDateTimeFormatOptions);
  });

  afterEach(() => {
    resolvedOptionsSpy.mockRestore();
  });

  it('surfaces the browser-detected timezone as a suggestion when unset, and applies it only on explicit confirm', async () => {
    mockTenantSettings = UNSET_SETTINGS;
    renderSettingsPage();
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
      expect(tenantsApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ timezone: 'America/Denver' })
      );
    });
  });

  it('never shows the suggestion, and never overrides the stored value, when a timezone is already explicitly set', async () => {
    mockTenantSettings = MOCK_SETTINGS; // timezone: 'America/New_York', explicitly set
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const select = await screen.findByLabelText(/school timezone/i) as HTMLSelectElement;
    expect(select.value).toBe('America/New_York');

    expect(screen.queryByText(/suggested, based on your browser/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /use this timezone/i })).not.toBeInTheDocument();
  });
});

// Accessibility follow-up flagged during Phase 1 (compliance-records arc):
// School Identity/Contact/Address inputs had no htmlFor/id association -
// labels weren't programmatically tied to their controls, so screen
// readers and getByLabelText couldn't associate them. Fixed across every
// real input/select in General Settings and Logo URL in Branding; the two
// button-group-only controls (Lesson Completion Mode, Who Collects the
// Fee) use role="group" + aria-labelledby instead, the correct pattern
// for a group of buttons rather than htmlFor pointing at nothing.
describe('Settings - General tab label association (accessibility)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantSettings = MOCK_SETTINGS;
    mockRefreshSettings.mockResolvedValue(undefined);
    mockSchedulingSettingsLoad();
    vi.mocked(tenantsApi.updateSettings).mockResolvedValue({ success: true, data: {} as any });
  });

  it('every School Identity / Contact Information / Physical Address field is reachable via its label', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    for (const labelText of [
      /^school name/i,
      /tagline/i,
      /^phone/i,
      /^email/i,
      /^website/i,
      /street address/i,
      /suite \/ unit/i,
      /^city/i,
      /^state/i,
      /zip code/i,
    ]) {
      expect(await screen.findByLabelText(labelText)).toBeInTheDocument();
    }
  });

  it('Default Hours Required and Standard Lesson Length are reachable via their labels', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    expect(await screen.findByLabelText(/default hours required per student/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/standard lesson length/i)).toBeInTheDocument();
  });

  it('Lesson Completion Mode renders as a named, accessible button group with pressed state', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const group = await screen.findByRole('group', { name: /lesson completion mode/i });
    const manual = within(group).getByRole('button', { name: /manual/i });
    const auto = within(group).getByRole('button', { name: /auto/i });

    expect(manual).toHaveAttribute('aria-pressed', 'true');
    expect(auto).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(auto);
    expect(auto).toHaveAttribute('aria-pressed', 'true');
    expect(manual).toHaveAttribute('aria-pressed', 'false');
  });

  it('Who Collects the Fee renders as a named, accessible button group with pressed state', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const group = await screen.findByRole('group', { name: /who collects the fee/i });
    const instructor = within(group).getByRole('button', { name: /instructor/i });
    const school = within(group).getByRole('button', { name: /^school/i });

    expect(instructor).toHaveAttribute('aria-pressed', 'true');
    expect(school).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(school);
    expect(school).toHaveAttribute('aria-pressed', 'true');
    expect(instructor).toHaveAttribute('aria-pressed', 'false');
  });

  it('quick-select pill buttons for numeric fields announce pressed state', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /general/i }));

    const sixHours = await screen.findByRole('button', { name: '6h ⭐' });
    expect(sixHours).toHaveAttribute('aria-pressed', 'true');

    const eightHours = screen.getByRole('button', { name: '8h' });
    expect(eightHours).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(eightHours);
    expect(eightHours).toHaveAttribute('aria-pressed', 'true');
    expect(sixHours).toHaveAttribute('aria-pressed', 'false');
  });
});

// Same fix, Branding tab.
describe('Settings - Branding tab label association (accessibility)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantSettings = MOCK_SETTINGS;
    mockRefreshSettings.mockResolvedValue(undefined);
    mockSchedulingSettingsLoad();
    vi.mocked(tenantsApi.updateSettings).mockResolvedValue({ success: true, data: {} as any });
  });

  it('Logo URL is reachable via its label', async () => {
    renderSettingsPage();
    fireEvent.click(screen.getByRole('button', { name: /branding/i }));

    expect(await screen.findByLabelText(/logo url/i)).toBeInTheDocument();
  });
});

// Regression coverage for the actual reported production bug: Settings.tsx
// hardcoded API_BASE = 'http://127.0.0.1:4000/api/v1' instead of using the
// environment-aware apiClient every other page uses, so every Save button
// on this page silently tried to reach the developer's own localhost in
// production and failed with no real request ever reaching the backend.
// Fixed by migrating every sub-tab to schedulingApi/tenantsApi + TanStack
// Query - these tests confirm the Scheduling tab specifically, since it's
// the tab the bug was originally reported against (buffer time showing 15
// instead of a saved 30).
describe('Settings - Scheduling tab (capacity-based scheduling)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantSettings = MOCK_SETTINGS;
    mockRefreshSettings.mockResolvedValue(undefined);
  });

  it('loads and displays the real buffer time via schedulingApi, not a hardcoded default', async () => {
    vi.mocked(schedulingApi.getSchedulingSettings).mockResolvedValue({
      id: 'settings-1',
      tenantId: 'tenant-1',
      bufferTimeBetweenLessons: 45,
      bufferTimeBeforeFirstLesson: 0,
      bufferTimeAfterLastLesson: 0,
      minHoursAdvanceBooking: 24,
      maxDaysAdvanceBooking: 60,
      defaultLessonDuration: 120,
      defaultMaxStudentsPerDay: 3,
      lessonDurationTemplates: [],
      allowBackToBackLessons: false,
      defaultWorkStartTime: '07:00:00',
      defaultWorkEndTime: '20:00:00',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    renderSettingsPage(); // defaults to the Scheduling tab

    const bufferInput = await screen.findByLabelText(/buffer time between lessons/i) as HTMLInputElement;
    expect(bufferInput.value).toBe('45');
  });

  it('saves a changed buffer time through schedulingApi.updateSchedulingSettings, not a raw fetch to localhost', async () => {
    mockSchedulingSettingsLoad(); // starts at 30
    vi.mocked(schedulingApi.updateSchedulingSettings).mockResolvedValue({} as any);

    renderSettingsPage();

    const bufferInput = await screen.findByLabelText(/buffer time between lessons/i) as HTMLInputElement;
    expect(bufferInput.value).toBe('30');

    fireEvent.click(screen.getByRole('button', { name: /^45 min$/i }));
    expect(bufferInput.value).toBe('45');

    fireEvent.click(screen.getByRole('button', { name: /save scheduling settings/i }));

    await waitFor(() => {
      expect(schedulingApi.updateSchedulingSettings).toHaveBeenCalledWith(
        expect.objectContaining({ bufferTimeBetweenLessons: 45 })
      );
    });
    expect(await screen.findByText(/scheduling settings saved successfully/i)).toBeInTheDocument();
  });

  it('shows a real error message (not silence) when the save request fails', async () => {
    mockSchedulingSettingsLoad();
    const error = Object.assign(new Error('request failed'), {
      response: { data: { error: 'Scheduling settings not found' } },
    });
    vi.mocked(schedulingApi.updateSchedulingSettings).mockRejectedValue(error);

    renderSettingsPage();
    await screen.findByLabelText(/buffer time between lessons/i);

    fireEvent.click(screen.getByRole('button', { name: /save scheduling settings/i }));

    expect(await screen.findByText(/scheduling settings not found/i)).toBeInTheDocument();
  });
});
