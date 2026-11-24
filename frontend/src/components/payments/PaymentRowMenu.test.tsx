import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PaymentRowMenu } from './PaymentRowMenu';

afterEach(cleanup);

describe('PaymentRowMenu', () => {
  it('always shows "Print receipt", calling the handler on click', () => {
    const onPrintReceipt = vi.fn();
    render(<PaymentRowMenu onPrintReceipt={onPrintReceipt} />);

    fireEvent.click(screen.getByRole('button', { name: /payment actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /print receipt/i }));

    expect(onPrintReceipt).toHaveBeenCalledTimes(1);
  });

  it('omits Refund and Void entirely when their handlers are not provided', () => {
    render(<PaymentRowMenu onPrintReceipt={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /payment actions/i }));

    expect(screen.queryByRole('button', { name: /refund/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /void/i })).not.toBeInTheDocument();
  });

  it('shows Refund and Void when provided, and calls the right handler', () => {
    const onRefund = vi.fn();
    const onVoid = vi.fn();
    render(<PaymentRowMenu onPrintReceipt={vi.fn()} onRefund={onRefund} onVoid={onVoid} />);
    fireEvent.click(screen.getByRole('button', { name: /payment actions/i }));

    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    expect(onRefund).toHaveBeenCalledTimes(1);
    expect(onVoid).not.toHaveBeenCalled();
  });

  it('closes the menu after selecting an action', () => {
    render(<PaymentRowMenu onPrintReceipt={vi.fn()} onRefund={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /payment actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));

    expect(screen.queryByRole('button', { name: /print receipt/i })).not.toBeInTheDocument();
  });

  it('closes the menu on an outside click', () => {
    render(
      <div>
        <PaymentRowMenu onPrintReceipt={vi.fn()} />
        <button type="button">Outside</button>
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: /payment actions/i }));
    expect(screen.getByRole('button', { name: /print receipt/i })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('button', { name: /outside/i }));
    expect(screen.queryByRole('button', { name: /print receipt/i })).not.toBeInTheDocument();
  });
});
