import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { StepSchoolDetails } from './StepSchoolDetails';
import { tenantsApi } from '@/api';

vi.mock('@/api', () => ({
  tenantsApi: { updateSettings: vi.fn() },
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

describe('StepSchoolDetails', () => {
  beforeEach(() => {
    vi.mocked(tenantsApi.updateSettings).mockReset();
    mockRefreshSettings.mockReset();
    mockSettings = null;
  });

  it('saves the entered fields, refreshes settings, then continues', async () => {
    vi.mocked(tenantsApi.updateSettings).mockResolvedValue({ success: true, data: {} } as any);
    mockRefreshSettings.mockResolvedValue(undefined);
    const onContinue = vi.fn();

    render(<StepSchoolDetails onContinue={onContinue} />);

    fireEvent.change(getInputByLabel(/^Phone$/i), { target: { value: '555-1234' } });
    fireEvent.change(getInputByLabel(/^Address line 1$/i), { target: { value: '123 Main St' } });
    fireEvent.change(getInputByLabel(/^City$/i), { target: { value: 'Springfield' } });

    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    await waitFor(() => expect(tenantsApi.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ supportPhone: '555-1234', addressLine1: '123 Main St', city: 'Springfield' })
    ));
    await waitFor(() => expect(mockRefreshSettings).toHaveBeenCalled());
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });

  it('shows an error and does not continue when the save fails', async () => {
    vi.mocked(tenantsApi.updateSettings).mockRejectedValue({ response: { data: { error: 'Server exploded' } } });
    const onContinue = vi.fn();

    render(<StepSchoolDetails onContinue={onContinue} />);
    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    await waitFor(() => expect(screen.getByText('Server exploded')).toBeInTheDocument());
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('pre-fills fields from existing settings', () => {
    mockSettings = { supportPhone: '555-9999', addressLine1: '99 Oak Ave', city: 'Shelbyville' };

    render(<StepSchoolDetails onContinue={vi.fn()} />);

    expect(getInputByLabel(/^Phone$/i)).toHaveValue('555-9999');
    expect(getInputByLabel(/^Address line 1$/i)).toHaveValue('99 Oak Ave');
    expect(getInputByLabel(/^City$/i)).toHaveValue('Shelbyville');
  });
});
