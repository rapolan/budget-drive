import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ModalShell } from './ModalShell';

afterEach(cleanup);

describe('ModalShell', () => {
  it('puts overflow-y-auto and rounded-3xl on the SAME element - scroll and rounding never split across two elements', () => {
    const { container } = render(
      <ModalShell maxWidth="max-w-2xl">
        <div>content</div>
      </ModalShell>
    );

    const scrollingCard = container.querySelector('.overflow-y-auto');
    expect(scrollingCard).not.toBeNull();
    expect(scrollingCard).toHaveClass('rounded-3xl');
  });

  it('backdrop is blurred and dimmed, matching the create-student modal (not the old darker, unblurred booking-modal backdrop)', () => {
    const { container } = render(
      <ModalShell maxWidth="max-w-2xl">
        <div>content</div>
      </ModalShell>
    );

    const backdrop = container.firstElementChild;
    expect(backdrop).toHaveClass('bg-black/40');
    expect(backdrop).toHaveClass('backdrop-blur-[2px]');
  });

  it('applies the caller-supplied maxWidth to the scrolling card', () => {
    const { container } = render(
      <ModalShell maxWidth="max-w-3xl">
        <div>content</div>
      </ModalShell>
    );

    expect(container.querySelector('.overflow-y-auto')).toHaveClass('max-w-3xl');
  });

  it('forwards contentRef to the scrolling card element', () => {
    let ref: HTMLDivElement | null = null;
    render(
      <ModalShell maxWidth="max-w-2xl" contentRef={(el) => { ref = el; }}>
        <div>content</div>
      </ModalShell>
    );

    expect(ref).not.toBeNull();
    expect(ref!).toHaveClass('overflow-y-auto');
  });
});
