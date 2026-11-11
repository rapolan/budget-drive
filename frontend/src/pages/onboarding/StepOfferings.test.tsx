import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { StepOfferings } from './StepOfferings';
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

describe('StepOfferings', () => {
  beforeEach(() => {
    vi.mocked(tenantsApi.updateSettings).mockReset();
    mockRefreshSettings.mockReset();
    mockSettings = null;
  });

  it('defaults both toggles off and saves false/false when left untouched', async () => {
    vi.mocked(tenantsApi.updateSettings).mockResolvedValue({ success: true, data: {} } as any);
    mockRefreshSettings.mockResolvedValue(undefined);
    const onContinue = vi.fn();

    render(<StepOfferings onContinue={onContinue} />);

    const switches = screen.getAllByRole('switch');
    switches.forEach((sw) => expect(sw).toHaveAttribute('aria-checked', 'false'));
    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    await waitFor(() => expect(tenantsApi.updateSettings).toHaveBeenCalledWith({
      enableDriverEducation: false,
      enableCertificates: false,
    }));
    await waitFor(() => expect(onContinue).toHaveBeenCalledWith(false));
  });

  it('enabling Driver Education saves true and passes true to onContinue', async () => {
    vi.mocked(tenantsApi.updateSettings).mockResolvedValue({ success: true, data: {} } as any);
    mockRefreshSettings.mockResolvedValue(undefined);
    const onContinue = vi.fn();

    render(<StepOfferings onContinue={onContinue} />);

    const switches = screen.getAllByRole('switch');
    // First switch is Driver Education, second is Certificates.
    fireEvent.click(switches[0]);
    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    await waitFor(() => expect(tenantsApi.updateSettings).toHaveBeenCalledWith({
      enableDriverEducation: true,
      enableCertificates: false,
    }));
    await waitFor(() => expect(mockRefreshSettings).toHaveBeenCalled());
    await waitFor(() => expect(onContinue).toHaveBeenCalledWith(true));
  });

  it('shows an error and does not continue when the save fails', async () => {
    vi.mocked(tenantsApi.updateSettings).mockRejectedValue({ response: { data: { error: 'nope' } } });
    const onContinue = vi.fn();

    render(<StepOfferings onContinue={onContinue} />);
    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());
    expect(onContinue).not.toHaveBeenCalled();
  });
});
