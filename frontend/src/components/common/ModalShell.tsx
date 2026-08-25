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
 * No backdrop-click-to-close - StudentModal never had one, so this
 * doesn't introduce new behavior.
 */
export const ModalShell: React.FC<ModalShellProps> = ({ children, maxWidth, contentRef }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
      <div
        ref={contentRef}
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-3xl bg-surface/80 backdrop-blur-3xl shadow-[0_4px_40px_-5px_rgba(0,0,0,0.2)] border border-edge-glass/60`}
      >
        {children}
      </div>
    </div>
  );
};
