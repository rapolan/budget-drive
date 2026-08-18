import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StatusMenu } from './StatusMenu';

afterEach(cleanup);

describe('StatusMenu', () => {
  it('opens the menu when the trigger is clicked and closes after an action', () => {
    const onComplete = vi.fn();
    const onNoShow = vi.fn();
    const onCancel = vi.fn();

    render(
      <StatusMenu
        trigger={<span>Scheduled</span>}
        onComplete={onComplete}
        onNoShow={onNoShow}
        onCancel={onCancel}
      />
    );

    expect(screen.queryByText('Completed')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Scheduled'));

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('No-show')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Completed'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onNoShow).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('calls onNoShow and onCancel for their respective menu items', () => {
    const onComplete = vi.fn();
    const onNoShow = vi.fn();
    const onCancel = vi.fn();

    render(
      <StatusMenu
        trigger={<span>Scheduled</span>}
        onComplete={onComplete}
        onNoShow={onNoShow}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByText('Scheduled'));
    fireEvent.click(screen.getByText('No-show'));
    expect(onNoShow).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Scheduled'));
    fireEvent.click(screen.getByText('Cancelled'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not open when disabled', () => {
    render(
      <StatusMenu
        trigger={<span>Scheduled</span>}
        disabled
        onComplete={vi.fn()}
        onNoShow={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Scheduled'));
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('closes when clicking outside the menu', () => {
    render(
      <div>
        <StatusMenu
          trigger={<span>Scheduled</span>}
          onComplete={vi.fn()}
          onNoShow={vi.fn()}
          onCancel={vi.fn()}
        />
        <div data-testid="outside">Outside</div>
      </div>
    );

    fireEvent.click(screen.getByText('Scheduled'));
    expect(screen.getByText('Completed')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it("clicking the trigger stops propagation so it doesn't also trigger a parent row's onClick", () => {
    const parentClick = vi.fn();

    render(
      <div onClick={parentClick}>
        <StatusMenu
          trigger={<span>Scheduled</span>}
          onComplete={vi.fn()}
          onNoShow={vi.fn()}
          onCancel={vi.fn()}
        />
      </div>
    );

    fireEvent.click(screen.getByText('Scheduled'));
    expect(parentClick).not.toHaveBeenCalled();
  });
});
