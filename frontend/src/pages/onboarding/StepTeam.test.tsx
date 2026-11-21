import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { StepTeam } from './StepTeam';
import { instructorsApi } from '@/api';

vi.mock('@/api', () => ({
  instructorsApi: { create: vi.fn() },
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

describe('StepTeam', () => {
  beforeEach(() => {
    vi.mocked(instructorsApi.create).mockReset();
  });

  it('treats an entirely empty form as an implicit skip', () => {
    const onContinue = vi.fn();
    render(<StepTeam onContinue={onContinue} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    expect(onContinue).toHaveBeenCalled();
    expect(instructorsApi.create).not.toHaveBeenCalled();
  });

  it('shows a validation error when only some fields are filled', async () => {
    const onContinue = vi.fn();
    render(<StepTeam onContinue={onContinue} onSkip={vi.fn()} />);

    fireEvent.change(getInputByLabel(/^Full name$/i), { target: { value: 'John Doe' } });
    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    await waitFor(() => expect(screen.getByText(/all required/i)).toBeInTheDocument());
    expect(onContinue).not.toHaveBeenCalled();
    expect(instructorsApi.create).not.toHaveBeenCalled();
  });

  it('creates the instructor when all fields are filled, then continues', async () => {
    vi.mocked(instructorsApi.create).mockResolvedValue({ success: true, data: {} } as any);
    const onContinue = vi.fn();

    render(<StepTeam onContinue={onContinue} onSkip={vi.fn()} />);

    fireEvent.change(getInputByLabel(/^Full name$/i), { target: { value: 'John Doe' } });
    fireEvent.change(getInputByLabel(/^Email$/i), { target: { value: 'john@example.com' } });
    fireEvent.change(getInputByLabel(/^Phone$/i), { target: { value: '6195550000' } });
    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    await waitFor(() => expect(instructorsApi.create).toHaveBeenCalledWith({
      fullName: 'John Doe',
      email: 'john@example.com',
      phone: '(619) 555-0000',
    }));
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });

  // Regression coverage: this field previously stored whatever raw text
  // was typed, with no formatting - now reuses utils/phoneFormat.ts, same
  // as StepSchoolDetails.tsx's phone field. Uses real userEvent.type/paste
  // (actual DOM keystroke/clipboard events), not fireEvent.change, per the
  // live-reproduction standard for this bug class.
  describe('phone field formatting', () => {
    it('formats progressively while typing digit by digit via real keystrokes', async () => {
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      render(<StepTeam onContinue={vi.fn()} onSkip={vi.fn()} />);
      const phoneInput = getInputByLabel(/^Phone$/i);

      await user.type(phoneInput, '6195550000');
      expect(phoneInput).toHaveValue('(619) 555-0000');
    });

    it('formats a pasted raw digit string in one go', async () => {
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      render(<StepTeam onContinue={vi.fn()} onSkip={vi.fn()} />);
      const phoneInput = getInputByLabel(/^Phone$/i);

      await user.click(phoneInput);
      await user.paste('6195550000');
      expect(phoneInput).toHaveValue('(619) 555-0000');
    });

    it('reformats on blur as a defensive safety net', () => {
      render(<StepTeam onContinue={vi.fn()} onSkip={vi.fn()} />);
      const phoneInput = getInputByLabel(/^Phone$/i);

      fireEvent.change(phoneInput, { target: { value: '6195550000' } });
      fireEvent.blur(phoneInput);
      expect(phoneInput).toHaveValue('(619) 555-0000');
    });
  });

  it('calls onSkip directly when Skip for now is clicked', () => {
    const onSkip = vi.fn();
    render(<StepTeam onContinue={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(screen.getByRole('button', { name: /Skip for now/i }));

    expect(onSkip).toHaveBeenCalled();
    expect(instructorsApi.create).not.toHaveBeenCalled();
  });
});
