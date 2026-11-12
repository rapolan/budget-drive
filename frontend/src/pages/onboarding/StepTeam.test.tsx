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
    fireEvent.change(getInputByLabel(/^Phone$/i), { target: { value: '555-0000' } });
    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    await waitFor(() => expect(instructorsApi.create).toHaveBeenCalledWith({
      fullName: 'John Doe',
      email: 'john@example.com',
      phone: '555-0000',
    }));
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });

  it('calls onSkip directly when Skip for now is clicked', () => {
    const onSkip = vi.fn();
    render(<StepTeam onContinue={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(screen.getByRole('button', { name: /Skip for now/i }));

    expect(onSkip).toHaveBeenCalled();
    expect(instructorsApi.create).not.toHaveBeenCalled();
  });
});
