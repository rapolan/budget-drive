import React from 'react';

interface AuthPageShellProps {
  children: React.ReactNode;
  maxWidth?: string;
  /** Rendered below the glass card, inside the same centered column (e.g. a "finish later" link). */
  footer?: React.ReactNode;
}

/**
 * Shared page background + glass card for the signup/login/onboarding
 * surface - the one part of the app with no AppLayout chrome around it.
 * Replaces the old bg-gradient-to-br from-blue-50 to-indigo-100 (light-
 * only, illegible in dark mode - see the earlier contrast fix commit)
 * with a theme-aware wash built from existing tokens (--bg-base-rgb,
 * the tenant's own --color-primary-rgb), so it never needs a light/dark
 * split of its own and stays on-brand per tenant automatically.
 *
 * The card reuses ModalShell's exact glass recipe (bg-surface/80
 * backdrop-blur-3xl, border-edge-glass/60, the same shadow) rather than
 * inventing a second one - this IS that recipe, just not wrapped in a
 * fixed-overlay modal positioning, since these are full pages, not
 * modals over other content.
 */
export const AuthPageShell: React.FC<AuthPageShellProps> = ({ children, maxWidth = 'max-w-md', footer }) => {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 py-10 bg-appbg"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 80% 60% at 50% -10%, rgb(var(--color-primary-rgb) / 0.12), transparent), ' +
          'radial-gradient(ellipse 60% 50% at 100% 100%, rgb(var(--color-primary-rgb) / 0.08), transparent)',
      }}
    >
      <div className={`w-full ${maxWidth}`}>
        <div className="rounded-3xl bg-surface/80 backdrop-blur-3xl shadow-[0_4px_40px_-5px_rgba(0,0,0,0.2)] border border-edge-glass/60 p-8">
          {children}
        </div>
        {footer}
      </div>
    </div>
  );
};
