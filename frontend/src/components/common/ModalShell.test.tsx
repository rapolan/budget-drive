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

  it('backdrop is dimmed, matching the create-student modal (not the old darker, unblurred booking-modal backdrop)', () => {
    const { container } = render(
      <ModalShell maxWidth="max-w-2xl">
        <div>content</div>
      </ModalShell>
    );

    const backdrop = container.firstElementChild;
    expect(backdrop).toHaveClass('bg-black/40');
  });

  // Regression: the overlay used to also carry backdrop-blur-[2px],
  // assumed cheap because nothing visibly scrolls behind a fixed,
  // full-viewport element - measured via a real CDP performance trace to
  // be false. A backdrop-filter element keeps a live composited blur
  // surface for as long as it exists, and every frame the browser redraws
  // (including one driven by scrolling the modal's own content on top of
  // it) pays to re-raster/re-composite that surface. Traced on a
  // ~2,000-row seeded tenant: every modal using this overlay dropped
  // frames during an internal scroll with the blur present (9-18 dropped
  // frames per 20-step scroll) and dropped zero with it removed.
  it('does not blur the fixed overlay - a live backdrop-filter surface costs a frame recomposite even when only the modal content on top of it is scrolling', () => {
    const { container } = render(
      <ModalShell maxWidth="max-w-2xl">
        <div>content</div>
      </ModalShell>
    );

    const backdrop = container.firstElementChild;
    expect(backdrop?.className).not.toMatch(/backdrop-blur/);
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
