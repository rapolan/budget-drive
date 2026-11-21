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
  //
  // Uses real userEvent.type (dispatches actual keydown/keypress/input
  // sequences through the DOM) rather than fireEvent.change (which skips
  // straight to a single synthetic "input" event) - closer to what a real
  // browser does character-by-character, per the live-reproduction
  // standard: a user reported this "not working" in a real browser, and a
  // test suite that only ever synthesizes the end-state change event
  // can't catch a bug that only shows up across a real keystroke sequence.
  describe('phone field formatting', () => {
    it('formats progressively while typing digit by digit via real keystrokes', async () => {
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      render(<StepSchoolDetails onContinue={vi.fn()} />);
      const phoneInput = getInputByLabel(/^Phone$/i);

      await user.type(phoneInput, '6');
      expect(phoneInput).toHaveValue('(6');

      await user.type(phoneInput, '19');
      expect(phoneInput).toHaveValue('(619');

      await user.type(phoneInput, '555');
      expect(phoneInput).toHaveValue('(619) 555');

      await user.type(phoneInput, '0142');
      expect(phoneInput).toHaveValue('(619) 555-0142');
    });

    it('formats a pasted raw digit string in one go', async () => {
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      render(<StepSchoolDetails onContinue={vi.fn()} />);
      const phoneInput = getInputByLabel(/^Phone$/i);

      await user.click(phoneInput);
      await user.paste('6195550142');

      expect(phoneInput).toHaveValue('(619) 555-0142');
    });

    it('formats a paste with punctuation/spacing already in it (e.g. "619-555-0142")', async () => {
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      render(<StepSchoolDetails onContinue={vi.fn()} />);
      const phoneInput = getInputByLabel(/^Phone$/i);

      await user.click(phoneInput);
      await user.paste('619-555-0142');

      expect(phoneInput).toHaveValue('(619) 555-0142');
    });

    it('caps at 10 digits - a pasted longer string (e.g. with a leading 1) is truncated, not rejected', async () => {
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      render(<StepSchoolDetails onContinue={vi.fn()} />);
      const phoneInput = getInputByLabel(/^Phone$/i);

      await user.click(phoneInput);
      await user.paste('16195550142');

      expect(phoneInput).toHaveValue('(161) 955-5014');
    });

    it('reformats correctly after backspacing past a formatting character', async () => {
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      render(<StepSchoolDetails onContinue={vi.fn()} />);
      const phoneInput = getInputByLabel(/^Phone$/i);

      await user.click(phoneInput);
      await user.paste('6195550142');
      expect(phoneInput).toHaveValue('(619) 555-0142');

      // Backspace one real character at a time off the end.
      await user.keyboard('{Backspace}');
      expect(phoneInput).toHaveValue('(619) 555-014');

      // Backspacing all the way down to nothing clears the field cleanly.
      await user.clear(phoneInput);
      expect(phoneInput).toHaveValue('');
    });

    it('formats the initial value from existing settings (not left raw)', () => {
      mockSettings = { supportPhone: '6195550142' };
      render(<StepSchoolDetails onContinue={vi.fn()} />);
      const phoneInput = getInputByLabel(/^Phone$/i);

      expect(phoneInput).toHaveValue('(619) 555-0142');
    });

    it('reformats on blur as a defensive safety net (e.g. after autofill)', () => {
      render(<StepSchoolDetails onContinue={vi.fn()} />);
      const phoneInput = getInputByLabel(/^Phone$/i);

      // Simulates a browser autofill or other direct-value-set path that
      // still fires a change/blur sequence but might not have gone
      // through the normal onChange formatting - onBlur re-derives from
      // whatever the input's current raw value actually is.
      fireEvent.change(phoneInput, { target: { value: '6195550142' } });
      fireEvent.blur(phoneInput);
      expect(phoneInput).toHaveValue('(619) 555-0142');
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
    mockSettings = { supportPhone: '6195559999', addressLine1: '99 Oak Ave', city: 'Shelbyville' };

    render(<StepSchoolDetails onContinue={vi.fn()} />);

    expect(getInputByLabel(/^Phone$/i)).toHaveValue('(619) 555-9999');
    expect(getInputByLabel(/^Address line 1$/i)).toHaveValue('99 Oak Ave');
    expect(getInputByLabel(/^City$/i)).toHaveValue('Shelbyville');
  });
});
