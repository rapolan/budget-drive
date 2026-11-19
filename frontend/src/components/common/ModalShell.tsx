import React from 'react';

interface ModalShellProps {
  children: React.ReactNode;
  // Callers size themselves: StudentModal uses max-w-2xl, the
  // SmartBookingForm wrapper uses max-w-3xl.
  maxWidth: string;
  // StudentModal needs a ref to its own scroll container for its
  // internal scroll-to-section behavior (scrollSectionIntoView). Optional
  // since most callers (SmartBookingForm's wrapper) don't need it -
  // SmartBookingForm instead finds its scroll ancestor itself via
  // `.closest('.overflow-y-auto')`, which keeps working unchanged since
  // that class still lives on this same element either way.
  contentRef?: React.Ref<HTMLDivElement>;
}

/**
 * Shared modal chrome: dimmed+blurred backdrop, and a single rounded,
 * glassy card that is ALSO the scroll container (overflow-y-auto and
 * rounded-3xl on the same element) - the scrollbar rides inside the
 * card's own rounded corners instead of a separate square wrapper
 * clipping nothing. This is the exact pattern StudentModal already used
 * correctly; the SmartBookingForm wrapper (Lessons.tsx/Students.tsx) had
 * drifted from it - split scroll and rounding across two different
 * elements one layer apart, and used a darker, unblurred backdrop - which
 * is what made its modal look chrome-broken next to StudentModal's.
 *
 * The scrollable card itself used to ALSO carry backdrop-blur-3xl, which
 * forces a blur recomposite on every scroll frame - removed in favor of a
 * higher-opacity solid background (bg-surface/95) that reads the same
 * "glassy but readable" way without the compositing cost.
 *
 * The fixed, non-scrolling overlay's own backdrop-blur-[2px] was assumed
 * cheap (nothing scrolls behind a fixed, full-viewport element, so the
 * reasoning went that the browser blurs it once per modal-open, not per
 * frame) - that assumption was WRONG, measured directly via a real CDP
 * performance trace (see the lesson-edit-redesign investigation notes in
 * docs/ARCHITECTURE.md) after a user report that scrolling was still
 * janky even after the card's own blur was removed. A backdrop-filter
 * element keeps a LIVE composited blur surface for as long as it exists,
 * independent of whether the pixels behind it are changing - any frame
 * the browser redraws (including one driven by scrolling the modal's own
 * content on top of it) pays to re-raster and re-composite that surface,
 * and that cost scales with how complex the page behind the modal is (a
 * large seeded tenant's Lessons table, in this case). Traced on a
 * ~2,000-row tenant: with this blur present, every modal tested
 * (lesson-edit, StudentModal, SmartBookingForm) dropped frames during an
 * internal scroll (9-18 dropped frames per 20-step scroll, 51-68ms max
 * frame time); with it removed, all three measured a clean 0 dropped
 * frames and ~16.3ms average frame time (the 60fps budget) with no other
 * change. Removed entirely - the dim backdrop (bg-black/40) alone is kept
 * for the same visual separation without the live blur surface.
 *
 * No backdrop-click-to-close - StudentModal never had one, so this
 * doesn't introduce new behavior.
 */
export const ModalShell: React.FC<ModalShellProps> = ({ children, maxWidth, contentRef }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={contentRef}
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-3xl bg-surface/95 shadow-[0_4px_40px_-5px_rgba(0,0,0,0.2)] border border-edge-glass/60`}
      >
        {children}
      </div>
    </div>
  );
};
