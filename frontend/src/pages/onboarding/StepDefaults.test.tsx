import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { StepDefaults } from './StepDefaults';
import { tenantsApi, schedulingApi } from '@/api';

vi.mock('@/api', () => ({
  tenantsApi: { updateSettings: vi.fn() },
  schedulingApi: { updateSchedulingSettings: vi.fn() },
}));

const mockRefreshSettings = vi.fn();
let mockSettings: any = null;

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ settings: mockSettings, refreshSettings: mockRefreshSettings }),
}));

afterEach(cleanup);

// The real component uses <label> text without htmlFor/id association, so
// getByLabelText can't resolve it - find the label's sibling input instead.
function getInputByLabel(labelPattern: RegExp): HTMLElement {
  const label = screen.getByText(labelPattern);
  const input = label.parentElement?.querySelector('input, select');
  if (!input) throw new Error(`No input/select found next to label matching ${labelPattern}`);
  return input as HTMLElement;
}

describe('StepDefaults', () => {
  beforeEach(() => {
    vi.mocked(tenantsApi.updateSettings).mockReset();
    vi.mocked(schedulingApi.updateSchedulingSettings).mockReset();
    mockRefreshSettings.mockReset();
    mockSettings = null;
  });

  it('does not render the classroom price field when Driver Education is disabled', () => {
    render(<StepDefaults driverEducationEnabled={false} onContinue={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.queryByText(/classroom course price/i)).not.toBeInTheDocument();
  });

  it('renders and saves the classroom price field when Driver Education is enabled', async () => {
    vi.mocked(tenantsApi.updateSettings).mockResolvedValue({ success: true, data: {} } as any);
    vi.mocked(schedulingApi.updateSchedulingSettings).mockResolvedValue({ success: true, data: {} } as any);
    mockRefreshSettings.mockResolvedValue(undefined);
    const onContinue = vi.fn();

    render(<StepDefaults driverEducationEnabled={true} onContinue={onContinue} onSkip={vi.fn()} />);

    fireEvent.change(getInputByLabel(/classroom course price/i), { target: { value: '199' } });
    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    await waitFor(() => expect(tenantsApi.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultDeClassroomCost: 199 })
    ));
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });

  it('makes two separate API calls - tenant settings and scheduling settings', async () => {
    vi.mocked(tenantsApi.updateSettings).mockResolvedValue({ success: true, data: {} } as any);
    vi.mocked(schedulingApi.updateSchedulingSettings).mockResolvedValue({ success: true, data: {} } as any);
    mockRefreshSettings.mockResolvedValue(undefined);

    render(<StepDefaults driverEducationEnabled={false} onContinue={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    await waitFor(() => expect(tenantsApi.updateSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(schedulingApi.updateSchedulingSettings).toHaveBeenCalledTimes(1));
  });

  it('calls onSkip directly without saving when Skip for now is clicked', () => {
    const onSkip = vi.fn();
    render(<StepDefaults driverEducationEnabled={false} onContinue={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(screen.getByRole('button', { name: /Skip for now/i }));

    expect(onSkip).toHaveBeenCalled();
    expect(tenantsApi.updateSettings).not.toHaveBeenCalled();
  });
});
