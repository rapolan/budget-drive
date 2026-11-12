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

// GlassInput/GlassSelect properly associate label <-> input via htmlFor/id,
// so plain getByLabelText resolves correctly.
function getInputByLabel(labelPattern: RegExp): HTMLElement {
  return screen.getByLabelText(labelPattern);
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

    fireEvent.change(getInputByLabel(/^Phone$/i), { target: { value: '6195550142' } });
    fireEvent.change(getInputByLabel(/^Address line 1$/i), { target: { value: '123 Main St' } });
    fireEvent.change(getInputByLabel(/^City$/i), { target: { value: 'Springfield' } });

    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    await waitFor(() => expect(tenantsApi.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ supportPhone: '(619) 555-0142', addressLine1: '123 Main St', city: 'Springfield' })
    ));
    await waitFor(() => expect(mockRefreshSettings).toHaveBeenCalled());
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });

  // Regression coverage: this field previously stored whatever raw text
  // was typed, with no formatting - reusing utils/phoneFormat.ts (already
  // used by StudentModal, InstructorModal, GuardianModal, MyProfile) so
  // this field formats and stores exactly like every other phone field in
  // the app: progressively, as "(XXX) XXX-XXXX", via the same
  // onChange={(e) => setX(formatPhoneNumber(e.target.value))} pattern.
  describe('phone field formatting', () => {
    it('formats progressively while typing digit by digit', () => {
      render(<StepSchoolDetails onContinue={vi.fn()} />);
      const phoneInput = getInputByLabel(/^Phone$/i);

      fireEvent.change(phoneInput, { target: { value: '6' } });
      expect(phoneInput).toHaveValue('(6');

      fireEvent.change(phoneInput, { target: { value: '(619' } });
      expect(phoneInput).toHaveValue('(619');

      fireEvent.change(phoneInput, { target: { value: '(619) 555' } });
      expect(phoneInput).toHaveValue('(619) 555');

      fireEvent.change(phoneInput, { target: { value: '(619) 555-0142' } });
      expect(phoneInput).toHaveValue('(619) 555-0142');
    });

    it('formats a pasted raw digit string in one go', () => {
      render(<StepSchoolDetails onContinue={vi.fn()} />);
      const phoneInput = getInputByLabel(/^Phone$/i);

      // Simulates a paste: the browser delivers the full new value in a
      // single change event, same as typing it would, just all at once.
      fireEvent.change(phoneInput, { target: { value: '6195550142' } });

      expect(phoneInput).toHaveValue('(619) 555-0142');
    });

    it('caps at 10 digits - a pasted longer string (e.g. with a leading 1) is truncated, not rejected', () => {
      render(<StepSchoolDetails onContinue={vi.fn()} />);
      const phoneInput = getInputByLabel(/^Phone$/i);

      fireEvent.change(phoneInput, { target: { value: '16195550142' } });

      expect(phoneInput).toHaveValue('(161) 955-5014');
    });

    it('reformats correctly after backspacing past a formatting character', () => {
      render(<StepSchoolDetails onContinue={vi.fn()} />);
      const phoneInput = getInputByLabel(/^Phone$/i);

      fireEvent.change(phoneInput, { target: { value: '(619) 555-0142' } });
      expect(phoneInput).toHaveValue('(619) 555-0142');

      // Backspacing one character off the full value, as the browser
      // would deliver it mid-edit - the formatter re-derives from the
      // remaining digits rather than requiring any particular shape.
      fireEvent.change(phoneInput, { target: { value: '(619) 555-014' } });
      expect(phoneInput).toHaveValue('(619) 555-014');

      // Backspacing all the way down to nothing clears the field cleanly.
      fireEvent.change(phoneInput, { target: { value: '' } });
      expect(phoneInput).toHaveValue('');
    });
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
