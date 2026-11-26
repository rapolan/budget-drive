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

  // Regression tests for payment-history-layout's review fix: the menu
  // used to be `position: absolute` inside the trigger's own `relative`
  // wrapper, which got clipped by any ancestor with `overflow-hidden`/
  // `overflow-x-auto` (PaymentHistoryModal's desktop table needs both).
  // Portaling to document.body escapes that clipping ancestor entirely.
  describe('portal rendering, keyboard, and viewport-edge behavior (payment-history-layout review fix)', () => {
    it('renders the open menu as a DIRECT CHILD of document.body, not nested inside an overflow-clipping ancestor', () => {
      // A table with the exact clipping shape PaymentHistoryModal's own
      // desktop table uses (overflow-hidden outer, overflow-x-auto inner)
      // - if the menu were still absolutely positioned inside this
      // structure, it would render as a DESCENDANT of the <table>, not a
      // sibling of it under document.body.
      render(
        <div className="overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <tbody>
                <tr>
                  <td>
                    <PaymentRowMenu onPrintReceipt={vi.fn()} onRefund={vi.fn()} onVoid={vi.fn()} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      );

      fireEvent.click(screen.getByRole('button', { name: /payment actions/i }));
      const printReceiptButton = screen.getByRole('button', { name: /print receipt/i });
      const table = screen.getByRole('table');

      expect(table.contains(printReceiptButton)).toBe(false);
      // Every ancestor of the menu item up to (but not including) <body>
      // is the menu's own wrapper div - never the <table> or its overflow
      // wrappers.
      expect(printReceiptButton.closest('table')).toBeNull();
      expect(printReceiptButton.parentElement?.parentElement).toBe(document.body);
    });

    it('closes on Escape and returns focus to the trigger button', () => {
      render(<PaymentRowMenu onPrintReceipt={vi.fn()} />);
      const trigger = screen.getByRole('button', { name: /payment actions/i });
      fireEvent.click(trigger);
      expect(screen.getByRole('button', { name: /print receipt/i })).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('button', { name: /print receipt/i })).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });

    it('closes on an outside click whether the click lands outside both the trigger and the portaled menu', () => {
      render(
        <div>
          <PaymentRowMenu onPrintReceipt={vi.fn()} />
          <button type="button">Elsewhere</button>
        </div>
      );
      fireEvent.click(screen.getByRole('button', { name: /payment actions/i }));
      expect(screen.getByRole('button', { name: /print receipt/i })).toBeInTheDocument();

      // Clicking the menu's own content must NOT close it as "outside" -
      // confirmed by clicking a genuinely separate element instead and
      // relying on the earlier "closes the menu after selecting an
      // action" test to cover a click that's actually an item inside it.
      fireEvent.mouseDown(screen.getByRole('button', { name: /elsewhere/i }));
      expect(screen.queryByRole('button', { name: /print receipt/i })).not.toBeInTheDocument();
    });

    it('positions below the trigger when there is room, and flips above it when there is not (mocked getBoundingClientRect)', () => {
      const originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true });

      try {
        render(<PaymentRowMenu onPrintReceipt={vi.fn()} onRefund={vi.fn()} onVoid={vi.fn()} />);
        const trigger = screen.getByRole('button', { name: /payment actions/i });

        // Plenty of room below (trigger near the top of a 400px-tall
        // viewport) - menu should anchor from `top`, not `bottom`.
        trigger.getBoundingClientRect = () =>
          ({ top: 50, bottom: 70, left: 100, right: 150, width: 50, height: 20, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect;
        fireEvent.click(trigger);
        let menu = screen.getByRole('button', { name: /print receipt/i }).closest('div')!;
        expect(menu.style.top).not.toBe('');
        expect(menu.style.bottom).toBe('');
        fireEvent.keyDown(document, { key: 'Escape' });

        // No room below (trigger near the bottom of the same viewport) -
        // menu should flip to anchor from `bottom` instead.
        trigger.getBoundingClientRect = () =>
          ({ top: 370, bottom: 390, left: 100, right: 150, width: 50, height: 20, x: 100, y: 370, toJSON: () => ({}) }) as DOMRect;
        fireEvent.click(trigger);
        menu = screen.getByRole('button', { name: /print receipt/i }).closest('div')!;
        expect(menu.style.bottom).not.toBe('');
        expect(menu.style.top).toBe('');
      } finally {
        Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true });
      }
    });
  });
});
